import { describe, expect, it } from "vitest";
import {
  BIP39_ENTROPY_BYTES,
  BIP39_WORD_COUNTS,
  assertBip39WordCount,
  bip39ChecksumBits,
  bip39EntropyBits,
  bip39EntropyBytes,
  bip39WordCountOfEntropy,
  isBip39WordCount,
} from "../src/bip39-parameters.js";

// The table of BIP39 (bip-0039.mediawiki, "Generating the mnemonic"): CS = ENT / 32 and
// MS = (ENT + CS) / 11. The expected rows are written out here, not computed by the module.
const TABLE = [
  { words: 12, entropyBits: 128, checksumBits: 4, bytes: 16 },
  { words: 15, entropyBits: 160, checksumBits: 5, bytes: 20 },
  { words: 18, entropyBits: 192, checksumBits: 6, bytes: 24 },
  { words: 21, entropyBits: 224, checksumBits: 7, bytes: 28 },
  { words: 24, entropyBits: 256, checksumBits: 8, bytes: 32 },
] as const;

describe("the sizes of BIP39", () => {
  it("gives every length its entropy and checksum widths", () => {
    expect(BIP39_WORD_COUNTS).toEqual(TABLE.map((row) => row.words));
    expect(BIP39_ENTROPY_BYTES).toEqual(TABLE.map((row) => row.bytes));
    for (const row of TABLE) {
      expect(bip39EntropyBits(row.words)).toBe(row.entropyBits);
      expect(bip39ChecksumBits(row.words)).toBe(row.checksumBits);
      expect(bip39EntropyBytes(row.words)).toBe(row.bytes);
      expect(bip39WordCountOfEntropy(row.bytes)).toBe(row.words);
    }
  });

  it("accepts the five lengths and refuses every other value", () => {
    for (const words of [12, 15, 18, 21, 24]) expect(isBip39WordCount(words)).toBe(true);
    for (const value of [0, 11, 13, 25, 12.5, -12, Number.NaN, "12", undefined]) {
      expect(isBip39WordCount(value)).toBe(false);
      expect(() => assertBip39WordCount(value)).toThrow(
        "BIP39 word count must be 12, 15, 18, 21, or 24.",
      );
    }
    expect(bip39WordCountOfEntropy(17)).toBeUndefined();
    expect(bip39WordCountOfEntropy(64)).toBeUndefined();
  });
});
