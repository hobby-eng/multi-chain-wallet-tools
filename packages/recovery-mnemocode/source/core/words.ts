import { entropyToMnemonic } from "@scure/bip39";
import { completeHexUnits, fitsPattern, UNICODE_CODE_DIGITS, hexCodePoint } from "./code-text.js";
import { wordlist as traditionalChineseWordlist } from "@scure/bip39/wordlists/traditional-chinese.js";
import {
  BIP39_DICTIONARY_SIZE,
  BIP39_INDEX_BITS,
  checksumBits,
  lastWordEntropyBits,
  lastWordEntropyValues,
  WORD_NUMBER_DIGITS,
  WORD_NUMBER_RANGE,
  WORD_NUMBERS_THROUGH,
  isBip39WordCount,
  WORD_COUNTS_TEXT,
  assertWordCount,
} from "./bip39-sizes.js";
import {
  englishTokens,
  englishWordlist,
  ENGLISH_INDEX,
  phraseChecksumValid,
  phraseOfIndexes,
  wordsOfIndexes,
  indexesOfWords,
  fingerprintOfValidPhrase,
} from "./english-words.js";
import { bitsOf, bitsOfIndexes, bitsToBytes, lastWordChecksumBits } from "./bits.js";
import type { MappingRow, MissingWordCandidate } from "./types.js";
import { inWholeRange, wholeNumberOf } from "./typed-number.js";
export { englishWordlist, traditionalChineseWordlist };
// The English words alone belong to english-words.ts; here too for the modules that take both.
export {
  englishTokens,
  ENGLISH_INDEX,
  fingerprintOfValidPhrase,
  phraseChecksumValid,
  phraseOfIndexes,
  wordsOfIndexes,
};

// The sizes of a phrase belong to bip39-sizes.ts, which loads no word list; here too for the
// modules that already take the words.
export { BIP39_DICTIONARY_SIZE, BIP39_INDEX_BITS };

export function validatedEnglishWords(mnemonic: string): string[] {
  const words = canonicalEnglishWords(mnemonic);
  assertWordCount(words.length);
  if (!phraseChecksumValid(words.join(" "))) {
    throw new Error("These words fail the BIP39 checksum: check each word and their order.");
  }
  return words;
}

// Lookup keys are four-digit code points, not the visible Chinese characters.
/** The Unicode code of each word, by its index: four hexadecimal digits of its Chinese word. */
export const UNICODE_CODES: readonly string[] = Object.freeze(
  traditionalChineseWordlist.map(unicodeHex),
);
export const UNICODE_INDEX: ReadonlyMap<string, number> = new Map(
  UNICODE_CODES.map((code, index) => [code, index]),
);

/** The word indexes whose Unicode code fits `pattern`, a ? standing for any digit. */
export function unicodeCodesFitting(pattern: string): number[] {
  return UNICODE_CODES.flatMap((code, index) => (fitsPattern(pattern, code) ? [index] : []));
}

/** The Unicode codes of BIP39 indexes, counted from 0. */
export function unicodeCodesOfIndexes(indexes: readonly number[]): string[] {
  return indexes.map((index) => UNICODE_CODES[index]!);
}

export function canonicalEnglishWords(mnemonic: string): string[] {
  const words = englishTokens(mnemonic);
  if (!isBip39WordCount(words.length)) {
    throw new Error(`Enter ${WORD_COUNTS_TEXT} English BIP39 words.`);
  }
  for (const [position, word] of words.entries()) {
    if (!ENGLISH_INDEX.has(word)) {
      throw new Error(`Unknown English BIP39 word at position ${position + 1}.`);
    }
  }
  return words;
}

/** A word number as written: decimal digits, leading zeros allowed, such as 7 or 0007. */
const WORD_NUMBER = /^\d+$/u;

/**
 * The word index, counted from 0, of a word number as written in `syntax`, counted from 1 as
 * Seedshift does, for WORD_NUMBER_RANGE; undefined when it is none. Every reader of word numbers
 * (phrases, shares, the word table, marked codes) reads them through it.
 */
export function wordIndexOf(token: string, syntax: RegExp = WORD_NUMBER): number | undefined {
  const number = wholeNumberOf(token, syntax, WORD_NUMBER_RANGE);
  return number === undefined ? undefined : number - WORD_NUMBER_RANGE.min;
}

/**
 * Why digits longer than any word number cannot be read: they are word numbers written together,
 * which no reader can tell apart, as 1234 may be 1 234, 12 34 or 1234 itself. Codes of a fixed
 * width, such as Unicode codes and colors, may be run together; word numbers may not.
 */
export const WORD_NUMBERS_RUN_TOGETHER =
  "Word numbers run together cannot be told apart: write them apart, separated by spaces.";

/**
 * Whether `token`, digits and ? for unread ones, is word numbers run together: more digits than
 * the highest word number has, and no word number with leading zeros, such as 00007.
 */
export function runTogetherNumbers(token: string): boolean {
  return (
    /^[0-9?]+$/u.test(token) &&
    token.length > WORD_NUMBER_DIGITS &&
    wordIndexOf(token) === undefined
  );
}

/** wordIndexOf for a word number of a phrase; throws why it is none, its digits or its range. */
export function wordIndexOfNumber(token: string): number {
  if (runTogetherNumbers(token)) throw new Error(WORD_NUMBERS_RUN_TOGETHER);
  if (!WORD_NUMBER.test(token))
    throw new Error(`Indexes must be decimal integers from ${WORD_NUMBERS_THROUGH}.`);
  const index = wordIndexOf(token);
  if (index === undefined)
    throw new Error(`Indexes use Seedshift-compatible numbering from ${WORD_NUMBERS_THROUGH}.`);
  return index;
}

/**
 * The word indexes of Unicode codes, four hexadecimal digits each, written apart or joined: the
 * one reader of codes for phrases and shares. A refusal names the place, never the code.
 */
export function unicodeIndexesOf(text: string): number[] {
  const codes = completeHexUnits(text, UNICODE_CODE_DIGITS);
  if (codes === undefined)
    throw new Error(
      "Unicode codes have four hexadecimal digits each, separated by spaces or joined.",
    );
  return codes.map((code, place) => {
    const index = UNICODE_INDEX.get(code);
    if (index === undefined) throw new Error(`Unicode code ${place + 1} is not a BIP39 word.`);
    return index;
  });
}

// The count rule belongs to bip39-sizes.ts, which loads no word list; here too for its old callers.
export { assertWordCount };

export function unicodeHex(symbol: string): string {
  const points = Array.from(symbol);
  if (points.length !== 1)
    throw new Error("The selected mapped BIP39 character is not one Unicode scalar value.");
  return hexCodePoint(points[0]!.codePointAt(0)!);
}

export function mappingRow(index: number): MappingRow {
  if (!inWholeRange(index, WORD_NUMBER_RANGE))
    throw new Error(`A wordlist index must be from ${WORD_NUMBERS_THROUGH}.`);
  const zeroBased = index - 1;
  return {
    index,
    english: englishWordlist[zeroBased]!,
    unicodeHex: UNICODE_CODES[zeroBased]!,
  };
}

export function allMappingRows(): MappingRow[] {
  return Array.from({ length: BIP39_DICTIONARY_SIZE }, (_, index) => mappingRow(index + 1));
}

/** What a look-up in the word table starts from: a word, its number or its Unicode code. */
export type WordTableLookup = "word" | "index" | "unicode";

/** How a Unicode code of the word table is written, for hints. */
export const UNICODE_CODE_HINT = "four hexadecimal digits, such as 5BF6";

/** Each look-up: the index, counted from 0, of the row that `typed` names, and its refusal. */
const WORD_TABLE_LOOKUPS: Readonly<
  Record<
    WordTableLookup,
    { readonly find: (typed: string) => number | undefined; readonly refusal: string }
  >
> = {
  word: {
    // As a phrase reads its words: one word, in any case.
    find: (typed) => {
      const words = englishTokens(typed);
      return words.length === 1 ? ENGLISH_INDEX.get(words[0]!) : undefined;
    },
    refusal: "That word is not in the English BIP39 list.",
  },
  index: {
    find: (typed) => wordIndexOf(typed),
    refusal: `A word number is a whole number from ${WORD_NUMBERS_THROUGH}.`,
  },
  unicode: {
    find: (typed) => UNICODE_INDEX.get(typed.toUpperCase()),
    refusal: `No BIP39 word has that code; type ${UNICODE_CODE_HINT}.`,
  },
};

/** The row of a word, a word number or a Unicode code, as `mnemocode table` finds it. */
export function wordTableRow(lookup: WordTableLookup, text: string): MappingRow {
  const { find, refusal } = WORD_TABLE_LOOKUPS[lookup];
  const index = find(text.trim());
  if (index === undefined) throw new Error(refusal);
  return mappingRow(index + 1);
}

/** The columns of the word table as a text, in the order of MappingRow. */
const WORD_TABLE_HEADER = ["index", "english", "unicode_hex"] as const;

/** Every row, tab-separated with a header line, as `mnemocode table --all` prints it. */
export function wordTableText(): string {
  const rows = allMappingRows().map((row) => [row.index, row.english, row.unicodeHex]);
  return [WORD_TABLE_HEADER, ...rows].map((columns) => columns.join("\t") + "\n").join("");
}

/**
 * The valid last words of `words`, whose last word is missing, in the order of the word list,
 * found without validating 2,048 phrases: the last word holds 11 − checksum bits of entropy, and
 * BIP39 gives each of their values one checksum (entropyToMnemonic). This keeps the startup
 * self-test, which recovers last words, quick. Forgotten words elsewhere are the word search's
 * (WordCandidateSearch, candidates.ts).
 */
function finalWordCandidates(words: readonly string[]): MissingWordCandidate[] {
  const prefix = indexesOfWords(words.slice(0, -1));
  return validLastWordIndexes(prefix).map((index) => {
    const word = englishWordlist[index]!;
    return {
      position: words.length,
      word,
      wordIndex: index + 1,
      mnemonic: [...words.slice(0, -1), word].join(" "),
      checksumBits: lastWordChecksumBits(index, words.length),
    };
  });
}

/**
 * The word numbers, counted from 0 and in their order, that end a phrase of `prefix` (every word
 * but the last, as BIP39 indexes) with a valid checksum: one for each value of the entropy bits
 * that the last word holds, 2^(11 − checksum bits) of them, found from the entropy rather than by
 * validating 2,048 phrases.
 */
export function validLastWordIndexes(prefix: readonly number[]): number[] {
  const wordCount = prefix.length + 1;
  const tailBits = lastWordEntropyBits(wordCount);
  const knownBits = bitsOfIndexes(prefix);
  const indexes: number[] = [];
  for (let tail = 0; tail < lastWordEntropyValues(wordCount); tail += 1) {
    const entropy = bitsToBytes(knownBits + bitsOf(tail, tailBits));
    const mnemonic = entropyToMnemonic(entropy, englishWordlist);
    // One of the candidates is the wallet's.
    entropy.fill(0);
    indexes.push(ENGLISH_INDEX.get(mnemonic.slice(mnemonic.lastIndexOf(" ") + 1))!);
  }
  return indexes;
}

/**
 * Enumerates checksum-valid replacement containers for an old exact-legacy
 * shifted phrase. The supplied final word may have an invalid BIP39 checksum;
 * it is retained only to identify the one replacement that preserves its
 * entropy-bearing high bits.
 */
export function recoverLegacyValidLastWords(value: string): MissingWordCandidate[] {
  // A ? typed out of habit would otherwise be refused as a word that is no BIP39 word.
  if (englishTokens(value).includes("?"))
    throw new Error("This mode needs the exact old final word: ? stands for no word here.");
  const words = canonicalEnglishWords(value);
  const finalPosition = words.length - 1;
  const checksumLength = checksumBits(words.length);
  const finalIndex = ENGLISH_INDEX.get(words[finalPosition]!)!;
  const legacyEntropyTail = finalIndex >> checksumLength;
  const incomplete = [...words];
  incomplete[finalPosition] = "?";
  return finalWordCandidates(incomplete).map((candidate) => ({
    ...candidate,
    preservesLegacyEntropy: (candidate.wordIndex - 1) >> checksumLength === legacyEntropyTail,
  }));
}
