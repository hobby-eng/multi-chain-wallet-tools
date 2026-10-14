import { describe, expect, it } from "vitest";
import { hash160, sha256 } from "@ckd/core/crypto.js";
import { parsePsbt, type ParsedPsbt, type PsbtChain } from "../src/psbt.js";
import { analyzeInputSigning, analyzeSighash } from "../src/signing-commitments.js";

const BITCOIN_WITNESS_PREVIOUS_TX_PSBT =
  "cHNidP8BAHUCAAAAAQZB8bKqHgj6j1e86DcczS5N9qCOeeHVqdHmTRgvmaSEAAAAAAD+////AtPf9QUAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKwA4fUFAAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHh7MuEwAAAQB8AQAAAAABARERERERERERERERERERERERERERERERERERERERERERAQAAAAD/////AgDC6wsAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKxy/vhOLAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHhwIBAQECAAAAAAAAAA==";
const DASH_PREVIOUS_TX_PSBT =
  "cHNidP8BAHUCAAAAAQZB8bKqHgj6j1e86DcczS5N9qCOeeHVqdHmTRgvmaSEAAAAAAD+////AtPf9QUAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKwA4fUFAAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHh7MuEwAAAQB1AQAAAAEREREREREREREREREREREREREREREREREREREREREREQEAAAAA/////wIAwusLAAAAABl2qRTQxZkDxbrChodg6Q/VIaRmWqdlIIiscv74TiwAAAAXqRQ1RebjO4MsRwUPJNPuuTycA5SLx4cAAAAAAAAA";

describe("human-readable signing commitments", () => {
  it("explains standard SIGHASH_ALL commitments without overstating legacy amount coverage", () => {
    expect(analyzeSighash(0x01, "legacy")).toMatchObject({
      label: "SIGHASH_ALL",
      unusual: false,
      currentInput: "Committed",
      otherInputs: "Committed",
      otherInputSequences: "Committed",
      outputs: "All outputs and their amounts are committed",
      currentInputAmount: "Not committed by legacy sighash",
    });
  });

  it("flags ANYONECANPAY|SINGLE and states exactly what remains mutable", () => {
    expect(analyzeSighash(0x83, "segwit-v0")).toMatchObject({
      label: "SIGHASH_SINGLE | ANYONECANPAY",
      unusual: true,
      otherInputs: "Not committed · inputs may be added or removed",
      otherInputSequences: "Not committed",
      outputs: "Only the output with the same index is committed",
      currentInputAmount: "Committed",
    });
  });

  it("maps Taproot SIGHASH_DEFAULT to all-output commitments and rejects DEFAULT|ANYONECANPAY", () => {
    expect(analyzeSighash(0x00, "taproot")).toMatchObject({
      label: "SIGHASH_DEFAULT",
      unusual: false,
      outputs: "All outputs and their amounts are committed",
    });
    expect(analyzeSighash(0x80, "taproot")).toMatchObject({ known: false, unusual: true });
  });

  it("makes the missing SIGHASH_SINGLE output edge case explicit", () => {
    expect(analyzeSighash(0x03, "legacy", false)).toMatchObject({
      unusual: true,
      outputs: "No corresponding output · legacy SIGHASH_SINGLE returns the constant hash 1",
    });
    expect(analyzeSighash(0x03, "taproot", false)).toMatchObject({
      unusual: true,
      outputs: "Invalid · SIGHASH_SINGLE has no corresponding output",
    });
  });

  it("does not invent SIGHASH_ALL when an unsigned PSBT omits the field", () => {
    const bitcoin = analyzeInputSigning(parsePsbt(BITCOIN_WITNESS_PREVIOUS_TX_PSBT, "bitcoin"), 0);
    expect(bitcoin).toMatchObject({
      signature: "No signature or final-script fields supplied",
      sighash: { label: "Not specified · signer decides according to wallet policy", known: false },
      rbf: "Not signaled",
      locktime: "Block height 1257139",
      relativeLocktime: "None",
    });
    const dash = analyzeInputSigning(parsePsbt(DASH_PREVIOUS_TX_PSBT, "dash"), 0);
    expect(dash.rbf).toBe("Not supported by Dash Core");
    expect(dash.locktime).toBe("Block height 1257139");
  });
});

// Synthetic one-input PSBTs: zero outpoints, public test scripts and no signatures.
const PSBT_MAGIC = Buffer.from("70736274ff", "hex");
const SIGHASH_ALL = 1;
const INPUT_VALUE = 1000n;
const P2PKH = Buffer.from(`76a914${"02".repeat(20)}88ac`, "hex");
const P2WPKH = Buffer.from(`0014${"11".repeat(20)}`, "hex");
const OP_TRUE = Buffer.from([0x51]);
// x-only secp256k1 generator G, used only as a well-formed public key.
const X_ONLY_G = Buffer.from(
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "hex",
);
const P2TR = Buffer.concat([Buffer.from([0x51, 0x20]), X_ONLY_G]);
const PROTOCOL_DEPENDENT =
  "Unknown · depends on the spending protocol, which the supplied data does not establish";
const SCRIPT_COMMITMENTS = "Redeem/witness script commitments";

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}
function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}
function compact(value: number): Buffer {
  if (value >= 0xfd) throw new Error("Test helper only supports one-byte CompactSize values.");
  return Buffer.from([value]);
}
function field(type: number, value: Buffer): Buffer {
  return Buffer.concat([compact(1), Buffer.from([type]), compact(value.length), value]);
}
function map(fields: readonly Buffer[]): Buffer {
  return Buffer.concat([...fields, Buffer.from([0])]);
}
function txOut(value: bigint, script: Buffer): Buffer {
  return Buffer.concat([u64(value), compact(script.length), script]);
}
function p2sh(script: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xa9, 0x14]), hash160(script), Buffer.from([0x87])]);
}
const witnessUtxo = (script: Buffer, value = INPUT_VALUE): Buffer =>
  field(0x01, txOut(value, script));
const redeemScript = (script: Buffer): Buffer => field(0x04, script);
const sighashType = (value: number): Buffer => field(0x03, u32(value));

function v2(inputFields: readonly Buffer[]): ParsedPsbt {
  const psbt = Buffer.concat([
    PSBT_MAGIC,
    map([
      field(0xfb, u32(2)),
      field(0x02, u32(2)),
      field(0x04, Buffer.from([1])),
      field(0x05, Buffer.from([1])),
    ]),
    map([field(0x0e, Buffer.alloc(32)), field(0x0f, u32(0)), ...inputFields]),
    map([field(0x03, u64(0n)), field(0x04, OP_TRUE)]),
  ]);
  return parsePsbt(psbt.toString("base64"), "bitcoin");
}

function transaction(previousTxid: Buffer, output: Buffer): Buffer {
  const input = Buffer.concat([previousTxid, u32(0), compact(0), u32(0xffffffff)]);
  return Buffer.concat([u32(2), compact(1), input, compact(1), output, u32(0)]);
}

/** A v0 PSBT whose input spends output 0 of a supplied previous transaction paying `script`. */
function v0WithPreviousTransaction(
  chain: PsbtChain,
  script: Buffer,
  inputFields: readonly Buffer[] = [],
): ParsedPsbt {
  const previous = transaction(Buffer.alloc(32), txOut(INPUT_VALUE, script));
  const unsigned = transaction(Buffer.from(sha256(sha256(previous))), txOut(0n, OP_TRUE));
  const psbt = Buffer.concat([
    PSBT_MAGIC,
    map([field(0x00, unsigned)]),
    map([field(0x00, previous), ...inputFields]),
    map([]),
  ]);
  return parsePsbt(psbt.toString("base64"), chain);
}

function scriptCommitmentStatus(parsed: ParsedPsbt): string | undefined {
  return parsed.inputVerification[0]?.find(
    ({ relationship }) => relationship === SCRIPT_COMMITMENTS,
  )?.status;
}

describe("signature protocol from the supplied UTXO and validated script commitments", () => {
  it("keeps a P2PKH UTXO on legacy sighash, even with an unrelated witness-program redeemScript", () => {
    const control = v2([witnessUtxo(P2PKH), sighashType(SIGHASH_ALL)]);
    expect(analyzeInputSigning(control, 0)).toMatchObject({
      protocol: "Legacy Script",
      sighash: { label: "SIGHASH_ALL", currentInputAmount: "Not committed by legacy sighash" },
    });
    const unbound = v2([witnessUtxo(P2PKH), redeemScript(P2WPKH), sighashType(SIGHASH_ALL)]);
    expect(scriptCommitmentStatus(unbound)).toBe("failed");
    expect(analyzeInputSigning(unbound, 0)).toMatchObject({
      protocol: "Legacy Script",
      sighash: { currentInputAmount: "Not committed by legacy sighash" },
    });
  });

  it("recognizes native and HASH160-bound nested witness programs and bound legacy P2SH", () => {
    const native = v2([witnessUtxo(P2WPKH), sighashType(SIGHASH_ALL)]);
    expect(analyzeInputSigning(native, 0)).toMatchObject({
      protocol: "SegWit v0 / BIP143",
      sighash: { currentInputAmount: "Committed" },
    });
    const nested = v2([witnessUtxo(p2sh(P2WPKH)), redeemScript(P2WPKH), sighashType(SIGHASH_ALL)]);
    expect(scriptCommitmentStatus(nested)).toBe("verified");
    expect(analyzeInputSigning(nested, 0)).toMatchObject({
      protocol: "SegWit v0 / BIP143",
      sighash: { currentInputAmount: "Committed" },
    });
    const legacyP2sh = v2([
      witnessUtxo(p2sh(OP_TRUE)),
      redeemScript(OP_TRUE),
      sighashType(SIGHASH_ALL),
    ]);
    expect(scriptCommitmentStatus(legacyP2sh)).toBe("verified");
    expect(analyzeInputSigning(legacyP2sh, 0).protocol).toBe("Legacy Script");
    const taproot = analyzeInputSigning(v2([witnessUtxo(P2TR), sighashType(0)]), 0);
    expect(taproot).toMatchObject({
      protocol: "Taproot / BIP341",
      sighash: { label: "SIGHASH_DEFAULT" },
    });
  });

  it("reports a P2SH UTXO as unknown when its redeemScript is mismatched or missing", () => {
    const mismatched = v2([
      witnessUtxo(p2sh(OP_TRUE)),
      redeemScript(P2WPKH),
      sighashType(SIGHASH_ALL),
    ]);
    expect(scriptCommitmentStatus(mismatched)).toBe("failed");
    const analysis = analyzeInputSigning(mismatched, 0);
    expect(analysis.protocol).toMatch(/^Unknown · the P2SH redeemScript/u);
    expect(analysis.sighash).toMatchObject({
      label: "SIGHASH_ALL",
      known: true,
      currentInput: "Committed",
      currentInputAmount: PROTOCOL_DEPENDENT,
    });
    const missing = v2([witnessUtxo(p2sh(P2WPKH)), sighashType(SIGHASH_ALL)]);
    expect(analyzeInputSigning(missing, 0).protocol).toMatch(/^Unknown · the P2SH redeemScript/u);
  });

  it("does not take the protocol from optional metadata when no UTXO is supplied", () => {
    const redeemOnly = v2([redeemScript(P2WPKH), sighashType(SIGHASH_ALL)]);
    expect(scriptCommitmentStatus(redeemOnly)).toBe("not-verified");
    expect(analyzeInputSigning(redeemOnly, 0).protocol).toMatch(/^Unknown · no UTXO/u);
    const taprootMetadata = v2([field(0x17, X_ONLY_G), sighashType(SIGHASH_ALL)]);
    expect(analyzeInputSigning(taprootMetadata, 0).protocol).toMatch(/^Unknown · no UTXO/u);

    // SIGHASH_DEFAULT exists only under Taproot, so the candidates disagree on its meaning.
    const sighashDefault = analyzeInputSigning(v2([sighashType(0)]), 0);
    expect(sighashDefault.sighash.label).toContain("SIGHASH_DEFAULT");
    expect(sighashDefault.sighash).toMatchObject({
      known: false,
      unusual: true,
      currentInputAmount: PROTOCOL_DEPENDENT,
    });
  });

  it("rejects witness and non-witness UTXOs that disagree", () => {
    expect(() =>
      v0WithPreviousTransaction("bitcoin", P2WPKH, [witnessUtxo(P2WPKH, INPUT_VALUE + 1n)]),
    ).toThrow(/disagree/u);
    expect(() => v0WithPreviousTransaction("bitcoin", P2WPKH, [witnessUtxo(p2sh(P2WPKH))])).toThrow(
      /disagree/u,
    );
  });

  it("keeps every Dash input on legacy sighash", () => {
    const nested = v0WithPreviousTransaction("dash", p2sh(P2WPKH), [redeemScript(P2WPKH)]);
    expect(scriptCommitmentStatus(nested)).toBe("verified");
    expect(analyzeInputSigning(nested, 0).protocol).toBe("Legacy Script");
    const bareProgram = v0WithPreviousTransaction("dash", P2WPKH);
    expect(analyzeInputSigning(bareProgram, 0).protocol).toBe("Legacy Script");
  });
});
