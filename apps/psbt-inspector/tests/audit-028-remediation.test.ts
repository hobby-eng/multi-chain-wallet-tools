import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { parsePsbt, type ParsedPsbt } from "../src/psbt.js";
import { pairName, pairSummary } from "../src/psbt-presentation.js";
import { analyzeInputSigning } from "../src/signing-commitments.js";
import { readTransaction, parsedTransactionId } from "../src/transaction.js";
import { CONSENSUS_LIMITS } from "../src/consensus-limits.js";
import { BITCOIN_ADDRESS_VECTORS } from "../src/self-test-vectors-bitcoin.js";
import {
  DASH_SPECIAL_PAYLOAD,
  DASH_SPECIAL_TRANSACTION_BODY,
  DASH_SPECIAL_WIRE,
  DASH_UNSIGNED_TRANSACTION,
} from "../src/self-test-vectors-dash.js";
import { dashPsbtDecoder } from "../src/self-test-dash.js";
import type { PsbtMapScope } from "../src/psbt-field-registry.js";

const PSBT_MAGIC = Buffer.from("70736274ff", "hex");
const COMPACT_SIZE_SINGLE_BYTE_LIMIT = 0xfd;
const PREVIOUS_HASH_OFFSET = 5; // Four-byte version followed by a one-byte input count.
const specialBody = Buffer.from(DASH_SPECIAL_TRANSACTION_BODY, "hex");
const specialPayload = Buffer.from(DASH_SPECIAL_PAYLOAD, "hex");
const specialWire = Buffer.from(DASH_SPECIAL_WIRE, "hex");

function smallLength(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value >= COMPACT_SIZE_SINGLE_BYTE_LIMIT)
    throw new Error("Regression fixture exceeds its single-byte CompactSize bound.");
  return Buffer.from([value]);
}

function field(
  type: number,
  value: Buffer = Buffer.alloc(0),
  keyData: Buffer = Buffer.alloc(0),
): Buffer {
  const key = Buffer.concat([Buffer.from([type]), keyData]);
  return Buffer.concat([smallLength(key.length), key, smallLength(value.length), value]);
}

function map(fields: readonly Buffer[]): Buffer {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

function v0(
  inputFields: readonly Buffer[] = [],
  globalFields: readonly Buffer[] = [],
  outputFields: readonly Buffer[] = [],
  transaction: Buffer = Buffer.from(DASH_UNSIGNED_TRANSACTION, "hex"),
): string {
  return Buffer.concat([
    PSBT_MAGIC,
    map([field(0, transaction), ...globalFields]),
    map(inputFields),
    map(outputFields),
  ]).toString("hex");
}

function independentHash(transaction: Buffer): Buffer {
  return createHash("sha256").update(createHash("sha256").update(transaction).digest()).digest();
}

function spends(previous: Buffer, inputFields: readonly Buffer[] = []): string {
  const unsigned = Buffer.from(DASH_UNSIGNED_TRANSACTION, "hex");
  // Bind every negative fixture to its exact bytes so a refusal cannot be
  // explained by an unrelated outpoint mismatch.
  independentHash(previous).copy(unsigned, PREVIOUS_HASH_OFFSET);
  return v0([field(0, previous), ...inputFields], [], [], unsigned);
}

function semantics(parsed: ParsedPsbt) {
  return {
    global: parsed.globalVerification,
    inputs: parsed.inputVerification,
    utxos: parsed.inputUtxos,
    fee: parsed.fee,
    signing: analyzeInputSigning(parsed, 0),
  };
}

describe("AUD-028-FUN003 Dash special transaction framing", () => {
  it("consumes the wire length, exposes its payload and binds its exact txid", () => {
    const transaction = readTransaction(specialWire, "dash");
    expect(transaction).toMatchObject({ version: 3, dashType: 5, lockTime: 0 });
    expect(bytesToHex(transaction.extraPayload!)).toBe(DASH_SPECIAL_PAYLOAD);
    expect(parsedTransactionId(transaction)).toBe(
      independentHash(specialWire).reverse().toString("hex"),
    );
    const parsed = parsePsbt(spends(specialWire), "dash");
    expect(parsed.inputValues).toEqual([1n]);
    expect(parsed.fee).toBe(1n);
    expect(parsed.inputUtxos[0]?.binding).toBe("non-witness");
    expect(bytesToHex(parsed.inputUtxos[0]!.previousTransaction!.extraPayload!)).toBe(
      DASH_SPECIAL_PAYLOAD,
    );
  });

  const malformed = [
    ["missing length", specialBody],
    ["truncated payload", specialWire.subarray(0, -1)],
    [
      "nonminimal length",
      Buffer.concat([specialBody, Buffer.from([0xfd, specialPayload.length, 0]), specialPayload]),
    ],
    ["trailing byte", Buffer.concat([specialWire, Buffer.from([0])])],
    ["unprefixed global payload", Buffer.concat([specialBody, specialPayload])],
  ] as const;

  it.each(malformed)(
    "refuses %s through the direct and non-witness UTXO parsers",
    (_label, bytes) => {
      expect(bytes.length).toBeLessThan(COMPACT_SIZE_SINGLE_BYTE_LIMIT);
      expect(() => readTransaction(bytes, "dash")).toThrow();
      expect(() => parsePsbt(spends(bytes), "dash")).toThrow();
    },
  );

  it("preserves the deliberately unprefixed Dash PSBT-global payload representation", () => {
    const unsigned = Buffer.from(DASH_UNSIGNED_TRANSACTION, "hex");
    // DIP2 version 3 / type 5; the global unsigned input must keep its scriptSig empty.
    unsigned.set([3, 0, 5, 0], 0);
    const globalTransaction = Buffer.concat([unsigned, specialPayload]);
    const parsed = parsePsbt(v0([], [], [], globalTransaction), "dash");
    expect(bytesToHex(parsed.transaction!.extraPayload!)).toBe(DASH_SPECIAL_PAYLOAD);
    expect(bytesToHex(parsed.transaction!.raw)).toBe(globalTransaction.toString("hex"));
    expect(() => readTransaction(globalTransaction, "dash")).toThrow();
    const direct = readTransaction(globalTransaction, "dash", false, "psbt-global");
    expect(bytesToHex(direct.extraPayload!)).toBe(DASH_SPECIAL_PAYLOAD);
  });

  it("refuses ordinary trailing bytes and an unbound previous txid", () => {
    const ordinary = Buffer.from(DASH_UNSIGNED_TRANSACTION, "hex");
    expect(readTransaction(ordinary, "dash").extraPayload).toBeNull();
    expect(() => readTransaction(Buffer.concat([ordinary, Buffer.from([0])]), "dash")).toThrow();
    expect(() => parsePsbt(v0([field(0, specialWire)]), "dash")).toThrow(/transaction ID/u);
  });
});

describe("AUD-028-FUN004 Dash passthrough field isolation", () => {
  it("anchors the control to known UTXO, unsigned and locktime conclusions", () => {
    const control = parsePsbt(spends(specialWire), "dash");
    expect(control.inputValues).toEqual([1n]);
    expect(control.fee).toBe(1n);
    expect(control.inputVerification[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "UTXO binding", status: "verified" }),
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
    expect(analyzeInputSigning(control, 0)).toMatchObject({
      signature: "No signature or final-script fields supplied",
      protocol: "Legacy Script",
      locktime: "None",
    });
  });

  // Independent enumeration of the unsupported fields, rather than deriving
  // the test cases from the registry under test.
  const unsupportedInputs = [1, 5, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28];

  it.each(unsupportedInputs)(
    "preserves input type %i without changing semantic conclusions",
    (type) => {
      const control = parsePsbt(spends(specialWire), "dash");
      const parsed = parsePsbt(spends(specialWire, [field(type)]), "dash");
      expect(parsed.inputs[0]?.find((item) => item.type === BigInt(type))).toEqual({
        type: BigInt(type),
        keyData: new Uint8Array(),
        value: new Uint8Array(),
      });
      expect(semantics(parsed)).toEqual(semantics(control));
    },
  );

  it.each([
    ["global", 6, Buffer.from([0xf8]), Buffer.alloc(0)],
    ["input", 8, Buffer.from([0x01, 0x01, 0x51]), Buffer.alloc(0)],
    ["input", 19, Buffer.alloc(64), Buffer.alloc(0)],
    ["input", 22, Buffer.alloc(4), Buffer.alloc(32)],
    ["output", 7, Buffer.alloc(4), Buffer.alloc(32)],
  ] as const)("does not interpret meaningful-looking %s type %i", (scope, type, value, key) => {
    const fields = [field(type, value, key)];
    const parsed = parsePsbt(
      v0(
        scope === "input" ? fields : [],
        scope === "global" ? fields : [],
        scope === "output" ? fields : [],
      ),
      "dash",
    );
    expect(semantics(parsed)).toEqual(semantics(parsePsbt(v0(), "dash")));
    const rawMap =
      scope === "global"
        ? parsed.global
        : scope === "input"
          ? parsed.inputs[0]!
          : parsed.outputs[0]!;
    const item = rawMap.find((item) => item.type === BigInt(type))!;
    expect(bytesToHex(item.keyData)).toBe(key.toString("hex"));
    expect(bytesToHex(item.value)).toBe(value.toString("hex"));
    expect(pairName(scope, item.type, "dash")).toMatch(/^Unknown \/ passthrough/u);
    expect(pairSummary(scope, item, "dash")).toBeNull();
  });

  const otherScopes: readonly [PsbtMapScope, number][] = [
    ...[2, 3, 4, 5, 6].map((type) => ["global", type] as [PsbtMapScope, number]),
    ...[1, 3, 4, 5, 6, 7, 8].map((type) => ["output", type] as [PsbtMapScope, number]),
  ];
  it.each(otherScopes)(
    "preserves unknown %s type %i without assigning verification",
    (scope, type) => {
      const record = field(type);
      const parsed = parsePsbt(
        v0([], scope === "global" ? [record] : [], scope === "output" ? [record] : []),
        "dash",
      );
      expect(semantics(parsed)).toEqual(semantics(parsePsbt(v0(), "dash")));
    },
  );

  it.each([17, 19])("Bitcoin still refuses malformed known input type %i", (type) => {
    expect(() => parsePsbt(v0([field(type)]), "bitcoin")).toThrow();
  });

  it("still interprets Dash's supported legacy signature and sighash fields", () => {
    const publicKey = Buffer.from(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "hex",
    );
    // Synthetic R=S=1 strict-DER shape and SIGHASH_ALL: structurally valid,
    // deliberately not a claim that the signature verifies any transaction.
    const signature = Buffer.from("300602010102010101", "hex");
    const parsed = parsePsbt(
      v0([field(2, signature, publicKey), field(3, Buffer.from("01000000", "hex"))]),
      "dash",
    );
    expect(analyzeInputSigning(parsed, 0)).toMatchObject({
      signature: "1 signature field(s) supplied · not cryptographically verified here",
      protocol: "Legacy Script",
      sighash: { label: "SIGHASH_ALL", known: true },
    });
    expect(parsed.inputVerification[0]).toContainEqual(
      expect.objectContaining({ relationship: "Cryptographic signatures", status: "not-verified" }),
    );
  });

  it("retains Bitcoin signature and BIP370 locktime semantics for valid known fields", () => {
    const u32 = (value: number): Buffer => {
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(value);
      return bytes;
    };
    const amount = Buffer.from("0100000000000000", "hex");
    const script = Buffer.from(BITCOIN_ADDRESS_VECTORS.taproot.script, "hex");
    const lock = CONSENSUS_LIMITS.absoluteLockTimeThreshold;
    const psbt = Buffer.concat([
      PSBT_MAGIC,
      map([
        field(0xfb, u32(2)),
        field(2, u32(2)),
        field(4, Buffer.from([1])),
        field(5, Buffer.from([1])),
      ]),
      map([
        field(14, Buffer.alloc(32)),
        field(15, u32(0)),
        field(16, u32(0xfffffffe)),
        field(17, u32(lock)),
        field(19, Buffer.alloc(64)),
        field(1, Buffer.concat([amount, smallLength(script.length), script])),
      ]),
      map([field(3, Buffer.alloc(8)), field(4, Buffer.from([0x51]))]),
    ]).toString("hex");
    const parsed = parsePsbt(psbt, "bitcoin");
    expect(parsed.inputVerification[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "Cryptographic signatures",
          status: "not-verified",
        }),
        expect.objectContaining({
          relationship: "PSBT v2 locktime requirements",
          status: "verified",
        }),
      ]),
    );
    expect(analyzeInputSigning(parsed, 0)).toMatchObject({
      signature: "1 signature field(s) supplied · not cryptographically verified here",
      protocol: "Taproot / BIP341",
      locktime: `Effective transaction lock: Unix time ${lock}`,
      sighash: { label: "SIGHASH_DEFAULT · inferred from supplied signature", known: true },
    });
  });

  it("includes both remediations in the quick Dash check reused by the full self-test", () => {
    expect(() => dashPsbtDecoder.run()).not.toThrow();
    expect(hexToBytes(DASH_SPECIAL_PAYLOAD).length).toBe(38);
  });
});
