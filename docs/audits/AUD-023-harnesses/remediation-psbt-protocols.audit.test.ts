// AUD-023 remediation re-run of AUD-022-FUN001 and FUN002 through the production parser and signing
// analysis (parsePsbt, analyzeInputSigning), copied from AUD-022-harnesses/crypto-protocols and
// extended with the variants that AUD-022's "required verification" names. Synthetic one-input
// PSBTs with zero outpoints and no signatures only; nothing is signed or broadcast.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePsbt } from "../../../apps/psbt-inspector/src/psbt.js";
import { analyzeInputSigning } from "../../../apps/psbt-inspector/src/signing-commitments.js";

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function field(type: number, value: Buffer): Buffer {
  if (type > 0xfc || value.length > 0xfc) throw new Error("Probe field exceeds one-byte sizes.");
  return Buffer.concat([Buffer.from([1, type, value.length]), value]);
}

function map(fields: readonly Buffer[]): Buffer {
  return Buffer.concat([...fields, Buffer.from([0])]);
}

/** A PSBTv2 with one output (900 sat, OP_TRUE) and one input per entry of `inputs`. */
function v2(inputs: readonly (readonly Buffer[])[], global: readonly Buffer[] = []): string {
  return Buffer.concat([
    Buffer.from("70736274ff", "hex"),
    map([
      field(0xfb, u32(2)),
      field(0x02, u32(2)),
      ...global,
      field(0x04, Buffer.from([inputs.length])),
      field(0x05, Buffer.from([1])),
    ]),
    ...inputs.map((fields, index) =>
      map([field(0x0e, Buffer.alloc(32, index)), field(0x0f, u32(0)), ...fields]),
    ),
    map([field(0x03, Buffer.from("8403000000000000", "hex")), field(0x04, Buffer.from([0x51]))]),
  ]).toString("base64");
}

/** A PSBTv0 whose unsigned transaction has one input with `sequence` and nLockTime `lockTime`. */
function v0(sequence: number, lockTime: number): string {
  const transaction = Buffer.concat([
    u32(2),
    Buffer.from([1]),
    Buffer.alloc(32),
    u32(0),
    Buffer.from([0]),
    u32(sequence),
    Buffer.from([1]),
    Buffer.from("8403000000000000", "hex"),
    Buffer.from([1, 0x51]),
    u32(lockTime),
  ]);
  const global = Buffer.concat([
    Buffer.from([1, 0x00]),
    Buffer.from([transaction.length]),
    transaction,
  ]);
  return Buffer.concat([
    Buffer.from("70736274ff", "hex"),
    global,
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([0]),
  ]).toString("base64");
}

function utxo(script: Buffer): Buffer {
  return field(
    0x01,
    Buffer.concat([Buffer.from("e803000000000000", "hex"), Buffer.from([script.length]), script]),
  );
}

const hash160 = (bytes: Buffer): Buffer =>
  createHash("ripemd160").update(createHash("sha256").update(bytes).digest()).digest();
const p2sh = (redeem: Buffer): Buffer =>
  Buffer.concat([Buffer.from([0xa9, 0x14]), hash160(redeem), Buffer.from([0x87])]);
const witnessProgram = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20)]);
const otherWitnessProgram = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20, 1)]);
const legacyScript = Buffer.concat([
  Buffer.from([0x76, 0xa9, 0x14]),
  Buffer.alloc(20),
  Buffer.from([0x88, 0xac]),
]);
const taprootScript = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 2)]);
const ALL = field(0x03, u32(1));
const FINAL = 0xffffffff;
const NON_FINAL = 0xfffffffe;

const analysis = (psbt: string) => analyzeInputSigning(parsePsbt(psbt, "bitcoin"), 0);

describe("AUD-022-FUN001 re-run: protocol only from the UTXO and bound scripts", () => {
  it("the AUD-022 reproduction: a P2PKH UTXO with an unrelated 0014 redeemScript stays legacy", () => {
    const parsed = parsePsbt(
      v2([[utxo(legacyScript), field(0x04, witnessProgram), ALL]]),
      "bitcoin",
    );
    expect(parsed.inputVerification[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "failed", detail: expect.stringContaining("HASH160") }),
      ]),
    );
    const result = analyzeInputSigning(parsed, 0);
    expect(result.protocol).toBe("Legacy Script");
    expect(result.sighash.currentInputAmount).toBe("Not committed by legacy sighash");
  });

  it("controls: native v0, bound nested v0, Taproot and bound legacy P2SH", () => {
    expect(analysis(v2([[utxo(witnessProgram), ALL]])).protocol).toBe("SegWit v0 / BIP143");
    const nested = analysis(v2([[utxo(p2sh(witnessProgram)), field(0x04, witnessProgram), ALL]]));
    expect(nested.protocol).toBe("SegWit v0 / BIP143");
    expect(nested.sighash.currentInputAmount).toBe("Committed");
    expect(analysis(v2([[utxo(taprootScript), ALL]])).protocol).toBe("Taproot / BIP341");
    const multisig = Buffer.from([0x51, 0x21, ...Buffer.alloc(33, 2), 0x51, 0xae]);
    expect(analysis(v2([[utxo(p2sh(multisig)), field(0x04, multisig), ALL]])).protocol).toBe(
      "Legacy Script",
    );
  });

  it("a P2SH UTXO with a mismatched HASH160 is unknown and claims no amount commitment", () => {
    const result = analysis(
      v2([[utxo(p2sh(otherWitnessProgram)), field(0x04, witnessProgram), ALL]]),
    );
    expect(result.protocol).toMatch(/^Unknown/u);
    expect(result.sighash.currentInputAmount).not.toBe("Committed");
    expect(result.sighash.currentInputAmount).not.toMatch(/^Not committed by legacy/u);
  });

  it("a P2SH UTXO without a redeemScript is unknown", () => {
    expect(analysis(v2([[utxo(p2sh(witnessProgram)), ALL]])).protocol).toMatch(/^Unknown/u);
  });

  it("missing UTXO: Taproot metadata does not promote the input; no Committed amount", () => {
    // The x coordinate of the secp256k1 generator: a valid public x-only key.
    const generatorX = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const tapInternalKey = field(0x17, Buffer.from(generatorX, "hex"));
    const result = analysis(v2([[tapInternalKey, ALL]]));
    expect(result.protocol).toMatch(/^Unknown · no UTXO/u);
    expect(result.sighash.currentInputAmount).not.toBe("Committed");
  });

  it("conflicting UTXOs are refused at parse", () => {
    // A non-witness UTXO that disagrees with the witness UTXO is refused before any analysis;
    // its transaction ID must match the outpoint, so build the referenced transaction first.
    const previous = Buffer.concat([
      u32(2),
      Buffer.from([1]),
      Buffer.alloc(32),
      u32(0),
      Buffer.from([0]),
      u32(FINAL),
      Buffer.from([1]),
      Buffer.from("e803000000000000", "hex"),
      Buffer.from([legacyScript.length]),
      legacyScript,
      u32(0),
    ]);
    const txid = createHash("sha256")
      .update(createHash("sha256").update(previous).digest())
      .digest();
    const psbt = Buffer.concat([
      Buffer.from("70736274ff", "hex"),
      map([
        field(0xfb, u32(2)),
        field(0x02, u32(2)),
        field(0x04, Buffer.from([1])),
        field(0x05, Buffer.from([1])),
      ]),
      Buffer.concat([
        Buffer.from([1, 0x00, previous.length]),
        previous,
        field(0x0e, txid),
        field(0x0f, u32(0)),
        utxo(witnessProgram),
        Buffer.from([0]),
      ]),
      map([field(0x03, Buffer.from("8403000000000000", "hex")), field(0x04, Buffer.from([0x51]))]),
    ]).toString("base64");
    expect(() => parsePsbt(psbt, "bitcoin")).toThrow(/disagree/u);
  });

  it("Dash keeps every input on legacy sighash", () => {
    // Dash Core PSBTs are version 0 only.
    const dash = analyzeInputSigning(parsePsbt(v0(FINAL, 0), "dash"), 0);
    expect(dash.protocol).toBe("Legacy Script");
  });
});

describe("AUD-022-FUN002 re-run: final sequences disable every lock source", () => {
  it("the AUD-022 reproduction: required height 100, sequence omitted, is inactive", () => {
    expect(analysis(v2([[field(0x12, u32(100))]])).locktime).toBe(
      "Effective transaction lock: block height 100 · inactive because every input has a final sequence",
    );
  });

  it("control: the same requirement with a non-final sequence is active", () => {
    expect(analysis(v2([[field(0x12, u32(100)), field(0x10, u32(NON_FINAL))]])).locktime).toBe(
      "Effective transaction lock: block height 100",
    );
  });

  it("required time with explicit final sequence is inactive; non-final is active", () => {
    const time = field(0x11, u32(500_000_001));
    expect(analysis(v2([[time, field(0x10, u32(FINAL))]])).locktime).toMatch(
      /^Effective transaction lock: Unix time 500000001 · inactive/u,
    );
    expect(analysis(v2([[time, field(0x10, u32(0))]])).locktime).toBe(
      "Effective transaction lock: Unix time 500000001",
    );
  });

  it("fallback locktime with omitted sequences is inactive; with one non-final input active", () => {
    const fallback = [field(0x03, u32(100))];
    expect(analysis(v2([[]], fallback)).locktime).toBe(
      "Block height 100 · inactive because every input has a final sequence",
    );
    expect(analysis(v2([[], [field(0x10, u32(NON_FINAL))]], fallback)).locktime).toBe(
      "Block height 100",
    );
  });

  it("a requirement on another input decides the lock for input 0 too, and its sequence matters", () => {
    const result = analyzeInputSigning(
      parsePsbt(v2([[], [field(0x12, u32(100)), field(0x10, u32(NON_FINAL))]]), "bitcoin"),
      0,
    );
    expect(result.locktime).toBe("Effective transaction lock: block height 100");
  });

  it("an input with both units and one with only time chooses time; height when both allow", () => {
    const both = [field(0x11, u32(500_000_001)), field(0x12, u32(100))];
    const onlyTime = [field(0x11, u32(500_000_002))];
    expect(analysis(v2([[...both, field(0x10, u32(0))], onlyTime])).locktime).toBe(
      "Effective transaction lock: Unix time 500000002",
    );
    expect(analysis(v2([[...both, field(0x10, u32(0))]])).locktime).toBe(
      "Effective transaction lock: block height 100",
    );
  });

  it("incompatible units are reported as unsatisfiable, not as the fallback", () => {
    const result = analysis(
      v2([[field(0x12, u32(100))], [field(0x11, u32(500_000_001))]], [field(0x03, u32(7))]),
    );
    expect(result.locktime).toMatch(/^Unsatisfiable/u);
  });

  it("PSBTv0: the serialized nLockTime follows the same sequence rule", () => {
    expect(analysis(v0(FINAL, 100)).locktime).toBe(
      "Block height 100 · inactive because every input has a final sequence",
    );
    expect(analysis(v0(NON_FINAL, 100)).locktime).toBe("Block height 100");
    expect(analysis(v0(FINAL, 0)).locktime).toBe("None");
  });
});
