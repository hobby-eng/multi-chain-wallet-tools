import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { phraseChecksumValid, indexesOfWords } from "./english-words.js";
import {
  BIP39_DICTIONARY_SIZE,
  BIP39_INDEX_BITS,
  englishWordlist,
  phraseOfIndexes,
  validatedEnglishWords,
  validLastWordIndexes,
} from "./words.js";
import {
  entropyBits,
  lastWordEntropyBits,
  lastWordEntropyValues,
  assertPhraseIndexes,
  assertWordCount,
} from "./bip39-sizes.js";
import { bitsOf, bitsOfIndexes, modulo, bytesToBits, bitsToBytes } from "./bits.js";
import { sortDates, deriveShifts } from "./dates.js";
import { resultFromIndexes, parseInput } from "./representations.js";
import type { EncodedResult, DecodedResult, DateShiftDate, EncodedFormat } from "./types.js";
import { textPieces } from "./pieces.js";
import { defined } from "./defined.js";

/** BIP39 words for owned entropy bits; the temporary byte buffer is cleared afterwards. */
function mnemonicFromEntropyBits(bits: string): string {
  const entropy = bitsToBytes(bits);
  try {
    return entropyToMnemonic(entropy, englishWordlist);
  } finally {
    entropy.fill(0);
  }
}

/** Entropy bits of a checksum-valid phrase; the temporary byte buffer is cleared afterwards. */
function entropyBitsOf(mnemonic: string): string {
  const entropy = mnemonicToEntropy(mnemonic, englishWordlist);
  try {
    return bytesToBits(entropy);
  } finally {
    entropy.fill(0);
  }
}

/** Masks (`sign` 1) or unmasks (−1); the shift is added or taken away. */
type Direction = 1 | -1;

/**
 * The Original Seedshift on word numbers: each index moved by its shift modulo the 2,048 words, in
 * `direction`. Encode, decode and the valid-last-word search all move them through it.
 */
function shiftedIndexes(
  indexes: readonly number[],
  shifts: readonly number[],
  direction: Direction,
): number[] {
  return indexes.map((index, position) =>
    modulo(index + direction * defined(shifts[position]), BIP39_DICTIONARY_SIZE),
  );
}

/**
 * MnemoCode Seedshift on the entropy bits of a phrase of `wordCount` words: each 11-bit chunk moved
 * by its shift modulo 2,048, and the bits that the last word keeps beside the checksum modulo
 * their own range, in `direction`. Encode and decode both move them through it.
 */
function shiftedEntropyBits(
  entropy: string,
  shifts: readonly number[],
  wordCount: number,
  direction: Direction,
): string {
  const tailWidth = lastWordEntropyBits(wordCount);
  // Every word but the last, whose bits the tail below carries.
  const chunks = textPieces(
    entropy.slice(0, (wordCount - 1) * BIP39_INDEX_BITS),
    BIP39_INDEX_BITS,
    (bits) => Number.parseInt(bits, 2),
  );
  const tail = Number.parseInt(entropy.slice(-tailWidth), 2);
  const movedTail = modulo(
    tail + direction * defined(shifts.at(-1)),
    lastWordEntropyValues(wordCount),
  );
  return bitsOfIndexes(shiftedIndexes(chunks, shifts, direction)) + bitsOf(movedTail, tailWidth);
}

/** The dates sorted, and the shifts that they give a phrase of `wordCount` words. */
function datedShifts(
  dates: readonly DateShiftDate[],
  wordCount: number,
): { readonly sortedDates: DateShiftDate[]; readonly shifts: number[] } {
  // The callers checked the count already; this narrows it, and costs nothing.
  assertWordCount(wordCount);
  const sortedDates = sortDates(dates);
  return { sortedDates, shifts: deriveShifts(sortedDates, wordCount) };
}

/** The words of a seed phrase to be masked, checked, with its dates sorted and their shifts. */
function datedPhrase(mnemonic: string, dates: readonly DateShiftDate[]) {
  const words = validatedEnglishWords(mnemonic);
  return { words, ...datedShifts(dates, words.length) };
}

/** The shifts of a phrase written without dates: none. */
function noShifts(wordCount: number): number[] {
  return Array.from({ length: wordCount }, () => 0);
}

/**
 * Shift entropy chunks, not checksum bits. The final chunk is shorter because
 * BIP39 appends its checksum to the last word. entropyToMnemonic recomputes it.
 * Modular addition is reversible even when several dates produce the same shifts.
 */
export function encodeMnemonic(mnemonic: string, dates: readonly DateShiftDate[]): EncodedResult {
  const { words, sortedDates, shifts } = datedPhrase(mnemonic, dates);
  const shiftedEntropy = shiftedEntropyBits(
    entropyBitsOf(words.join(" ")),
    shifts,
    words.length,
    1,
  );
  const shiftedWords = mnemonicFromEntropyBits(shiftedEntropy).split(" ");
  return resultFromIndexes(words, indexesOfWords(shiftedWords), sortedDates, shifts);
}

/** Original Seedshift transformation, retained for compatibility with existing records. */
export function encodeMnemonicLegacy(
  mnemonic: string,
  dates: readonly DateShiftDate[],
): EncodedResult {
  const { words, sortedDates, shifts } = datedPhrase(mnemonic, dates);
  return resultFromIndexes(
    words,
    shiftedIndexes(indexesOfWords(words), shifts, 1),
    sortedDates,
    shifts,
  );
}

/**
 * Replaces only the derived checksum bits of a legacy result, preserving its visible entropy
 * prefix.
 */
export function legacyChecksumValidResult(result: EncodedResult): EncodedResult {
  const indexes = result.shiftedIndexes;
  // An index above 2047 would write more than 11 bits and shift every later bit of the entropy.
  assertPhraseIndexes(indexes);
  const entropyLength = entropyBits(indexes.length);
  const checksumValid = mnemonicFromEntropyBits(bitsOfIndexes(indexes).slice(0, entropyLength));
  return resultFromIndexes(
    result.sourceMnemonic.split(" "),
    indexesOfWords(checksumValid.split(" ")),
    result.dates,
    result.shifts,
  );
}

/** Represents a valid mnemonic without applying any date shift. */
export function representMnemonic(mnemonic: string): EncodedResult {
  const words = validatedEnglishWords(mnemonic);
  return resultFromIndexes(words, indexesOfWords(words), [], noShifts(words.length));
}

/**
 * The dates of a record of `indexes`, checked as every decoder checks them, sorted, and the shifts
 * that they give: the indexes are a phrase's count of whole numbers from 0 through 2047.
 */
function datedRecord(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): { readonly sortedDates: DateShiftDate[]; readonly shifts: number[] } {
  assertPhraseIndexes(indexes);
  return datedShifts(dates, indexes.length);
}

/**
 * A decoded result of `recoveredIndexes`, with whether its phrase has a valid checksum: computed
 * unless the caller knows it (`checksumValid`).
 */
function decodedResult(
  recoveredIndexes: number[],
  dates: DateShiftDate[],
  shifts: number[],
  checksumValid?: boolean,
): DecodedResult {
  const recoveredMnemonic = phraseOfIndexes(recoveredIndexes);
  return {
    recoveredMnemonic,
    recoveredIndexes,
    dates,
    shifts,
    checksumValid: checksumValid ?? phraseChecksumValid(recoveredMnemonic),
  };
}

/**
 * Subtract in the same per-chunk moduli used by encodeMnemonic. The codes must keep the BIP39
 * checksum, which Masking checks before (Masking.assertCodes); call it through Masking.
 */
export function undoSeedshift(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult {
  const { sortedDates, shifts } = datedRecord(indexes, dates);
  const containerMnemonic = phraseOfIndexes(indexes);
  const recoveredMnemonic = mnemonicFromEntropyBits(
    shiftedEntropyBits(entropyBitsOf(containerMnemonic), shifts, indexes.length, -1),
  );
  return decodedResult(indexesOfWords(recoveredMnemonic.split(" ")), sortedDates, shifts);
}

/** Reverses an original Seedshift record whose shifted words need not have a valid checksum. */
export function decodeIndexesLegacy(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult {
  const { sortedDates, shifts } = datedRecord(indexes, dates);
  return decodedResult(shiftedIndexes(indexes, shifts, -1), sortedDates, shifts);
}

/**
 * Recovers every possible original mnemonic after a legacy shifted final word was
 * replaced by a checksum-valid decoy word. The replacement discards information,
 * so independent evidence is needed to select a candidate. The codes must keep the BIP39 checksum,
 * which Masking checks before (Masking.assertCodes); call it through Masking.
 */
export function undoLegacyValid(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult[] {
  const { sortedDates, shifts } = datedRecord(indexes, dates);
  const recoveredPrefix = shiftedIndexes(indexes.slice(0, -1), shifts, -1);
  // Historical records may replace the entire last word. Do not narrow this
  // search to our own checksum-only replacement without an explicit format version: every last
  // word with a valid checksum is a candidate, in the order of the word list.
  // A deliberate fast path: every last word that validLastWordIndexes gives has a valid checksum
  // by its construction, and a date search decodes many of them for every date combination.
  return validLastWordIndexes(recoveredPrefix).map((lastIndex) =>
    decodedResult([...recoveredPrefix, lastIndex], sortedDates, shifts, true),
  );
}

/**
 * The Original Seedshift undone from codes written in `format`. A compatibility entry kept for
 * existing callers; new code uses EncodedBackup.read(text, format, mode).
 */
export function decodeInputLegacy(
  value: string,
  format: EncodedFormat,
  dates: readonly DateShiftDate[],
): DecodedResult {
  return decodeIndexesLegacy(parseInput(value, format), dates);
}

/** The mnemonic of indexes that were written without date shifting: the words themselves. */
export function decodeIndexesDirect(indexes: readonly number[]): DecodedResult {
  assertPhraseIndexes(indexes);
  return decodedResult([...indexes], [], noShifts(indexes.length));
}

/**
 * Recovers a mnemonic from a direct representation that was created without date shifting. A
 * compatibility entry kept for existing callers; new code uses EncodedBackup.read(text, format,
 * "direct").
 */
export function decodeInputDirect(value: string, format: EncodedFormat): DecodedResult {
  return decodeIndexesDirect(parseInput(value, format));
}
