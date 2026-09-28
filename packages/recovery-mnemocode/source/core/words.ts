import { validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as traditionalChineseWordlist } from '@scure/bip39/wordlists/traditional-chinese.js';
import {
  BIP39_WORD_COUNTS,
  type Bip39WordCount,
  type MappingRow,
  type MissingWordCandidate,
} from './types.js';
export { englishWordlist, traditionalChineseWordlist };

export const BIP39_INDEX_BITS = 11;
export const BIP39_DICTIONARY_SIZE = 2 ** BIP39_INDEX_BITS;

export function validatedEnglishWords(mnemonic: string): string[] {
  const words = canonicalEnglishWords(mnemonic);
  assertWordCount(words.length);
  if (!validateMnemonic(words.join(' '), englishWordlist)) {
    throw new Error(
      'The source mnemonic has an invalid BIP39 checksum. Check the words and their order before encoding.',
    );
  }
  return words;
}

export const WORD_COUNT_SET = new Set<number>(BIP39_WORD_COUNTS);

export const ENGLISH_INDEX = new Map(englishWordlist.map((word, index) => [word, index]));

// Lookup keys are four-digit code points, not the visible Chinese characters.
export const UNICODE_INDEX = new Map(
  traditionalChineseWordlist.map((word, index) => [unicodeHex(word), index]),
);

export function canonicalEnglishWords(mnemonic: string): string[] {
  const words = mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!WORD_COUNT_SET.has(words.length)) {
    throw new Error('Enter 12, 15, 18, 21, or 24 English BIP39 words.');
  }
  for (const [position, word] of words.entries()) {
    if (!ENGLISH_INDEX.has(word)) {
      throw new Error(`Unknown English BIP39 word at position ${position + 1}.`);
    }
  }
  return words;
}

export function assertWordCount(count: number): asserts count is Bip39WordCount {
  if (!WORD_COUNT_SET.has(count)) throw new Error('Expected 12, 15, 18, 21, or 24 word indexes.');
}

export function unicodeHex(symbol: string): string {
  const points = Array.from(symbol);
  if (points.length !== 1)
    throw new Error('The selected mapped BIP39 character is not one Unicode scalar value.');
  return points[0]!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
}

export function mappingRow(index: number): MappingRow {
  if (!Number.isInteger(index) || index < 1 || index > BIP39_DICTIONARY_SIZE)
    throw new Error('A wordlist index must be from 1 through 2048.');
  const zeroBased = index - 1;
  return {
    index,
    english: englishWordlist[zeroBased]!,
    unicodeHex: unicodeHex(traditionalChineseWordlist[zeroBased]!),
  };
}

export function allMappingRows(): MappingRow[] {
  return Array.from({ length: BIP39_DICTIONARY_SIZE }, (_, index) => mappingRow(index + 1));
}

export function recoverMissingWord(value: string): MissingWordCandidate[] {
  const words = value.normalize('NFKD').trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!WORD_COUNT_SET.has(words.length)) {
    throw new Error('Enter 12, 15, 18, 21, or 24 English BIP39 words with one ? placeholder.');
  }
  const missing = words.flatMap((word, index) => (word === '?' ? [index] : []));
  if (missing.length !== 1)
    throw new Error('Enter exactly one ? placeholder for the forgotten BIP39 word.');
  for (const [position, word] of words.entries()) {
    if (word !== '?' && !ENGLISH_INDEX.has(word))
      throw new Error(`Unknown English BIP39 word at position ${position + 1}.`);
  }
  const missingIndex = missing[0]!;
  return recoverWordAt(words, missingIndex);
}

function recoverWordAt(words: readonly string[], missingIndex: number): MissingWordCandidate[] {
  const checksumLength = words.length / 3;
  const candidates: MissingWordCandidate[] = [];
  for (const [index, word] of englishWordlist.entries()) {
    const candidateWords = [...words];
    candidateWords[missingIndex] = word;
    const mnemonic = candidateWords.join(' ');
    if (!validateMnemonic(mnemonic, englishWordlist)) continue;
    const indexes = candidateWords.map((candidate) => ENGLISH_INDEX.get(candidate)!);
    const bitStream = indexes
      .map((candidate) => candidate.toString(2).padStart(BIP39_INDEX_BITS, '0'))
      .join('');
    candidates.push({
      position: missingIndex + 1,
      word,
      wordIndex: index + 1,
      mnemonic,
      checksumBits: bitStream.slice(-checksumLength),
    });
  }
  return candidates;
}

/**
 * Enumerates checksum-valid replacement containers for an old exact-legacy
 * shifted phrase. The supplied final word may have an invalid BIP39 checksum;
 * it is retained only to identify the one replacement that preserves its
 * entropy-bearing high bits.
 */
export function recoverLegacyValidLastWords(value: string): MissingWordCandidate[] {
  const words = canonicalEnglishWords(value);
  const finalPosition = words.length - 1;
  const checksumLength = words.length / 3;
  const finalIndex = ENGLISH_INDEX.get(words[finalPosition]!)!;
  const legacyEntropyTail = finalIndex >> checksumLength;
  const incomplete = [...words];
  incomplete[finalPosition] = '?';
  return recoverWordAt(incomplete, finalPosition).map((candidate) => ({
    ...candidate,
    preservesLegacyEntropy: (candidate.wordIndex - 1) >> checksumLength === legacyEntropyTail,
  }));
}
