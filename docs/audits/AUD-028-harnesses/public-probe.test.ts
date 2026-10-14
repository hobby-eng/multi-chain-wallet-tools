// AUD-028 baseline probes; coordinator execution only. No production/test/vendor edits.
// Reviewed HEAD: c5b62c2d489e7525326071128095ba95ecca92ac, with current dirty source bytes.
// Intended-contract assertions may fail: failures are audit evidence, not fixture expectations.
// Limits: one input/output per PSBT, <253 bytes per wire object, three mocked HTTP responses
// per lookup (each <=2 KiB), and at most two synthetic Orchard actions per ledger.
// No live fetch, browser, SDK initialization, KDF, decryption, PDF, or note-stream execution.
// Public fixture sources: packages/dash-network/tests/platform-address-history.test.ts and
// apps/activity-viewer/tests/activity-viewer-export.test.ts. All other inputs are synthetic.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bech32m } from "@scure/base";
import { DASH_PLATFORM_P2PKH_TYPE } from "@ckd/core/dash-platform-address-facts.js";
import { parsePsbt } from "../../../apps/psbt-inspector/src/psbt.js";
import { analyzeInputSigning } from "../../../apps/psbt-inspector/src/signing-commitments.js";
import {
  parsedTransactionId,
  readTransaction,
} from "../../../apps/psbt-inspector/src/transaction.js";
import { createViewerExport } from "../../../apps/activity-viewer/src/export-text.js";
import type { ViewerSingleExportState } from "../../../apps/activity-viewer/src/export-model.js";
import { queryPlatformAddressHistory } from "../../../packages/dash-network/src/platform-address-history.js";
import { PLATFORM_EXPLORER_ENDPOINTS } from "../../../packages/dash-network/src/platform-explorer.js";
import type { FetchLike } from "../../../packages/dash-network/src/provider-http.js";
import {
  validatePlatformP2pkhAddress,
  type CoreAddressTransaction,
} from "../../../packages/dash-network/src/public-address.js";
import { ShieldedActivityLedger } from "../../../packages/dash-network/src/activity.js";
import type { ShieldedPage, ViewerKeyKind } from "../../../packages/dash-network/src/types.js";

const REVIEWED_SOURCE_SHA256 = {
  "apps/psbt-inspector/src/psbt.ts":
    "1e6fa6fc29e4844d6b824e72f4274e2818757f27955a0f25698ffacc42280c25",
  "apps/psbt-inspector/src/psbt-validation.ts":
    "8277894cec18507e325b33797075082b01cb24a96a854128a0910714e87068a1",
  "apps/psbt-inspector/src/psbt-field-registry.ts":
    "466db34b0dd5cee2abc3ce19803e106d330041c707925c5dcb0411022467376a",
  "apps/psbt-inspector/src/psbt-verification.ts":
    "972ef8757de767a3f08fef33a3f91ba6b3a9633db9da5672168f7640f15e3d8b",
  "apps/psbt-inspector/src/signing-commitments.ts":
    "b2d5633cb07b6a470a0a33b9f07c15c0de3c4dc008b39a3dac86b1312ae29080",
  "apps/psbt-inspector/src/transaction.ts":
    "8f85c095c8c6a4b1d83a3660a4123fa9a99318cd27eec3ec1e91774dbe8ea3e0",
  "apps/psbt-inspector/src/psbt-utxo.ts":
    "fd19238340e826a7fbec27cfa91db93f54eca0fb5b3d9495f6c18d75c9cf917e",
  "apps/activity-viewer/src/export-text.ts":
    "a927d1ee751bc0a6610e76fe57a93a67e266c6ceb5240c61fb04e52e28dae34f",
  "apps/activity-viewer/src/export-json.ts":
    "19f7f69e5c4bed42ca9f1d3e548308d4d5924cec5a2e40fcd5c96f64caa2bcca",
  "apps/activity-viewer/src/export-csv.ts":
    "f61386f39f9de834530bcfc25e2c6f8d1701f13dcf983138a11d88ac0f1e8369",
  "packages/dash-network/src/public-address.ts":
    "4d16afc5846a3e9548bb19a62fcb06a5c417d5449f8112903e45f6e80f75524b",
  "packages/dash-network/src/platform-address-history.ts":
    "444171203601b0793c3e890d0f6e122bc0c1f3957767ff91b6b1e4f340a64ae8",
  "packages/dash-network/src/activity.ts":
    "c505d482106602c2bb3cfc93fa6c9e4653d564ec0e1776ec88c3c464fcc99585",
} as const;

const GENERATED_AT = new Date("2026-09-01T21:30:00.000Z");
const PSBT_MAGIC = Buffer.from("70736274ff", "hex");
const FINAL_SEQUENCE = 0xffffffff;
const HASH_BYTES = 32;
const COMPACT_SIZE_SINGLE_BYTE_LIMIT = 0xfd;
const OP_TRUE = Buffer.from([0x51]);

function u32(value: number): Buffer {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(value);
  return result;
}

function smallLength(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value >= COMPACT_SIZE_SINGLE_BYTE_LIMIT)
    throw new Error("Audit fixture exceeds its single-byte CompactSize limit.");
  return Buffer.from([value]);
}

function psbtField(type: number, value: Buffer): Buffer {
  return Buffer.concat([smallLength(1), Buffer.from([type]), smallLength(value.length), value]);
}

function psbtMap(fields: readonly Buffer[]): Buffer {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

// Literal transaction geometry follows Bitcoin legacy framing and DIP2's version/type header.
function transaction(
  options: {
    header?: Buffer;
    previousHash?: Buffer;
    previousIndex?: number;
    scriptSig?: Buffer;
    amount?: bigint;
  } = {},
): Buffer {
  const scriptSig = options.scriptSig ?? Buffer.alloc(0);
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(options.amount ?? 0n);
  return Buffer.concat([
    options.header ?? u32(2),
    smallLength(1),
    options.previousHash ?? Buffer.alloc(HASH_BYTES),
    u32(options.previousIndex ?? 0),
    smallLength(scriptSig.length),
    scriptSig,
    u32(FINAL_SEQUENCE),
    smallLength(1),
    amount,
    smallLength(OP_TRUE.length),
    OP_TRUE,
    u32(0),
  ]);
}

function v0Psbt(unsigned: Buffer, inputFields: readonly Buffer[] = []): string {
  return Buffer.concat([
    PSBT_MAGIC,
    psbtMap([psbtField(0x00, unsigned)]),
    psbtMap(inputFields),
    psbtMap([]),
  ]).toString("hex");
}

function doubleSha256(bytes: Buffer): Buffer {
  const first = createHash("sha256").update(bytes).digest();
  return createHash("sha256").update(first).digest();
}

function psbtSpending(previous: Buffer): string {
  return v0Psbt(transaction({ previousHash: doubleSha256(previous) }), [psbtField(0x00, previous)]);
}

// DIP4 CbTx v1 shape: uint16 version, uint32 height, 32-byte MN-list merkle root.
// These are framing fixtures, not a claim of consensus-valid coinbase contents.
const COINBASE_PAYLOAD = Buffer.concat([Buffer.from([1, 0]), u32(1), Buffer.alloc(HASH_BYTES)]);
const SPECIAL_TRANSACTION_BODY = transaction({
  header: Buffer.from("03000500", "hex"),
  previousIndex: FINAL_SEQUENCE,
  scriptSig: Buffer.from("5151", "hex"),
  amount: 1n,
});
const VALID_SPECIAL_WIRE = Buffer.concat([
  SPECIAL_TRANSACTION_BODY,
  smallLength(COINBASE_PAYLOAD.length),
  COINBASE_PAYLOAD,
]);
const BAD_SPECIAL_WIRES = [
  [
    "truncated payload",
    Buffer.concat([
      SPECIAL_TRANSACTION_BODY,
      smallLength(COINBASE_PAYLOAD.length + 1),
      COINBASE_PAYLOAD,
    ]),
  ],
  [
    "nonminimal payload length",
    Buffer.concat([
      SPECIAL_TRANSACTION_BODY,
      Buffer.from([0xfd, COINBASE_PAYLOAD.length, 0]),
      COINBASE_PAYLOAD,
    ]),
  ],
  ["trailing payload byte", Buffer.concat([VALID_SPECIAL_WIRE, Buffer.from([0])])],
] as const;

// This decoder is audit-local because the existing export test's decoder is private and those
// files are read-only. It reads the actual serialized CSV, not the producer's intermediate rows.
function csvRecords(state: ViewerSingleExportState): Record<string, string>[] {
  const text = createViewerExport(state, "csv", GENERATED_AT).text.replace(/^\uFEFF/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  expect(quoted, "CSV must close quoted cells").toBe(false);
  expect(row, "CSV must end with its declared newline").toEqual([]);
  const header = rows.shift()!;
  expect(new Set(header).size, "CSV column names must be unique").toBe(header.length);
  return rows.map((cells) => {
    expect(cells.length, "CSV rows must be rectangular").toBe(header.length);
    return Object.fromEntries(header.map((name, index) => [name, cells[index]!]));
  });
}

function coreState(pending = false): Extract<ViewerSingleExportState, { mode: "core" }> {
  const tx: CoreAddressTransaction = {
    txid: "ab".repeat(HASH_BYTES),
    type: "CLASSIC",
    timestampMs: pending ? null : GENERATED_AT.getTime(),
    blockHeight: pending ? null : 9,
    confirmations: pending ? 0 : 2,
    instantLocked: false,
    chainLocked: false,
    receivedDuffs: 5n,
    spentInputDuffs: 0n,
    netDuffs: 5n,
    feeDuffs: null,
    blockHash: pending ? null : "cd".repeat(HASH_BYTES),
  };
  return {
    mode: "core",
    network: "mainnet",
    snapshot: {
      kind: "core",
      provider: "DashScan",
      address: "Xexample",
      network: "mainnet",
      balanceDuffs: 5n,
      unconfirmedDuffs: 2n,
      totalReceivedDuffs: 10n,
      totalSentDuffs: 7n,
      transactionCount: pending ? 0 : 1,
      transactions: [tx],
      historyLimit: 20,
      endpoint: "https://example.invalid",
      indexStatus: "ok",
      indexedHeight: 10,
      indexedTimeMs: GENERATED_AT.getTime(),
      requests: 4,
    },
  };
}

const PLATFORM_ADDRESS = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";
// Another synthetically encoded DIP18 address; no private key or derived wallet is involved.
const OTHER_PLATFORM_ADDRESS = bech32m.encode(
  "dash",
  bech32m.toWords(Buffer.concat([Buffer.from([DASH_PLATFORM_P2PKH_TYPE]), Buffer.alloc(20, 0x22)])),
);
const MOCK_REQUEST_LIMIT = 3;
const MOCK_BODY_BYTE_LIMIT = 2048;

function platformMock(infoAddress = PLATFORM_ADDRESS, network = "evo1") {
  const endpoint = PLATFORM_EXPLORER_ENDPOINTS.mainnet;
  const infoUrl = `${endpoint}/platformAddress/${PLATFORM_ADDRESS}/info`;
  const transitionsUrl = `${endpoint}/platformAddress/${PLATFORM_ADDRESS}/transitions?page=1&limit=20&order=desc`;
  const bodies = new Map<string, unknown>([
    [
      `${endpoint}/status`,
      {
        network,
        indexer: { status: "synced", syncProgress: 100 },
        api: { block: { height: 426_096, timestamp: "2026-09-01T20:03:54.205Z" } },
      },
    ],
    [
      infoUrl,
      {
        base58Address: "Xexample",
        bech32mAddress: infoAddress,
        totalTxs: 1,
        incomingTxs: 1,
        outgoingTxs: 0,
        nonce: 0,
        balance: "800",
        totalIncomingAmount: "1000",
        totalOutgoingAmount: null,
      },
    ],
    [
      transitionsUrl,
      {
        resultSet: [
          {
            hash: "AB".repeat(HASH_BYTES),
            blockHash: "CD".repeat(HASH_BYTES),
            blockHeight: 426_000,
            type: "ADDRESS_FUNDING_FROM_ASSET_LOCK",
            batchType: null,
            timestamp: "2026-09-01T19:03:54.205Z",
            gasUsed: 15_000,
            status: "SUCCESS",
            error: null,
            incoming: true,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      },
    ],
  ]);
  const requests: string[] = [];
  const fetcher: FetchLike = async (url) => {
    requests.push(url);
    if (requests.length > MOCK_REQUEST_LIMIT || !bodies.has(url))
      throw new Error("Audit mock rejected an unexpected or excessive request.");
    const body = JSON.stringify(bodies.get(url));
    if (Buffer.byteLength(body) > MOCK_BODY_BYTE_LIMIT)
      throw new Error("Audit mock exceeded its response-body limit.");
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetcher, requests };
}

// One normalized scanner match, without running WASM or checking synthetic ciphertext/proofs.
// Orchard encodings use 32-byte commitments/nullifiers and 580-byte encrypted note bodies.
function orchardLedger(kind: ViewerKeyKind = "full", spent = false): ShieldedActivityLedger {
  const ledger = new ShieldedActivityLedger(kind);
  const nullifier = "ee".repeat(HASH_BYTES);
  const page = (actionNullifier: string): ShieldedPage => ({
    notes: [
      {
        cmx: Buffer.alloc(HASH_BYTES, 0xab),
        nullifier: Buffer.from(actionNullifier, "hex"),
        cvNet: Buffer.alloc(HASH_BYTES),
        encryptedNote: Buffer.alloc(580),
      },
    ],
    proofHeight: 1n,
    coreChainLockedHeight: 1,
    timeMs: BigInt(GENERATED_AT.getTime()),
    protocolVersion: 1,
  });
  ledger.applyPage(0n, page("cd".repeat(HASH_BYTES)), [
    {
      position: 0n,
      cmx: "ab".repeat(HASH_BYTES),
      actionNullifier: "cd".repeat(HASH_BYTES),
      incoming: {
        value: 123n,
        addressRaw: "11".repeat(43),
        address: "synthetic-orchard-address",
        memoHex: "",
        memo: "",
        ...(kind === "full" ? { noteNullifier: nullifier } : {}),
      },
    },
  ]);
  if (spent) ledger.applyPage(1n, page(nullifier), []);
  return ledger;
}

function orchardCsv(complete: boolean, kind: ViewerKeyKind = "full", spent = false) {
  return csvRecords({
    mode: "shielded",
    network: "mainnet",
    snapshot: orchardLedger(kind, spent).snapshot(complete),
  });
}

const deniedLiveFetch = vi.fn(async () => {
  throw new Error("AUD-028 public probe forbids live network requests.");
});
beforeEach(() => {
  deniedLiveFetch.mockClear();
  vi.stubGlobal("fetch", deniedLiveFetch);
});
afterEach(() => {
  try {
    expect(deniedLiveFetch, "No probe may use global fetch").not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("binds public probes to the recorded dirty source bytes", () => {
  const root = new URL("../../../", import.meta.url);
  for (const [path, expected] of Object.entries(REVIEWED_SOURCE_SHA256)) {
    const actual = createHash("sha256")
      .update(readFileSync(new URL(path, root)))
      .digest("hex");
    expect(actual, path).toBe(expected);
  }
});

describe("CHECK-FUN-005: Dash v0 unknown-field semantics", () => {
  it("control: parses the supported v0 maps without asserting a signature or lock requirement", () => {
    const parsed = parsePsbt(v0Psbt(transaction()), "dash");
    expect(parsed.version).toBe(0);
    expect(parsed.outputValues).toEqual([0n]);
    expect(parsed.inputVerification[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "Cryptographic signatures",
          status: "not-applicable",
        }),
        expect.objectContaining({
          relationship: "PSBT v2 locktime requirements",
          status: "not-applicable",
        }),
      ]),
    );
    expect(analyzeInputSigning(parsed, 0).signature).toBe(
      "No signature or final-script fields supplied",
    );
  });

  it.each([
    ["0x11", 0x11],
    ["0x13", 0x13],
  ] as const)("unknown Dash field %s cannot change semantic conclusions", (_label, type) => {
    const baseline = parsePsbt(v0Psbt(transaction()), "dash");
    const parsed = parsePsbt(v0Psbt(transaction(), [psbtField(type, Buffer.alloc(0))]), "dash");
    expect(parsed.inputs[0]).toEqual([
      { type: BigInt(type), keyData: new Uint8Array(), value: new Uint8Array() },
    ]);
    expect({ checks: parsed.inputVerification, signing: analyzeInputSigning(parsed, 0) }).toEqual({
      checks: baseline.inputVerification,
      signing: analyzeInputSigning(baseline, 0),
    });
  });

  it.each([
    ["0x11", 0x11, /Invalid input field 17 value length/u],
    ["0x13", 0x13, /Taproot signature must contain 64 or 65 bytes/u],
  ] as const)("control: Bitcoin refuses malformed known field %s", (_label, type, error) => {
    expect(() =>
      parsePsbt(v0Psbt(transaction(), [psbtField(type, Buffer.alloc(0))]), "bitcoin"),
    ).toThrow(error);
  });
});

describe("CHECK-FUN-005: Dash previous-transaction wire framing", () => {
  it("control: reads a length-prefixed special transaction and its exact wire txid", () => {
    const parsed = readTransaction(VALID_SPECIAL_WIRE, "dash");
    expect(parsed).toMatchObject({ version: 3, dashType: 5, lockTime: 0 });
    expect(parsed.outputs[0]?.value).toBe(1n);
    expect(parsedTransactionId(parsed)).toBe(
      doubleSha256(VALID_SPECIAL_WIRE).reverse().toString("hex"),
    );
  });

  it("control: binds that previous wire transaction through the production PSBT input path", () => {
    const parsed = parsePsbt(psbtSpending(VALID_SPECIAL_WIRE), "dash");
    expect(parsed.inputValues).toEqual([1n]);
    expect(parsed.fee).toBe(1n);
    expect(parsed.inputUtxos[0]?.binding).toBe("non-witness");
  });

  it.each(BAD_SPECIAL_WIRES)("readTransaction rejects %s", (_name, bytes) => {
    expect(bytes.length).toBeLessThan(COMPACT_SIZE_SINGLE_BYTE_LIMIT);
    expect(() => readTransaction(bytes, "dash")).toThrow();
  });

  it.each(BAD_SPECIAL_WIRES)("parsePsbt rejects a non-witness UTXO with %s", (_name, bytes) => {
    // Outpoint hash and value are coherent; the required refusal is the malformed wire framing.
    expect(() => parsePsbt(psbtSpending(bytes), "dash")).toThrow();
  });
});

describe("CHECK-FUN-007: Platform history resource binding", () => {
  it("control: accepts the supported info and single-transition response schema", async () => {
    const mock = platformMock();
    const result = await queryPlatformAddressHistory(
      PLATFORM_ADDRESS,
      "mainnet",
      20,
      undefined,
      mock.fetcher,
    );
    expect(mock.requests).toHaveLength(MOCK_REQUEST_LIMIT);
    expect(result).toMatchObject({
      address: PLATFORM_ADDRESS,
      explorerBalanceCredits: 800n,
      totalIncomingCredits: 1000n,
    });
    expect(result.transitions).toHaveLength(1);
  });

  it("rejects a different valid address in info instead of relabeling its history", async () => {
    expect(OTHER_PLATFORM_ADDRESS).not.toBe(PLATFORM_ADDRESS);
    expect(validatePlatformP2pkhAddress(OTHER_PLATFORM_ADDRESS, "mainnet")).toBe(
      OTHER_PLATFORM_ADDRESS,
    );
    const mock = platformMock(OTHER_PLATFORM_ADDRESS);
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, mock.fetcher),
    ).rejects.toThrow(/address|resource/iu);
  });

  it("control: rejects a synchronized response from the wrong network", async () => {
    const mock = platformMock(PLATFORM_ADDRESS, "testnet");
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, mock.fetcher),
    ).rejects.toThrow(/wrong network/u);
    expect(mock.requests).toHaveLength(1);
  });
});

describe("CHECK-API-003: Core exported status and balance semantics", () => {
  it("control: serializes the supported Core object and a confirmed transaction exactly", () => {
    const state = coreState();
    const json = JSON.parse(createViewerExport(state, "json", GENERATED_AT).text);
    expect(json).toMatchObject({
      schema: "wallet-activity-viewer-export",
      version: 2,
      mode: "core",
      network: "mainnet",
    });
    expect(Object.values(json.data.balance)).toEqual(expect.arrayContaining(["5", "2", "10", "7"]));
    const rows = csvRecords(state);
    expect(rows).toHaveLength(2);
    expect(rows.find(({ record_type }) => record_type === "transaction")).toMatchObject({
      status: "confirmed",
      amount_atomic: "5",
    });
  });

  it("exports pending Core activity without a confirmed status", () => {
    const rows = csvRecords(coreState(true));
    const record = rows.find(({ record_type }) => record_type === "transaction")!;
    expect(record.block_height).toBe("");
    expect(["pending", "unconfirmed"]).toContain(record.status);
  });

  it("JSON names reported balance and discrepancy without inventing a confirmation split", () => {
    const json = JSON.parse(createViewerExport(coreState(), "json", GENERATED_AT).text);
    const balance = json.data.balance as Record<string, unknown>;
    expect(balance).not.toHaveProperty("confirmedDuffs");
    expect(balance).not.toHaveProperty("unconfirmedDuffs");
    // Permit neutral field names to evolve; require both exact values and their meanings.
    expect(
      Object.entries(balance).some(
        ([key, value]) => /reported|balance/iu.test(key) && value === "5",
      ),
    ).toBe(true);
    expect(
      Object.entries(balance).some(([key, value]) => /discrepancy/iu.test(key) && value === "2"),
    ).toBe(true);
  });

  it("CSV calls the derived difference a discrepancy rather than unconfirmed funds", () => {
    const row = csvRecords(coreState()).find(
      ({ record_type }) => record_type === "address_summary",
    )!;
    expect(row.amount_atomic).toBe("5");
    expect(row.metadata).not.toContain("unconfirmed_duffs=");
    expect(row.metadata).toMatch(/(?:^| \| )(?:balance_)?discrepancy_duffs=2(?:$| \| )/u);
  });
});

describe("CHECK-API-003: Orchard note status in actual CSV", () => {
  it("control: a complete FVK snapshot can classify an unspent note as spendable", () => {
    const rows = orchardCsv(true);
    expect(rows.find(({ record_type }) => record_type === "scan_summary")?.status).toBe("complete");
    expect(rows.find(({ record_type }) => record_type === "note")).toMatchObject({
      status: "spendable",
      amount_atomic: "123",
    });
  });

  it("an incomplete FVK snapshot does not classify a provisional unspent note as spendable", () => {
    const rows = orchardCsv(false);
    expect(rows.find(({ record_type }) => record_type === "scan_summary")?.status).toBe("partial");
    expect(rows.find(({ record_type }) => record_type === "note")?.status).toBe("unknown");
  });

  it("control: IVK notes have unknown spend state even in a complete snapshot", () => {
    const rows = orchardCsv(true, "incoming");
    expect(rows.find(({ record_type }) => record_type === "note")?.status).toBe("unknown");
    expect(rows.find(({ record_type }) => record_type === "scan_summary")?.amount_atomic).toBe("");
  });

  it("control: an observed nullifier remains a known spend in a partial snapshot", () => {
    const rows = orchardCsv(false, "full", true);
    expect(rows.find(({ record_type }) => record_type === "note")?.status).toBe("spent");
  });
});
