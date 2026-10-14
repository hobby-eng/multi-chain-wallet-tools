import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const random = vi.hoisted(() => ({ symbol: 0 }));
vi.mock("@ckd/core/secure-random.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  secureRandomBytes(length: number): Uint8Array {
    // A 256-bit seed has one data bit and four padding bits in its final symbol.
    if (length !== 33) throw new Error("Expected seed bytes plus independent padding.");
    const bytes = new Uint8Array(length);
    bytes[length - 2] = random.symbol >>> 4;
    bytes[length - 1] = random.symbol & 15;
    return bytes;
  },
}));
vi.mock("@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL("../../recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm", import.meta.url),
  ),
}));
import { createCodex32Shares, recoverCodex32Shares } from "../src/codex32.js";

/** Independent BIP93 GF(32) oracle, restricted to this final-symbol projection. */
class FinalSymbolOracle {
  static readonly alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  static readonly fieldBits = 5;
  static readonly modulus = 0x29; // x^5 + x^3 + 1, BIP93's Bech32 field.
  static readonly checksumSymbols = 13; // BIP93 short checksum for a 32-byte secret.

  static multiply(left: number, right: number): number {
    let result = 0;
    for (let bit = 0; bit < this.fieldBits; bit += 1) {
      if ((right & 1) !== 0) result ^= left;
      right >>>= 1;
      left <<= 1;
      if ((left & (1 << this.fieldBits)) !== 0) left ^= this.modulus;
    }
    return result;
  }

  static atC(secret: number, atA: number): number {
    // Lagrange coefficients at c=24 for s=16 and a=29: 5/13=23 and 8/13=22.
    return this.multiply(23, secret) ^ this.multiply(22, atA);
  }
}

describe("Codex32 random basis padding", () => {
  it("reproduces the first payload symbol of published BIP93 vector two", () => {
    // Vector two: entropy d180..., share A begins 3 (17), share C begins a (29).
    expect(FinalSymbolOracle.atC(0xd1 >>> 3, 17)).toBe(29);
  });

  it("covers every final GF(32) symbol independently of the secret's final bit", () => {
    for (const secretBit of [0, 1]) {
      const seed = new Uint8Array(32);
      seed[31] = secretBit;
      const observed = new Set<string>();
      for (random.symbol = 0; random.symbol < 32; random.symbol += 1) {
        const shares = createCodex32Shares(seed, "test", 2, 2).shares;
        const record = shares[1]!; // Share at c; the random basis is at a.
        const last = record[record.length - FinalSymbolOracle.checksumSymbols - 1]!;
        const expected = FinalSymbolOracle.atC(secretBit << 4, random.symbol);
        expect(last).toBe(FinalSymbolOracle.alphabet[expected]);
        observed.add(last);
        const recovered = recoverCodex32Shares(shares);
        try {
          expect(recovered).toEqual(seed);
        } finally {
          recovered.fill(0);
        }
      }
      expect([...observed].sort()).toEqual([...FinalSymbolOracle.alphabet].sort());
    }
  });
});
