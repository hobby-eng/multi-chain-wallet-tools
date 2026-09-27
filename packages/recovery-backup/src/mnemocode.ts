import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as traditionalChineseWordlist } from '@scure/bip39/wordlists/traditional-chinese.js';
import { assertValidMnemonic } from '@ckd/core/bip39.js';

export const MNEMOCODE_VERSION = '0.1.0';

export const MNEMOCODE_FORMATS = ['english', 'indexes', 'unicode', 'colors', 'colors-unicode'] as const;
export type MnemoCodeFormat = (typeof MNEMOCODE_FORMATS)[number];

export const MNEMOCODE_MODES = ['direct', 'seedshift', 'seedshift-legacy', 'seedshift-legacy-valid'] as const;
export type MnemoCodeMode = (typeof MNEMOCODE_MODES)[number];

export interface MnemoCodeDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface MnemoCodeEncodeResult {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly payload: string;
  readonly record: string;
  readonly colors: readonly string[];
  readonly checksumValid: boolean;
}

export interface MnemoCodeDecodeResult {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly checksumValid: boolean;
  readonly mnemonic?: string;
  readonly candidates?: readonly string[];
}

export interface MnemoCodeMissingWordCandidate {
  readonly position: number;
  readonly word: string;
  readonly wordIndex: number;
  readonly mnemonic: string;
  readonly checksumBits: string;
  readonly preservesLegacyEntropy?: boolean;
}

export interface MnemoCodeRecord {
  readonly version: 1;
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly payload: string;
}

const WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const DICTIONARY_SIZE = 2048;
const INDEX_BITS = 11;
const MAX_INPUT_LENGTH = 64 * 1024;
const ENGLISH_INDEX = new Map(englishWordlist.map((word, index) => [word, index]));
const UNICODE_INDEX = new Map(traditionalChineseWordlist.map((word, index) => [unicodeHex(word), index]));
const FORMAT_SET = new Set<string>(MNEMOCODE_FORMATS);
const MODE_SET = new Set<string>(MNEMOCODE_MODES);

function assertInputLength(value: string): void {
  if (value.length === 0) throw new Error('Enter a MnemoCode payload or MNC1 record.');
  if (value.length > MAX_INPUT_LENGTH) throw new Error('MnemoCode input exceeds the 64 KiB safety limit.');
}

function assertWordCount(count: number): void {
  if (!WORD_COUNTS.has(count)) throw new Error('Expected 12, 15, 18, 21, or 24 BIP39 words.');
}

function assertIndexes(indexes: readonly number[]): void {
  assertWordCount(indexes.length);
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= DICTIONARY_SIZE)) {
    throw new Error('Every BIP39 index must be an integer from 0 through 2047.');
  }
}

function canonicalEnglishWords(value: string): string[] {
  const words = value.normalize('NFKD').trim().toLowerCase().split(/\s+/u).filter(Boolean);
  assertWordCount(words.length);
  for (const [position, word] of words.entries()) {
    if (!ENGLISH_INDEX.has(word)) throw new Error(`Unknown English BIP39 word at position ${position + 1}.`);
  }
  return words;
}

export function recoverMnemoCodeWord(value: string): MnemoCodeMissingWordCandidate[] {
  if (value.length > MAX_INPUT_LENGTH) throw new Error('Mnemonic input exceeds the 64 KiB safety limit.');
  const words = value.normalize('NFKD').trim().toLowerCase().split(/\s+/u).filter(Boolean);
  assertWordCount(words.length);
  const missing = words.flatMap((word, index) => (word === '?' ? [index] : []));
  if (missing.length !== 1) {
    throw new Error('Enter exactly one ? placeholder for the forgotten BIP39 word.');
  }
  for (const [position, word] of words.entries()) {
    if (word !== '?' && !ENGLISH_INDEX.has(word)) {
      throw new Error(`Unknown English BIP39 word at position ${position + 1}.`);
    }
  }

  return recoverMnemoCodeWordAt(words, missing[0]!);
}

function recoverMnemoCodeWordAt(words: readonly string[], missingIndex: number): MnemoCodeMissingWordCandidate[] {
  const checksumLength = words.length / 3;
  const candidates: MnemoCodeMissingWordCandidate[] = [];
  for (const [index, word] of englishWordlist.entries()) {
    const candidateWords = [...words];
    candidateWords[missingIndex] = word;
    const mnemonic = candidateWords.join(' ');
    if (!validateMnemonic(mnemonic, englishWordlist)) continue;
    const bits = candidateWords
      .map((candidate) => ENGLISH_INDEX.get(candidate)!.toString(2).padStart(INDEX_BITS, '0'))
      .join('');
    candidates.push({
      position: missingIndex + 1,
      word,
      wordIndex: index + 1,
      mnemonic,
      checksumBits: bits.slice(-checksumLength),
    });
  }
  return candidates;
}

export function recoverMnemoCodeLegacyLastWords(value: string): MnemoCodeMissingWordCandidate[] {
  if (value.length > MAX_INPUT_LENGTH) {
    throw new Error('Mnemonic input exceeds the 64 KiB safety limit.');
  }
  const words = canonicalEnglishWords(value);
  const finalPosition = words.length - 1;
  const checksumLength = words.length / 3;
  const finalIndex = ENGLISH_INDEX.get(words[finalPosition]!)!;
  const legacyEntropyTail = finalIndex >> checksumLength;
  const incomplete = [...words];
  incomplete[finalPosition] = '?';
  return recoverMnemoCodeWordAt(incomplete, finalPosition).map((candidate) => ({
    ...candidate,
    preservesLegacyEntropy: (candidate.wordIndex - 1) >> checksumLength === legacyEntropyTail,
  }));
}

function unicodeHex(symbol: string): string {
  const points = Array.from(symbol);
  if (points.length !== 1) throw new Error('A mapped BIP39 entry must be one Unicode scalar value.');
  return points[0]!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
}

function modulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function bytesToBits(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
}

function bitsToBytes(bits: string): Uint8Array {
  if (bits.length % 8 !== 0 || !/^[01]+$/u.test(bits)) {
    throw new Error('BIP39 entropy must contain a whole number of bytes.');
  }
  return Uint8Array.from({ length: bits.length / 8 }, (_, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
  );
}

function mnemonicFromBits(bits: string): string {
  const entropy = bitsToBytes(bits);
  try {
    return entropyToMnemonic(entropy, englishWordlist);
  } finally {
    entropy.fill(0);
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function assertDate(date: MnemoCodeDate): void {
  if (!Number.isInteger(date.year) || date.year < 1 || date.year > 9999) {
    throw new Error('A date year must be an integer from 0001 through 9999.');
  }
  if (!Number.isInteger(date.month) || date.month < 1 || date.month > 12) {
    throw new Error('A date month must be an integer from 1 through 12.');
  }
  if (!Number.isInteger(date.day) || date.day < 1 || date.day > daysInMonth(date.year, date.month)) {
    throw new Error('The day is outside the selected calendar month.');
  }
}

export function parseMnemoCodeDate(value: string): MnemoCodeDate {
  const text = value.trim();
  const dayMonthYear = /^(\d{2})-(\d{2})-(\d{4})$/u.exec(text);
  const yearMonthDay = /^(\d{1,4})-(\d{2})-(\d{2})$/u.exec(text);
  if (dayMonthYear === null && yearMonthDay === null) {
    throw new Error('Invalid date. Use DD-MM-YYYY or YYYY-MM-DD.');
  }
  const match = dayMonthYear ?? yearMonthDay!;
  const date =
    dayMonthYear === null
      ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      : { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  assertDate(date);
  return date;
}

export function parseMnemoCodeDates(value: string): MnemoCodeDate[] {
  const items = value
    .trim()
    .split(/[\s,;]+/u)
    .filter(Boolean);
  return items.map(parseMnemoCodeDate);
}

function sortedDates(dates: readonly MnemoCodeDate[]): MnemoCodeDate[] {
  const sorted = [...dates].sort(
    (left, right) => left.year - right.year || left.month - right.month || left.day - right.day,
  );
  sorted.forEach(assertDate);
  return sorted;
}

function shiftsFor(dates: readonly MnemoCodeDate[], wordCount: number): number[] {
  assertWordCount(wordCount);
  if (dates.length === 0) throw new Error('Seedshift modes require at least one date.');
  if (dates.length > wordCount / 3) {
    throw new Error(`${wordCount}-word phrases support at most ${wordCount / 3} dates.`);
  }
  const sequence = sortedDates(dates).flatMap((date) => [date.year, date.month, date.day]);
  return Array.from({ length: wordCount }, (_, index) => sequence[index % sequence.length]!);
}

function indexesFromMnemonic(mnemonic: string): number[] {
  return canonicalEnglishWords(mnemonic).map((word) => ENGLISH_INDEX.get(word)!);
}

function mnemonicFromIndexes(indexes: readonly number[]): string {
  assertIndexes(indexes);
  return indexes.map((index) => englishWordlist[index]!).join(' ');
}

function directIndexes(mnemonic: string): number[] {
  return indexesFromMnemonic(assertValidMnemonic(mnemonic));
}

function seedshiftIndexes(mnemonic: string, dates: readonly MnemoCodeDate[]): number[] {
  const canonical = assertValidMnemonic(mnemonic);
  const words = canonical.split(' ');
  const shifts = shiftsFor(dates, words.length);
  const entropy = mnemonicToEntropy(canonical, englishWordlist);
  try {
    const entropyBits = bytesToBits(entropy);
    const checksumBits = words.length / 3;
    const tailWidth = INDEX_BITS - checksumBits;
    const chunks = Array.from({ length: words.length - 1 }, (_, index) =>
      modulo(
        Number.parseInt(entropyBits.slice(index * INDEX_BITS, index * INDEX_BITS + INDEX_BITS), 2) + shifts[index]!,
        DICTIONARY_SIZE,
      ),
    );
    const tail = Number.parseInt(entropyBits.slice(-tailWidth), 2);
    const shiftedTail = modulo(tail + shifts.at(-1)!, 2 ** tailWidth);
    const shiftedBits =
      chunks.map((chunk) => chunk.toString(2).padStart(INDEX_BITS, '0')).join('') +
      shiftedTail.toString(2).padStart(tailWidth, '0');
    return indexesFromMnemonic(mnemonicFromBits(shiftedBits));
  } finally {
    entropy.fill(0);
  }
}

function legacyIndexes(mnemonic: string, dates: readonly MnemoCodeDate[]): number[] {
  const source = directIndexes(mnemonic);
  const shifts = shiftsFor(dates, source.length);
  return source.map((index, position) => modulo(index + shifts[position]!, DICTIONARY_SIZE));
}

function checksumValidLegacyIndexes(indexes: readonly number[]): number[] {
  assertIndexes(indexes);
  const checksumBits = indexes.length / 3;
  const entropyLength = indexes.length * INDEX_BITS - checksumBits;
  const bits = indexes.map((index) => index.toString(2).padStart(INDEX_BITS, '0')).join('');
  return indexesFromMnemonic(mnemonicFromBits(bits.slice(0, entropyLength)));
}

function recoverSeedshift(indexes: readonly number[], dates: readonly MnemoCodeDate[]): string {
  assertIndexes(indexes);
  const container = mnemonicFromIndexes(indexes);
  if (!validateMnemonic(container, englishWordlist)) {
    throw new Error('The checksum-valid Seedshift container has an invalid BIP39 checksum.');
  }
  const shifts = shiftsFor(dates, indexes.length);
  const entropy = mnemonicToEntropy(container, englishWordlist);
  try {
    const entropyBits = bytesToBits(entropy);
    const checksumBits = indexes.length / 3;
    const tailWidth = INDEX_BITS - checksumBits;
    const chunks = Array.from({ length: indexes.length - 1 }, (_, index) =>
      modulo(
        Number.parseInt(entropyBits.slice(index * INDEX_BITS, index * INDEX_BITS + INDEX_BITS), 2) - shifts[index]!,
        DICTIONARY_SIZE,
      ),
    );
    const tail = Number.parseInt(entropyBits.slice(-tailWidth), 2);
    const recoveredTail = modulo(tail - shifts.at(-1)!, 2 ** tailWidth);
    const recoveredBits =
      chunks.map((chunk) => chunk.toString(2).padStart(INDEX_BITS, '0')).join('') +
      recoveredTail.toString(2).padStart(tailWidth, '0');
    return mnemonicFromBits(recoveredBits);
  } finally {
    entropy.fill(0);
  }
}

function recoverLegacy(indexes: readonly number[], dates: readonly MnemoCodeDate[]): string {
  assertIndexes(indexes);
  const shifts = shiftsFor(dates, indexes.length);
  return mnemonicFromIndexes(indexes.map((index, position) => modulo(index - shifts[position]!, DICTIONARY_SIZE)));
}

function recoverLegacyCandidates(indexes: readonly number[], dates: readonly MnemoCodeDate[]): string[] {
  assertIndexes(indexes);
  const container = mnemonicFromIndexes(indexes);
  if (!validateMnemonic(container, englishWordlist)) {
    throw new Error('The legacy valid-last-word container has an invalid BIP39 checksum.');
  }
  const shifts = shiftsFor(dates, indexes.length);
  const prefix = indexes.slice(0, -1).map((index, position) => modulo(index - shifts[position]!, DICTIONARY_SIZE));
  const candidates: string[] = [];
  for (let lastIndex = 0; lastIndex < DICTIONARY_SIZE; lastIndex += 1) {
    const mnemonic = mnemonicFromIndexes([...prefix, lastIndex]);
    if (validateMnemonic(mnemonic, englishWordlist)) candidates.push(mnemonic);
  }
  return candidates;
}

const COLOR_COUNTS = new Set([8, 10, 12, 14, 16]);

export function mnemoCodeIndexesToColors(indexes: readonly number[]): string[] {
  assertIndexes(indexes);
  const digits = indexes.map((index) => String(index + 1).padStart(4, '0')).join('');
  return Array.from({ length: digits.length / 6 }, (_, position) => {
    const payload = digits.slice(position * 6, position * 6 + 6);
    const order = indexes.length === 12 ? position * 2 : position;
    return `#${Number(`${order}${payload}`).toString(16).toUpperCase().padStart(6, '0')}`;
  });
}

function parseColors(value: string): string[] {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[;,\s]+/gu, '');
  let colors: string[];
  if (compact.includes('#')) {
    if (!/^(?:#[0-9A-F]{6})+$/u.test(compact)) {
      throw new Error('Colors must use #RRGGBB codes, separated or concatenated.');
    }
    colors = compact.match(/#[0-9A-F]{6}/gu)!;
  } else {
    if (!/^[0-9A-F]+$/u.test(compact) || compact.length % 6 !== 0) {
      throw new Error('A continuous RGB stream must contain complete six-digit RRGGBB values.');
    }
    colors = Array.from({ length: compact.length / 6 }, (_, index) => `#${compact.slice(index * 6, index * 6 + 6)}`);
  }
  if (!COLOR_COUNTS.has(colors.length)) {
    throw new Error('Enter 8, 10, 12, 14, or 16 colors for a standard BIP39 word count.');
  }
  return colors;
}

function indexesFromColors(colors: readonly string[]): number[] {
  if (!COLOR_COUNTS.has(colors.length)) {
    throw new Error('Enter 8, 10, 12, 14, or 16 colors for a standard BIP39 word count.');
  }
  const encoded = colors
    .map((color) => {
      if (!/^#[0-9A-F]{6}$/u.test(color)) throw new Error('Each color must use uppercase #RRGGBB form.');
      return Number.parseInt(color.slice(1), 16).toString(10).padStart(8, '0');
    })
    .sort();
  const step = colors.length === 8 ? 2 : 1;
  for (let index = 1; index < encoded.length; index += 1) {
    if (Number(encoded[index]!.slice(0, 2)) - Number(encoded[index - 1]!.slice(0, 2)) !== step) {
      throw new Error('These colors do not form a valid BIP39Colors-compatible set.');
    }
  }
  const digits = encoded.map((color) => color.slice(-6)).join('');
  const indexes = Array.from(
    { length: digits.length / 4 },
    (_, index) => Number(digits.slice(index * 4, index * 4 + 4)) - 1,
  );
  assertIndexes(indexes);
  return indexes;
}

const COLOR_UNICODE_BASE = 0xe000;
const COLOR_UNICODE_WIDTH = 0x1900;
const COLOR_UNICODE_CODE_POINT_DIGITS = 4;

function colorsToUnicode(colors: readonly string[]): string {
  return colors
    .map((color) => {
      const value = Number.parseInt(color.slice(1), 16);
      return [
        COLOR_UNICODE_BASE + Math.floor(value / COLOR_UNICODE_WIDTH),
        COLOR_UNICODE_BASE + (value % COLOR_UNICODE_WIDTH),
      ]
        .map((point) => point.toString(16).toUpperCase().padStart(COLOR_UNICODE_CODE_POINT_DIGITS, '0'))
        .join('');
    })
    .join('');
}

function unicodeToColors(value: string): string[] {
  const compact = value.replace(/[\s,;]+/gu, '');
  const points =
    /^[0-9A-F]+$/iu.test(compact) && compact.length % COLOR_UNICODE_CODE_POINT_DIGITS === 0
      ? Array.from({ length: compact.length / COLOR_UNICODE_CODE_POINT_DIGITS }, (_, index) =>
          Number.parseInt(
            compact.slice(
              index * COLOR_UNICODE_CODE_POINT_DIGITS,
              index * COLOR_UNICODE_CODE_POINT_DIGITS + COLOR_UNICODE_CODE_POINT_DIGITS,
            ),
            16,
          ),
        )
      : Array.from(value)
          .filter((point) => !/\s/u.test(point))
          .map((point) => point.codePointAt(0)!);
  if (![16, 20, 24, 28, 32].includes(points.length)) {
    throw new Error('Color Unicode must contain two code points per CSS color.');
  }
  if (points.some((point) => point < COLOR_UNICODE_BASE || point >= COLOR_UNICODE_BASE + COLOR_UNICODE_WIDTH)) {
    throw new Error('Color Unicode uses only MnemoCode Private Use Area code points.');
  }
  return Array.from({ length: points.length / 2 }, (_, index) => {
    const value =
      (points[index * 2]! - COLOR_UNICODE_BASE) * COLOR_UNICODE_WIDTH + points[index * 2 + 1]! - COLOR_UNICODE_BASE;
    if (value > 0xffffff) throw new Error('Color Unicode contains a value outside the #RRGGBB range.');
    return `#${value.toString(16).toUpperCase().padStart(6, '0')}`;
  });
}

export function formatMnemoCode(indexes: readonly number[], format: MnemoCodeFormat): string {
  assertIndexes(indexes);
  switch (format) {
    case 'english':
      return mnemonicFromIndexes(indexes);
    case 'indexes':
      return indexes.map((index) => String(index + 1)).join(' ');
    case 'unicode':
      return indexes.map((index) => unicodeHex(traditionalChineseWordlist[index]!)).join('');
    case 'colors':
      return mnemoCodeIndexesToColors(indexes).join(' ');
    case 'colors-unicode':
      return colorsToUnicode(mnemoCodeIndexesToColors(indexes));
  }
}

export function parseMnemoCode(value: string, format: MnemoCodeFormat): number[] {
  assertInputLength(value);
  switch (format) {
    case 'english':
      return canonicalEnglishWords(value).map((word) => ENGLISH_INDEX.get(word)!);
    case 'indexes': {
      const items = value
        .trim()
        .split(/[\s,]+/u)
        .filter(Boolean);
      if (items.some((item) => !/^\d+$/u.test(item))) {
        throw new Error('Indexes must be decimal integers from 1 through 2048.');
      }
      const indexes = items.map(Number);
      if (indexes.some((index) => index < 1 || index > DICTIONARY_SIZE)) {
        throw new Error('Indexes use MnemoCode numbering from 1 through 2048.');
      }
      const zeroBased = indexes.map((index) => index - 1);
      assertIndexes(zeroBased);
      return zeroBased;
    }
    case 'unicode': {
      const compact = value.replace(/\s+/gu, '').toUpperCase();
      if (!/^[0-9A-F]+$/u.test(compact) || compact.length % 4 !== 0) {
        throw new Error('Unicode input must contain complete four-digit hexadecimal code points.');
      }
      const indexes = Array.from({ length: compact.length / 4 }, (_, index) =>
        compact.slice(index * 4, index * 4 + 4),
      ).map((hex, position) => {
        const wordIndex = UNICODE_INDEX.get(hex);
        if (wordIndex === undefined) {
          throw new Error(`Unicode code point at position ${position + 1} is not in the mapped BIP39 table.`);
        }
        return wordIndex;
      });
      assertIndexes(indexes);
      return indexes;
    }
    case 'colors':
      return indexesFromColors(parseColors(value));
    case 'colors-unicode':
      return indexesFromColors(unicodeToColors(value));
  }
}

export function detectMnemoCodeFormats(value: string): MnemoCodeFormat[] {
  return MNEMOCODE_FORMATS.filter((format) => {
    try {
      return WORD_COUNTS.has(parseMnemoCode(value, format).length);
    } catch {
      return false;
    }
  });
}

export function serializeMnemoCodeRecord(mode: MnemoCodeMode, format: MnemoCodeFormat, payload: string): string {
  if (!MODE_SET.has(mode)) throw new Error(`Unsupported MnemoCode mode: ${String(mode)}.`);
  if (!FORMAT_SET.has(format)) throw new Error(`Unsupported MnemoCode format: ${String(format)}.`);
  const normalized = payload.trim();
  assertInputLength(normalized);
  return `MNC1:${mode}:${format}:${normalized}`;
}

export function parseMnemoCodeRecord(value: string): MnemoCodeRecord | undefined {
  const normalized = value.trim();
  assertInputLength(normalized);
  if (!normalized.startsWith('MNC')) return undefined;
  const match = /^MNC(\d+):(direct|seedshift|seedshift-legacy|seedshift-legacy-valid):([a-z-]+):([\s\S]+)$/u.exec(
    normalized,
  );
  if (match === null) throw new Error('Malformed MnemoCode record header.');
  if (match[1] !== '1') throw new Error(`Unsupported MnemoCode record version: ${match[1]}.`);
  if (!FORMAT_SET.has(match[3]!)) throw new Error(`Unsupported MnemoCode record format: ${match[3]}.`);
  return {
    version: 1,
    mode: match[2] as MnemoCodeMode,
    format: match[3] as MnemoCodeFormat,
    payload: match[4]!,
  };
}

function datesForMode(mode: MnemoCodeMode, dates: readonly MnemoCodeDate[], wordCount: number): MnemoCodeDate[] {
  if (mode === 'direct') {
    if (dates.length > 0) throw new Error('Direct mode does not use dates.');
    return [];
  }
  const sorted = sortedDates(dates);
  shiftsFor(sorted, wordCount);
  return sorted;
}

export function encodeMnemoCode(
  mnemonic: string,
  mode: MnemoCodeMode,
  format: MnemoCodeFormat,
  dates: readonly MnemoCodeDate[] = [],
): MnemoCodeEncodeResult {
  if (!MODE_SET.has(mode)) throw new Error(`Unsupported MnemoCode mode: ${String(mode)}.`);
  if (!FORMAT_SET.has(format)) throw new Error(`Unsupported MnemoCode format: ${String(format)}.`);
  const canonical = assertValidMnemonic(mnemonic);
  const wordCount = canonical.split(' ').length;
  const enteredDates = datesForMode(mode, dates, wordCount);
  let indexes: number[];
  let effectiveMode = mode;
  if (mode === 'direct') indexes = directIndexes(canonical);
  else if (mode === 'seedshift') indexes = seedshiftIndexes(canonical, enteredDates);
  else {
    const legacy = legacyIndexes(canonical, enteredDates);
    if (mode === 'seedshift-legacy-valid') {
      indexes = checksumValidLegacyIndexes(legacy);
      if (indexes.at(-1) === legacy.at(-1)) effectiveMode = 'seedshift-legacy';
    } else {
      indexes = legacy;
    }
  }
  const payload = formatMnemoCode(indexes, format);
  return {
    mode: effectiveMode,
    format,
    payload,
    record: serializeMnemoCodeRecord(effectiveMode, format, payload),
    colors: mnemoCodeIndexesToColors(indexes),
    checksumValid: validateMnemonic(mnemonicFromIndexes(indexes), englishWordlist),
  };
}

export function decodeMnemoCode(
  input: string,
  options: Readonly<{
    mode: MnemoCodeMode;
    format: MnemoCodeFormat | 'auto';
    dates?: readonly MnemoCodeDate[];
  }>,
): MnemoCodeDecodeResult {
  if (!MODE_SET.has(options.mode)) throw new Error(`Unsupported MnemoCode mode: ${String(options.mode)}.`);
  if (options.format !== 'auto' && !FORMAT_SET.has(options.format)) {
    throw new Error(`Unsupported MnemoCode format: ${String(options.format)}.`);
  }
  const record = parseMnemoCodeRecord(input);
  const mode = record?.mode ?? options.mode;
  const raw = record?.payload ?? input.trim();
  let format = record?.format;
  if (format === undefined) {
    if (options.format === 'auto') {
      const detected = detectMnemoCodeFormats(raw);
      if (detected.length === 0) throw new Error('The MnemoCode representation format could not be detected.');
      if (detected.length > 1) throw new Error(`The input is ambiguous; select one of: ${detected.join(', ')}.`);
      format = detected[0]!;
    } else {
      format = options.format;
    }
  }
  const indexes = parseMnemoCode(raw, format);
  const dates = datesForMode(mode, options.dates ?? [], indexes.length);
  if (mode === 'seedshift-legacy-valid') {
    return {
      mode,
      format,
      checksumValid: true,
      candidates: recoverLegacyCandidates(indexes, dates),
    };
  }
  const mnemonic =
    mode === 'direct'
      ? mnemonicFromIndexes(indexes)
      : mode === 'seedshift-legacy'
        ? recoverLegacy(indexes, dates)
        : recoverSeedshift(indexes, dates);
  return {
    mode,
    format,
    mnemonic,
    checksumValid: validateMnemonic(mnemonic, englishWordlist),
  };
}
