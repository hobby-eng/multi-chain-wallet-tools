// The sizes of BIP39: the word counts a phrase may have and the entropy and checksum widths each
// count gives, with the check of a count at a public boundary. Data only: it loads no word list and
// derives nothing, so that every part of the tool reads the sizes from here without the rest of
// BIP39 (AUD-024 families 1 and 2). Each width follows from BIP39's rule that a phrase of
// ENT bits of entropy has ENT / 32 checksum bits and (ENT + CS) / 11 words.

import { orList } from "./listing.js";

/** Bits of one word: its index in the 2,048-word list. */
export const BIP39_WORD_BITS = 11;
/** The word counts of a BIP39 phrase, from 128 to 256 bits of entropy. */
export const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
export type Bip39WordCount = (typeof BIP39_WORD_COUNTS)[number];

const COUNT_LIST = orList(BIP39_WORD_COUNTS);

/** Whether `value` is a word count that a BIP39 phrase can have. */
export function isBip39WordCount(value: unknown): value is Bip39WordCount {
  return (BIP39_WORD_COUNTS as readonly unknown[]).includes(value);
}

/** Refuses, at a public boundary, a word count that no BIP39 phrase has. */
export function assertBip39WordCount(value: unknown): asserts value is Bip39WordCount {
  if (!isBip39WordCount(value)) throw new Error(`BIP39 word count must be ${COUNT_LIST}.`);
}

/** Checksum bits of a phrase of `words` words: one for every three words. */
export function bip39ChecksumBits(words: Bip39WordCount): number {
  return words / 3;
}

/** Bits of entropy of a phrase of `words` words. */
export function bip39EntropyBits(words: Bip39WordCount): number {
  return words * BIP39_WORD_BITS - bip39ChecksumBits(words);
}

/** Bytes of entropy of a phrase of `words` words. */
export function bip39EntropyBytes(words: Bip39WordCount): number {
  return bip39EntropyBits(words) / 8;
}

/** The entropy sizes in bytes that a BIP39 phrase encodes: 16, 20, 24, 28 and 32. */
export const BIP39_ENTROPY_BYTES: readonly number[] = Object.freeze(
  BIP39_WORD_COUNTS.map(bip39EntropyBytes),
);

/** The word count of a phrase of `bytes` bytes of entropy; undefined for a size BIP39 has not. */
export function bip39WordCountOfEntropy(bytes: number): Bip39WordCount | undefined {
  return BIP39_WORD_COUNTS.find((words) => bip39EntropyBytes(words) === bytes);
}

/** The words of a phrase, as a refusal names them: "12, 15, 18, 21, or 24". */
export const BIP39_WORD_COUNT_LIST = COUNT_LIST;
