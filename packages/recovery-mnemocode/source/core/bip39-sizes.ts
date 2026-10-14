// The sizes of a BIP39 phrase, without its word lists: the word counts, the bits of a word, and
// the entropy and checksum bits that follow from a word count. Every module that needs one of
// them takes it here, so that SSKR, candidate lists and the fingerprint check load no word list.
//
// Host-neutral: it imports only whole-number rules (typed-number.ts) and how lists are written
// (places.ts).

import { listInWords } from "./places.js";
import { inWholeRange, integerRefusal, rangeText, type WholeRange } from "./typed-number.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.bip39-sizes", {
  "assert-word-indexes-refused": suppliedMessage,
  "expected-word-indexes": (value0: string) => `Expected ${value0} word indexes.`,
});

/** BIP39's phrase lengths, in words. */
export const BIP39_WORD_COUNTS = Object.freeze([12, 15, 18, 21, 24] as const);
/** A BIP39 phrase length, in words. */
export type Bip39WordCount = (typeof BIP39_WORD_COUNTS)[number];

/** Whether a phrase of `count` words has a BIP39 length. */
export function isBip39WordCount(count: number): count is Bip39WordCount {
  return (BIP39_WORD_COUNTS as readonly number[]).includes(count);
}

/** The lengths as the messages name them: "12, 15, 18, 21 or 24". */
export const WORD_COUNTS_TEXT = listInWords(BIP39_WORD_COUNTS, "or");
/** The words that a phrase with one word missing has: "11, 14, 17, 20 or 23". */
export const WORD_COUNTS_LESS_ONE_TEXT = listInWords(
  BIP39_WORD_COUNTS.map((count) => count - 1),
  "or",
);

/** Each word stands for 11 bits: an index into the 2,048 words. */
export const BIP39_INDEX_BITS = 11;
/** The number of words in a BIP39 word list: 2,048, one for each 11-bit index. */
export const BIP39_DICTIONARY_SIZE = 2 ** BIP39_INDEX_BITS;
/**
 * Word numbers as people write them, counted from 1 as Seedshift counts them: 1 through 2,048.
 * The word table, the form of word numbers and the menu read a word number in this range.
 */
export const WORD_NUMBER_RANGE: WholeRange = Object.freeze({ min: 1, max: BIP39_DICTIONARY_SIZE });
/** The word indexes, counted from 0 as BIP39 counts them: 0 through 2,047. */
export const WORD_INDEX_RANGE: WholeRange = Object.freeze({
  min: 0,
  max: BIP39_DICTIONARY_SIZE - 1,
});

/** The decimal digits of the highest word number, 2048: a color pads each number to them. */
export const WORD_NUMBER_DIGITS = String(WORD_NUMBER_RANGE.max).length;

/** The number, counted from 1, that people write for the word of `index`, counted from 0. */
export function wordNumberOf(index: number): number {
  return index + WORD_NUMBER_RANGE.min;
}

/** BIP39 adds one checksum bit for every 32 bits of entropy, which is one for every three words. */
const WORDS_PER_CHECKSUM_BIT = 3;

/** The word numbers as the help, the questions and the sheet for heirs name them: "1 to 2048". */
export const WORD_NUMBERS = rangeText(WORD_NUMBER_RANGE, "to");
/** The same numbers as a refusal names them: "1 through 2048". */
export const WORD_NUMBERS_THROUGH = rangeText(WORD_NUMBER_RANGE);
/** The same numbers in the name of a form: "1-2048". */
export const WORD_NUMBERS_SPAN = `${WORD_NUMBER_RANGE.min}-${WORD_NUMBER_RANGE.max}`;
/** Bits of a byte; bits.ts gives it to the modules that work on bits. */
export const BITS_PER_BYTE = 8;

/** The checksum bits at the end of a phrase of `wordCount` words. */
export function checksumBits(wordCount: number): number {
  return wordCount / WORDS_PER_CHECKSUM_BIT;
}

/** The entropy bits of a phrase of `wordCount` words. */
export function entropyBits(wordCount: number): number {
  return wordCount * BIP39_INDEX_BITS - checksumBits(wordCount);
}

/** The entropy bytes of a phrase of `wordCount` words: 16 for 12 words, 32 for 24. */
export function entropyBytes(wordCount: number): number {
  return entropyBits(wordCount) / BITS_PER_BYTE;
}

/** The entropy bits that the last word holds beside the checksum: 7 for 12 words, 3 for 24. */
export function lastWordEntropyBits(wordCount: number): number {
  return BIP39_INDEX_BITS - checksumBits(wordCount);
}

/**
 * The values that those bits take (lastWordEntropyBits): 128 for 12 words, 8 for 24. As many last
 * words give a valid checksum, and Seedshift moves the last word's entropy modulo them.
 */
export function lastWordEntropyValues(wordCount: number): number {
  return 2 ** lastWordEntropyBits(wordCount);
}

/**
 * The share of phrases whose checksum holds by chance: one in 2^(checksum bits), 1/16 for 12
 * words, as the word search and the Original Seedshift's date search count them.
 */
export function checksumPassShare(wordCount: number): number {
  return 2 ** -checksumBits(wordCount);
}

/** The entropy lengths of BIP39, in bytes, in the order of the word counts. */
export const BIP39_ENTROPY_BYTES: readonly number[] = Object.freeze(
  BIP39_WORD_COUNTS.map(entropyBytes),
);

/** The word count of a phrase of `bytes` bytes of entropy, or undefined for no BIP39 length. */
export function wordCountOfEntropy(bytes: number): Bip39WordCount | undefined {
  return BIP39_WORD_COUNTS.find((count) => entropyBytes(count) === bytes);
}

/** Whether `value` is a word index of the BIP39 list: a whole number from 0 through 2047. */
export function isWordIndex(value: unknown): value is number {
  return inWholeRange(value, WORD_INDEX_RANGE);
}

/**
 * Whether each of `indexes` is a word index (isWordIndex). Array.from turns holes into undefined,
 * which is refused, where every() alone would skip them. The one test of a list of word indexes:
 * assertWordIndexes refuses with it, and a caller with its own refusal asks it.
 */
export function areWordIndexes(indexes: readonly unknown[]): indexes is readonly number[] {
  return Array.from(indexes).every(isWordIndex);
}

/**
 * Refuses `indexes` unless each is a word index (areWordIndexes). Every decoder, the colors, the
 * backup of codes and the date search check the codes they are given with it.
 */
export function assertWordIndexes(
  indexes: readonly unknown[],
): asserts indexes is readonly number[] {
  if (!areWordIndexes(indexes))
    throw ERRORS.create("assert-word-indexes-refused", [
      integerRefusal("Every BIP39 index", WORD_INDEX_RANGE),
    ]);
}

/** Refuses a count of words that no BIP39 phrase has. */
export function assertWordCount(count: number): asserts count is Bip39WordCount {
  if (!isBip39WordCount(count))
    throw ERRORS.create("expected-word-indexes", [`${WORD_COUNTS_TEXT}`]);
}

/**
 * Refuses indexes that are no phrase: their count first, then each index, so that an index outside
 * the list is named as such and never as a bad checksum.
 */
export function assertPhraseIndexes(indexes: readonly unknown[]): void {
  assertWordCount(indexes.length);
  assertWordIndexes(indexes);
}
