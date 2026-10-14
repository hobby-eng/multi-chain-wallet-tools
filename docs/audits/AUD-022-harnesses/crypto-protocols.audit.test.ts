import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parsePsbt } from "../../../apps/psbt-inspector/src/psbt.js";
import { analyzeInputSigning } from "../../../apps/psbt-inspector/src/signing-commitments.js";
import {
  decodeCandidateList,
  encodeCandidateList,
} from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import { recoverSlip39Shares } from "../../../packages/recovery-backup/src/slip39.js";

// These deliberately small PSBTv2 containers contain synthetic outpoints and no signatures.
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

function v2(inputFields: readonly Buffer[]): string {
  return Buffer.concat([
    Buffer.from("70736274ff", "hex"),
    map([
      field(0xfb, u32(2)),
      field(0x02, u32(2)),
      field(0x04, Buffer.from([1])),
      field(0x05, Buffer.from([1])),
    ]),
    map([field(0x0e, Buffer.alloc(32)), field(0x0f, u32(0)), ...inputFields]),
    map([
      field(0x03, Buffer.from("8403000000000000", "hex")), // 900 satoshis.
      field(0x04, Buffer.from([0x51])),
    ]),
  ]).toString("base64");
}

function utxo(script: Buffer): Buffer {
  return field(
    0x01,
    Buffer.concat([
      Buffer.from("e803000000000000", "hex"), // 1,000 satoshis.
      Buffer.from([script.length]),
      script,
    ]),
  );
}

const witnessProgram = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20)]);
const legacyScript = Buffer.concat([
  Buffer.from([0x76, 0xa9, 0x14]),
  Buffer.alloc(20),
  Buffer.from([0x88, 0xac]),
]);

describe("AUD-022 independent protocol probes", () => {
  it("reconstructs only the official SLIP39 128-bit 2-of-3 reference case", () => {
    // Trezor python-shamir-mnemonic vectors.json, case 4; no other vector is replayed.
    const restored = recoverSlip39Shares(
      [
        "shadow pistol academic always adequate wildlife fancy gross oasis cylinder mustang wrist rescue view short owner flip making coding armed",
        "shadow pistol academic acid actress prayer class unknown daughter sweater depict flip twice unkind craft early superior advocate guest smoking",
      ],
      "TREZOR",
    );
    try {
      expect(Buffer.from(restored).toString("hex")).toBe("b43ceb7e57a0ea8766221624d01b0864");
    } finally {
      restored.fill(0);
    }
  });

  it("recognizes native and HASH160-bound nested SegWit controls", () => {
    const hash160 = createHash("ripemd160")
      .update(createHash("sha256").update(witnessProgram).digest())
      .digest();
    const nestedScript = Buffer.concat([Buffer.from([0xa9, 0x14]), hash160, Buffer.from([0x87])]);
    for (const fields of [
      [utxo(witnessProgram), field(0x03, u32(1))],
      [utxo(nestedScript), field(0x04, witnessProgram), field(0x03, u32(1))],
    ]) {
      const analysis = analyzeInputSigning(parsePsbt(v2(fields), "bitcoin"), 0);
      expect(analysis.protocol).toBe("SegWit v0 / BIP143");
      expect(analysis.sighash.currentInputAmount).toBe("Committed");
    }
  });

  it("does not let an unrelated redeemScript promote a known legacy UTXO to BIP143", () => {
    const baseline = parsePsbt(v2([utxo(legacyScript), field(0x03, u32(1))]), "bitcoin");
    expect(analyzeInputSigning(baseline, 0).protocol).toBe("Legacy Script");
    const conflicting = parsePsbt(
      v2([utxo(legacyScript), field(0x04, witnessProgram), field(0x03, u32(1))]),
      "bitcoin",
    );
    expect(conflicting.inputVerification[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "failed", detail: expect.stringContaining("HASH160") }),
      ]),
    );
    const analysis = analyzeInputSigning(conflicting, 0);
    expect(analysis.protocol).toBe("Legacy Script");
    expect(analysis.sighash.currentInputAmount).toBe("Not committed by legacy sighash");
  });

  it("marks PSBTv2 required locktime inactive when every sequence is final", () => {
    const analysis = analyzeInputSigning(parsePsbt(v2([field(0x12, u32(100))]), "bitcoin"), 0);
    // BIP370 defaults an omitted sequence to 0xffffffff; Bitcoin IsFinalTx ignores nLockTime.
    expect(analysis.locktime).toContain("inactive");
  });

  it("recognizes the same required locktime when a non-final sequence enables it", () => {
    const analysis = analyzeInputSigning(
      parsePsbt(v2([field(0x12, u32(100)), field(0x10, u32(0xfffffffe))]), "bitcoin"),
      0,
    );
    expect(analysis.locktime).toBe("Effective transaction lock: block height 100");
  });

  it("observes decoder copies on CRC failure without claiming an uninstrumented disclosure", () => {
    const plain = encodeCandidateList({ records: [{ entropy: new Uint8Array(16).fill(0x42) }] });
    // Header is 11 bytes; flip an entropy byte while retaining the original CRC.
    plain[11] ^= 1;
    const captured: Uint8Array[] = [];
    const originalFrom = Uint8Array.from;
    const from = vi.spyOn(Uint8Array, "from");
    from.mockImplementation((source: Iterable<number> | ArrayLike<number>) => {
      const copy = originalFrom.call(Uint8Array, source);
      captured.push(copy);
      return copy;
    });
    try {
      expect(() => decodeCandidateList(plain)).toThrow(/CRC-32/u);
    } finally {
      from.mockRestore();
      // Matches the first-party importer's finally; it cannot reach decoder-owned copies.
      plain.fill(0);
    }
    try {
      expect(captured).toHaveLength(1);
      expect(captured[0]!.some((byte) => byte !== 0)).toBe(true);
    } finally {
      for (const copy of captured) copy.fill(0);
    }
  });
});
