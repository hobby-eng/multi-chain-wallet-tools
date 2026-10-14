/**
 * AUD-028 bounded security reproductions; coordinator execution only.
 *
 * Requires the repository's Vitest aliases, Node environment, __DASH_COMMUNITY__ = false,
 * and an audit include rule for this file. Run serially with the coordinator's lock and
 * NODE_OPTIONS=--max-old-space-size=1536. This file has not been executed by its author.
 *
 * No browser, provider, age encryption, KDF, or WASM engine runs. SDK call fixtures are
 * parsed, never imported/executed, and are removed from their disposable temporary directory.
 * The fake File exposes size/arrayBuffer/slice: its 1 GiB size is metadata only; every read
 * returns three invalid-header bytes. The fake DOM implements only the EventTarget and
 * hidden/disabled/value/textContent/files interfaces consumed by CandidateListPanel.
 *
 * Cleanup probes call real scanEncryptedPage/scanDashShielded entry points. hexToBytes uses
 * the real decoder with capture added; engine initialization/validation are no-ops and engine
 * scanning/derivation failures are controlled stubs. They establish ownership on an injected
 * exception, not real WASM failure frequency, browser erasure, or provider exploitability.
 *
 * Assertions require secure behavior and are deliberately NOT test.fails/expected failures.
 * Metadata describes observed behavior before harness cleanup; a recorded insecure result
 * is not a passing assertion. Captured synthetic buffers are wiped by the harness afterward.
 * AUD-028_SECURITY_PROBE_METADATA stdout and task.meta.auditSecurityProbe are supplemental;
 * the coordinator's Vitest reporter/exit code remains authoritative for test outcomes.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findEvoWriteCalls } from "../../../tooling/verify-evo-read-only.mjs";
import { CandidateListImport } from "../../../apps/discovery-scanner/src/candidate-list-import.js";
import { CandidateListPanel } from "../../../apps/discovery-scanner/src/candidate-list-panel.js";
import { scanDashShielded } from "../../../apps/discovery-scanner/src/coins/dash/shielded-scanner.js";
import { scanEncryptedPage } from "../../../packages/dash-network/src/orchard-scanner.js";
import type { RecoveryScanConfig } from "../../../apps/discovery-scanner/src/types.js";
import type { RecoveryNetworkGateway } from "../../../apps/discovery-scanner/src/network-gateway.js";

const trace = vi.hoisted(() => ({
  // 96 counting bytes match an FVK's serialized width; no real wallet material is used.
  keyHex: Array.from({ length: 96 }, (_, index) => index.toString(16).padStart(2, "0")).join(""),
  keys: [] as Uint8Array[],
  seedCopies: [] as Uint8Array[],
  ownedByHarness: [] as Uint8Array[],
  deriveThrows: true,
  scanCalls: 0,
}));

const SCAN_FAILURE = "AUD-028 synthetic engine scan failure";
const DERIVE_FAILURE = "AUD-028 synthetic engine derivation failure";
const REGISTER_FAILURE = "AUD-028 synthetic secret registration failure";

vi.mock("age-encryption", () => {
  const forbidden = (): never => {
    throw new Error("AUD-028 forbids age encryption and KDF execution in this probe.");
  };
  class ForbiddenAgeEngine {
    constructor() {
      forbidden();
    }
  }
  return {
    Decrypter: ForbiddenAgeEngine,
    Encrypter: ForbiddenAgeEngine,
    generateX25519Identity: forbidden,
    identityToRecipient: forbidden,
  };
});

vi.mock("@ckd/core/crypto.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("@ckd/core/crypto.js")>();
  return {
    ...real,
    hexToBytes: (hex: string): Uint8Array => {
      const bytes = real.hexToBytes(hex);
      if (hex === trace.keyHex) trace.keys.push(bytes);
      return bytes;
    },
  };
});

vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("@ckd/dash-wasm/dash_shielded_wasm.js", () => {
  const scan = (): never => {
    trace.scanCalls += 1;
    throw new Error("AUD-028 synthetic engine scan failure");
  };
  return {
    initSync: () => undefined,
    validate_full_viewing_key: () => undefined,
    validate_incoming_viewing_key: () => undefined,
    validate_outgoing_viewing_key: () => undefined,
    scan_shielded_batch_json: scan,
    scan_shielded_incoming_batch_json: scan,
    scan_shielded_outgoing_batch_json: scan,
    derive_shielded_json: () => {
      throw new Error("Unexpected low-level derivation in AUD-028 probe.");
    },
  };
});

vi.mock("@ckd/coins/dash/shielded.js", () => ({
  deriveDashShielded: ({ seed }: { seed: Uint8Array }) => {
    trace.seedCopies.push(seed);
    if (trace.deriveThrows) throw new Error("AUD-028 synthetic engine derivation failure");
    return {
      id: "audit-synthetic",
      title: "Audit synthetic result",
      networkLabel: "testnet",
      pathTemplate: "audit-synthetic",
      basicSummary: [],
      summary: [
        { key: "fullViewingKey", label: "Audit synthetic FVK", value: trace.keyHex, secret: true },
      ],
      rows: [],
      notices: [],
    };
  },
}));

const root = fileURLToPath(new URL("../../../", import.meta.url));
const REVIEWED_HEAD = "c5b62c2d489e7525326071128095ba95ecca92ac";
const BASELINE_FINGERPRINT = "dca9cc0b259bf11b00fa0e65a5c7068e279feae63aeab25618f71e52d63ba06b";
const EXPECTED_SOURCE_HASHES = {
  "tooling/verify-evo-read-only.mjs":
    "0eb7a73f4a3560656758ae9c08372b1427d23c1fd515d6e6b9addca5d821a754",
  "apps/discovery-scanner/src/candidate-list-import.ts":
    "41300d8037224dbb21e63143c904b0394b90c0c5791463ca456ece14eac79904",
  "apps/discovery-scanner/src/candidate-list-panel.ts":
    "9737e3d23562fa9cc114722c1c577db84950c83b907cefc29f86361754dcd6a8",
  "packages/recovery-mnemocode/source/core/candidate-encryption.ts":
    "12e2316d1afd6e95defd65d3c9a0c0bb0acb698f6bc4863bd9911b50112707f0",
  "packages/recovery-mnemocode/source/core/candidate-list.ts":
    "8896fb774ccc99dcafee24703fdab9f8c619033a1e6296fc21e34ff3db9f1f0a",
  "packages/dash-network/src/orchard-scanner.ts":
    "ad64797923ef9eef8962d99a94c2cc854360f87b8fe78ea9d27b6d891ef4ecad",
  "apps/discovery-scanner/src/coins/dash/shielded-scanner.ts":
    "457e123256e6e606df99719f7051f031f4dc0ce7d1207cb1a11faff1711a6ce3",
} as const;

const records: Record<string, unknown>[] = [];
let observations: Record<string, unknown> = {};
let sourceBindings: Record<string, unknown> = {};
export let lastSecurityProbeMetadata: Record<string, unknown> | null = null;

beforeAll(() => {
  sourceBindings = Object.fromEntries(
    Object.entries(EXPECTED_SOURCE_HASHES).map(([path, expected]) => {
      const actual = createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex");
      return [path, { expected, actual, matchesReviewedSource: expected === actual }];
    }),
  );
});

beforeEach(({ onTestFinished }) => {
  observations = {};
  trace.keys.length = 0;
  trace.seedCopies.length = 0;
  trace.ownedByHarness.length = 0;
  trace.deriveThrows = true;
  trace.scanCalls = 0;
  const network = vi.fn(() => {
    throw new Error("AUD-028 forbids provider/network calls in this probe.");
  });
  vi.stubGlobal("fetch", network);
  onTestFinished(({ task }) => {
    lastSecurityProbeMetadata = {
      test: task.name,
      state: task.result?.state ?? "unknown",
      recordedAtUtc: new Date().toISOString(),
      observations: { ...observations },
      fetchCalls: network.mock.calls.length,
      observedBeforeHarnessCleanup: true,
    };
    Object.assign(task.meta, { auditSecurityProbe: lastSecurityProbeMetadata });
    records.push(lastSecurityProbeMetadata);
    // Never leave even synthetic secret buffers retained after a failing safety assertion.
    for (const bytes of [...trace.keys, ...trace.seedCopies, ...trace.ownedByHarness])
      bytes.fill(0);
    vi.unstubAllGlobals();
  });
});

afterAll(() => {
  console.info(
    "AUD-028_SECURITY_PROBE_METADATA " +
      JSON.stringify({
        auditId: "AUD-028",
        reviewedHead: REVIEWED_HEAD,
        coordinatorBaselineFingerprint: BASELINE_FINGERPRINT,
        sourceBindings,
        results: records,
        lastTest: lastSecurityProbeMetadata,
        limits: {
          actualFileBytesPerRead: 3,
          reportedFileBytes: REPORTED_OVERSIZED_FILE_BYTES,
          wasmExecution: false,
          kdfExecution: false,
          browserExecution: false,
          sdkFixturesExecuted: false,
        },
      }),
  );
});

const GATE_FIXTURES = {
  direct: "sdk.addresses.transfer({});",
  cast: "(sdk as any).addresses.transfer({});",
  typeAssertion: "(<any>sdk).addresses.transfer({});",
  satisfies: "(sdk satisfies any).addresses.transfer({});",
  readOnly: "sdk.addresses.getWithProof('public-synthetic-address');",
} as const;

describe("AUD-028 real read-only analyzer", () => {
  let directory: string | undefined;
  let findings: Array<{ path: string; line: number; column: number; description: string }> = [];
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "aud-028-security-gate-"));
    const paths = Object.entries(GATE_FIXTURES).map(([name, call]) => {
      const path = join(directory!, `${name}.ts`);
      writeFileSync(path, `declare const sdk: any;\n${call}\n`);
      return path;
    });
    findings = findEvoWriteCalls(paths, root);
  });
  afterAll(() => {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  });
  it.each(["direct", "cast", "typeAssertion", "satisfies"] as const)(
    "rejects known addresses.transfer behind %s syntax",
    (name) => {
      const selected = findings.filter(({ path }) => path === join(directory!, `${name}.ts`));
      observations = {
        fixture: `declare const sdk: any;\n${GATE_FIXTURES[name]}`,
        detected: selected.map(({ line, column, description }) => ({ line, column, description })),
      };
      expect(selected).toHaveLength(1);
      expect(selected[0]).toMatchObject({
        line: 2,
        description: "write-capable addresses.transfer facade",
      });
    },
  );
  it("accepts a known read-only facade control", () => {
    const selected = findings.filter(({ path }) => path === join(directory!, "readOnly.ts"));
    observations = { detectedCount: selected.length };
    expect(selected).toHaveLength(0);
  });
});

/** Intentionally beyond any valid MNCL file size, without allocating that amount. */
const REPORTED_OVERSIZED_FILE_BYTES = 1024 ** 3;
class TinyOversizedFile {
  readonly size = REPORTED_OVERSIZED_FILE_BYTES;
  readonly name = "audit-synthetic-oversized.age";
  readonly arrayBuffer = vi.fn(async () => Uint8Array.of(1, 2, 3).buffer);
  readonly slice = vi.fn((_start?: number, _end?: number) => new Blob([Uint8Array.of(1, 2, 3)]));
}

class FakeControl extends EventTarget {
  hidden = false;
  disabled = false;
  value = "";
  textContent = "";
  files: TinyOversizedFile[] = [];
  click(): void {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
}

function panel() {
  const selectors = [
    "#candidate-list-key",
    "#candidate-list-key-note",
    "#candidate-list-file",
    "#candidate-list-passphrase-field",
    "#candidate-list-passphrase",
    "#candidate-list-remove",
    "#candidate-list-status",
    "#batch-input .batch-grid",
    "#candidate-list-show-key",
    "#candidate-list-open",
  ];
  const controls = new Map(selectors.map((selector) => [selector, new FakeControl()]));
  const get = (selector: string): FakeControl => {
    const control = controls.get(selector);
    if (control === undefined) throw new Error(`Missing audit fake control ${selector}.`);
    return control;
  };
  const realPanel = new CandidateListPanel(
    CandidateListImport,
    <T extends HTMLElement>(selector: string) => get(selector) as unknown as T,
    () => undefined,
  );
  realPanel.setEnabled(true);
  return {
    realPanel,
    file: get("#candidate-list-file"),
    open: get("#candidate-list-open"),
    status: get("#candidate-list-status"),
  };
}

describe("AUD-028 real candidate-list admission", () => {
  it("rejects oversized metadata before the importer reads the whole file", async () => {
    const file = new TinyOversizedFile();
    const importer = new CandidateListImport();
    try {
      const result = await importer.open(file);
      observations.resultWasUndefined = result === undefined;
    } catch (cause) {
      observations.rejected = cause instanceof Error;
    } finally {
      observations.fullFileReads = file.arrayBuffer.mock.calls.length;
      observations.retainedCandidates = importer.count;
      importer.clear();
    }
    expect(importer.count).toBe(0);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("inspects or refuses an oversized selection without reading the whole file", async () => {
    const file = new TinyOversizedFile();
    const page = panel();
    page.file.files = [file];
    page.file.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(page.status.textContent).not.toBe(""), {
      timeout: 200,
      interval: 5,
    });
    observations = {
      fullFileReads: file.arrayBuffer.mock.calls.length,
      boundedSliceReads: file.slice.mock.calls.length,
      candidateSourceAbsent: page.realPanel.source === undefined,
    };
    page.realPanel.close();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects an oversized Open action before the whole-file read", async () => {
    const file = new TinyOversizedFile();
    const page = panel();
    // Selection is tested separately; this exercises the real Open listener without another read.
    page.file.files = [file];
    page.open.click();
    await vi.waitFor(() => expect(page.open.disabled).toBe(false), { timeout: 200, interval: 5 });
    observations = {
      fullFileReads: file.arrayBuffer.mock.calls.length,
      candidateSourceAbsent: page.realPanel.source === undefined,
    };
    page.realPanel.close();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
});

function note() {
  return {
    cmx: new Uint8Array(32).fill(1),
    nullifier: new Uint8Array(32).fill(2),
    cvNet: new Uint8Array(32).fill(3),
    encryptedNote: new Uint8Array(216).fill(4),
  };
}

function keyCleanupObservation(): void {
  observations = {
    capturedKeyCount: trace.keys.length,
    capturedKeyBytes: trace.keys[0]?.length ?? 0,
    nonzeroKeyBytes: trace.keys[0]?.filter((byte) => byte !== 0).length ?? 0,
    engineScanCalls: trace.scanCalls,
  };
}

describe("AUD-028 real Orchard exception cleanup", () => {
  it.each(["cmx", "nullifier", "cvNet", "encryptedNote"] as const)(
    "wipes decoded viewing material after invalid %s width",
    (field) => {
      const malformed = note();
      malformed[field] = Uint8Array.of(1);
      expect(() =>
        scanEncryptedPage({ kind: "full", hex: trace.keyHex }, 0n, [malformed], "testnet"),
      ).toThrow(`DAPI returned ${field} with an invalid byte length.`);
      keyCleanupObservation();
      expect(trace.keys).toHaveLength(1);
      expect(trace.scanCalls).toBe(0);
      expect(trace.keys[0]!.every((byte) => byte === 0)).toBe(true);
    },
  );

  it("wipes decoded viewing material on the in-scope engine-error control", () => {
    const callerNote = note();
    expect(() =>
      scanEncryptedPage({ kind: "full", hex: trace.keyHex }, 0n, [callerNote], "testnet"),
    ).toThrow(SCAN_FAILURE);
    keyCleanupObservation();
    expect(trace.keys).toHaveLength(1);
    expect(trace.scanCalls).toBe(1);
    expect(trace.keys[0]!.every((byte) => byte === 0)).toBe(true);
    expect(callerNote.cmx.every((byte) => byte === 1)).toBe(true);
  });

  it.each([true, false])(
    "wipes its seed copy when derivation throws=%s while preserving caller ownership",
    async (deriveThrows) => {
      trace.deriveThrows = deriveThrows;
      // A BIP39 seed has 64 bytes; these are counting synthetic bytes, not a derived secret.
      const callerSeed = Uint8Array.from({ length: 64 }, (_, index) => index + 1);
      trace.ownedByHarness.push(callerSeed);
      const guard = {
        registerString: () => {
          throw new Error(REGISTER_FAILURE);
        },
      };
      // The failure is before streaming. Only scanShieldedPool/network/account are consumed.
      const config = {
        scanShieldedPool: true,
        network: "testnet",
        account: 0,
      } as RecoveryScanConfig;
      const gateway = { guard } as unknown as RecoveryNetworkGateway;
      await expect(
        scanDashShielded(
          "audit-input",
          callerSeed,
          config,
          gateway,
          new AbortController().signal,
          () => undefined,
          () => undefined,
        ),
      ).rejects.toThrow(deriveThrows ? DERIVE_FAILURE : REGISTER_FAILURE);
      observations = {
        failureBoundary: deriveThrows ? "deriveDashShielded" : "guard.registerString",
        capturedSeedCopies: trace.seedCopies.length,
        nonzeroCopiedSeedBytes: trace.seedCopies[0]?.filter((byte) => byte !== 0).length ?? 0,
        callerUnchanged: callerSeed.every((byte, index) => byte === index + 1),
      };
      expect(trace.seedCopies).toHaveLength(1);
      expect(trace.seedCopies[0]).not.toBe(callerSeed);
      expect(callerSeed.every((byte, index) => byte === index + 1)).toBe(true);
      expect(trace.seedCopies[0]!.every((byte) => byte === 0)).toBe(true);
    },
  );
});
