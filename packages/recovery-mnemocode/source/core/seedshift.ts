import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import {
  BIP39_INDEX_BITS,
  BIP39_DICTIONARY_SIZE,
  englishWordlist,
  traditionalChineseWordlist,
  ENGLISH_INDEX,
  assertWordCount,
  validatedEnglishWords,
  unicodeHex,
} from './words.js';
import { modulo, bytesToBits, bitsToBytes } from './bits.js';
import { sortDates, deriveShifts } from './dates.js';
import { resultFromIndexes, parseInput } from './representations.js';
import type { EncodedResult, DecodedResult, DateShiftDate, OutputFormat } from './types.js';

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

function encodedResultLegacy(
  words: readonly string[],
  dates: readonly DateShiftDate[],
  shifts: readonly number[],
): EncodedResult {
  return resultFromIndexes(
    words,
    words.map((word, index) =>
      modulo(ENGLISH_INDEX.get(word)! + shifts[index]!, BIP39_DICTIONARY_SIZE),
    ),
    dates,
    shifts,
  );
}

/**
 * Shift entropy chunks, not checksum bits. The final chunk is shorter because
 * BIP39 appends its checksum to the last word. entropyToMnemonic recomputes it.
 * Modular addition is reversible even when several dates produce the same shifts.
 */
export function encodeMnemonic(mnemonic: string, dates: readonly DateShiftDate[]): EncodedResult {
  const words = validatedEnglishWords(mnemonic);
  assertWordCount(words.length);
  const sortedDates = sortDates(dates);
  const shifts = deriveShifts(sortedDates, words.length);
  const entropyBits = entropyBitsOf(words.join(' '));
  const checksumBits = words.length / 3;
  const tailWidth = BIP39_INDEX_BITS - checksumBits;
  const shiftedChunks = Array.from({ length: words.length - 1 }, (_, index) =>
    modulo(
      Number.parseInt(
        entropyBits.slice(index * BIP39_INDEX_BITS, index * BIP39_INDEX_BITS + BIP39_INDEX_BITS),
        2,
      ) + shifts[index]!,
      BIP39_DICTIONARY_SIZE,
    ),
  );
  const tail = Number.parseInt(entropyBits.slice(-tailWidth), 2);
  const shiftedTail = modulo(tail + shifts.at(-1)!, 2 ** tailWidth);
  const shiftedEntropyBits =
    shiftedChunks.map((chunk) => chunk.toString(2).padStart(BIP39_INDEX_BITS, '0')).join('') +
    shiftedTail.toString(2).padStart(tailWidth, '0');
  const shiftedWords = mnemonicFromEntropyBits(shiftedEntropyBits).split(' ');
  return resultFromIndexes(
    words,
    shiftedWords.map((word) => ENGLISH_INDEX.get(word)!),
    sortedDates,
    shifts,
  );
}

/** Original Seedshift transformation, retained for compatibility with existing records. */
export function encodeMnemonicLegacy(
  mnemonic: string,
  dates: readonly DateShiftDate[],
): EncodedResult {
  const words = validatedEnglishWords(mnemonic);
  assertWordCount(words.length);
  const sortedDates = sortDates(dates);
  const shifts = deriveShifts(sortedDates, words.length);
  return encodedResultLegacy(words, sortedDates, shifts);
}

/** Replaces only the derived checksum bits of a legacy result, preserving its visible entropy prefix. */
export function legacyChecksumValidResult(result: EncodedResult): EncodedResult {
  const indexes = result.shiftedIndexes;
  assertWordCount(indexes.length);
  const checksumBits = indexes.length / 3;
  const entropyLength = indexes.length * BIP39_INDEX_BITS - checksumBits;
  const bitStream = indexes
    .map((index) => index.toString(2).padStart(BIP39_INDEX_BITS, '0'))
    .join('');
  const mnemonic = mnemonicFromEntropyBits(bitStream.slice(0, entropyLength));
  const shiftedEnglish = mnemonic.split(' ');
  const shiftedIndexes = shiftedEnglish.map((word) => ENGLISH_INDEX.get(word)!);
  return {
    ...result,
    shiftedIndexes,
    shiftedEnglish,
    unicodeCodePoints: shiftedIndexes.map((index) =>
      unicodeHex(traditionalChineseWordlist[index]!),
    ),
  };
}

/** Represents a valid mnemonic without applying any date shift. */
export function representMnemonic(mnemonic: string): EncodedResult {
  const words = validatedEnglishWords(mnemonic);
  return resultFromIndexes(
    words,
    words.map((word) => ENGLISH_INDEX.get(word)!),
    [],
    Array.from({ length: words.length }, () => 0),
  );
}

/** Subtract in the same per-chunk moduli used by encodeMnemonic. */
export function decodeIndexes(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult {
  assertWordCount(indexes.length);
  if (
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= BIP39_DICTIONARY_SIZE)
  ) {
    throw new Error('Every BIP39 index must be an integer from 0 through 2047.');
  }
  const sortedDates = sortDates(dates);
  const shifts = deriveShifts(sortedDates, indexes.length);
  const containerMnemonic = indexes.map((index) => englishWordlist[index]!).join(' ');
  if (!validateMnemonic(containerMnemonic, englishWordlist)) {
    throw new Error(
      'The checksum-valid Seedshift record has an invalid BIP39 checksum. Check the recorded data or select the original Seedshift compatibility mode.',
    );
  }
  const entropyBits = entropyBitsOf(containerMnemonic);
  const checksumBits = indexes.length / 3;
  const tailWidth = BIP39_INDEX_BITS - checksumBits;
  const recoveredChunks = Array.from({ length: indexes.length - 1 }, (_, index) =>
    modulo(
      Number.parseInt(
        entropyBits.slice(index * BIP39_INDEX_BITS, index * BIP39_INDEX_BITS + BIP39_INDEX_BITS),
        2,
      ) - shifts[index]!,
      BIP39_DICTIONARY_SIZE,
    ),
  );
  const shiftedTail = Number.parseInt(entropyBits.slice(-tailWidth), 2);
  const recoveredTail = modulo(shiftedTail - shifts.at(-1)!, 2 ** tailWidth);
  const recoveredEntropyBits =
    recoveredChunks.map((chunk) => chunk.toString(2).padStart(BIP39_INDEX_BITS, '0')).join('') +
    recoveredTail.toString(2).padStart(tailWidth, '0');
  const recoveredMnemonic = mnemonicFromEntropyBits(recoveredEntropyBits);
  const recoveredIndexes = recoveredMnemonic.split(' ').map((word) => ENGLISH_INDEX.get(word)!);
  return {
    recoveredMnemonic,
    recoveredIndexes,
    dates: sortedDates,
    shifts,
    checksumValid: validateMnemonic(recoveredMnemonic, englishWordlist),
  };
}

/** Reverses an original Seedshift record whose shifted words need not have a valid checksum. */
export function decodeIndexesLegacy(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult {
  assertWordCount(indexes.length);
  if (
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= BIP39_DICTIONARY_SIZE)
  ) {
    throw new Error('Every BIP39 index must be an integer from 0 through 2047.');
  }
  const sortedDates = sortDates(dates);
  const shifts = deriveShifts(sortedDates, indexes.length);
  const recoveredIndexes = indexes.map((index, position) =>
    modulo(index - shifts[position]!, BIP39_DICTIONARY_SIZE),
  );
  const recoveredMnemonic = recoveredIndexes.map((index) => englishWordlist[index]!).join(' ');
  return {
    recoveredMnemonic,
    recoveredIndexes,
    dates: sortedDates,
    shifts,
    checksumValid: validateMnemonic(recoveredMnemonic, englishWordlist),
  };
}

/**
 * Recovers every possible original mnemonic after a legacy shifted final word was
 * replaced by a checksum-valid decoy word. The replacement discards information,
 * so independent evidence is needed to select a candidate.
 */
export function decodeIndexesLegacyValid(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult[] {
  assertWordCount(indexes.length);
  const containerMnemonic = indexes.map((index) => englishWordlist[index]!).join(' ');
  if (!validateMnemonic(containerMnemonic, englishWordlist)) {
    throw new Error('The legacy valid-last-word container has an invalid BIP39 checksum.');
  }
  const sortedDates = sortDates(dates);
  const shifts = deriveShifts(sortedDates, indexes.length);
  const recoveredPrefix = indexes
    .slice(0, -1)
    .map((index, position) => modulo(index - shifts[position]!, BIP39_DICTIONARY_SIZE));
  // Historical records may replace the entire last word. Do not narrow this
  // search to our own checksum-only replacement without an explicit format version.
  const candidates: DecodedResult[] = [];
  for (let lastIndex = 0; lastIndex < BIP39_DICTIONARY_SIZE; lastIndex += 1) {
    const recoveredIndexes = [...recoveredPrefix, lastIndex];
    const recoveredMnemonic = recoveredIndexes.map((index) => englishWordlist[index]!).join(' ');
    if (validateMnemonic(recoveredMnemonic, englishWordlist)) {
      candidates.push({
        recoveredMnemonic,
        recoveredIndexes,
        dates: sortedDates,
        shifts,
        checksumValid: true,
      });
    }
  }
  return candidates;
}

export function decodeInput(
  value: string,
  format: Exclude<OutputFormat, 'json'>,
  dates: readonly DateShiftDate[],
): DecodedResult {
  return decodeIndexes(parseInput(value, format), dates);
}

export function decodeInputLegacy(
  value: string,
  format: Exclude<OutputFormat, 'json'>,
  dates: readonly DateShiftDate[],
): DecodedResult {
  return decodeIndexesLegacy(parseInput(value, format), dates);
}

/** Recovers a mnemonic from a direct representation that was created without date shifting. */
export function decodeInputDirect(
  value: string,
  format: Exclude<OutputFormat, 'json'>,
): DecodedResult {
  const indexes = parseInput(value, format);
  assertWordCount(indexes.length);
  const recoveredMnemonic = indexes.map((index) => englishWordlist[index]!).join(' ');
  return {
    recoveredMnemonic,
    recoveredIndexes: indexes,
    dates: [],
    shifts: indexes.map(() => 0),
    checksumValid: validateMnemonic(recoveredMnemonic, englishWordlist),
  };
}
