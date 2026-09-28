/**
 * Browser adapter for the MnemoCode core.
 *
 * The transformations, representations and record format are the unmodified
 * upstream sources vendored under packages/recovery-mnemocode/source by
 * tooling/sync-mnemocode-source.mjs. This module only adds the Derivation
 * Tool's input limits, its BIP39 validation and the result shapes used by the UI.
 */
import { validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { assertValidMnemonic } from '@ckd/core/bip39.js';
import {
  decodeIndexes,
  decodeIndexesLegacy,
  decodeIndexesLegacyValid,
  encodeMnemonic,
  encodeMnemonicLegacy,
  formatEncoded,
  indexesToColors,
  legacyChecksumValidResult,
  parseDate,
  parseInput,
  recoverLegacyValidLastWords,
  recoverMissingWord,
  representMnemonic,
  type DateShiftDate,
  type EncodedResult,
  type MissingWordCandidate,
} from '../../recovery-mnemocode/source/core.js';
import { resultFromIndexes } from '../../recovery-mnemocode/source/core/representations.js';
import {
  parseRecord,
  serializeRecord,
  type MnemoCodeRecord as CoreRecord,
} from '../../recovery-mnemocode/source/record.js';

/** Must equal the version in packages/recovery-mnemocode/source.json; a test enforces it. */
export const MNEMOCODE_VERSION = '0.1.0';

export const MNEMOCODE_FORMATS = ['english', 'indexes', 'unicode', 'colors', 'colors-unicode'] as const;
export type MnemoCodeFormat = (typeof MNEMOCODE_FORMATS)[number];

export const MNEMOCODE_MODES = ['direct', 'seedshift', 'seedshift-legacy', 'seedshift-legacy-valid'] as const;
export type MnemoCodeMode = (typeof MNEMOCODE_MODES)[number];

export type MnemoCodeDate = DateShiftDate;
export type MnemoCodeMissingWordCandidate = MissingWordCandidate;
export type MnemoCodeRecord = CoreRecord;

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

const WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const DICTIONARY_SIZE = 2048;
// Pasted browser input is bounded before any parser allocates from it.
const MAX_INPUT_LENGTH = 64 * 1024;
const FORMAT_SET = new Set<string>(MNEMOCODE_FORMATS);
const MODE_SET = new Set<string>(MNEMOCODE_MODES);

function assertInputLength(value: string): void {
  if (value.length === 0) throw new Error('Enter a MnemoCode payload or MNC1 record.');
  if (value.length > MAX_INPUT_LENGTH) throw new Error('MnemoCode input exceeds the 64 KiB safety limit.');
}

function assertMnemonicLength(value: string): void {
  if (value.length > MAX_INPUT_LENGTH) throw new Error('Mnemonic input exceeds the 64 KiB safety limit.');
}

function assertIndexes(indexes: readonly number[]): void {
  if (!WORD_COUNTS.has(indexes.length)) throw new Error('Expected 12, 15, 18, 21, or 24 BIP39 words.');
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= DICTIONARY_SIZE)) {
    throw new Error('Every BIP39 index must be an integer from 0 through 2047.');
  }
}

function assertMode(mode: MnemoCodeMode): void {
  if (!MODE_SET.has(mode)) throw new Error(`Unsupported MnemoCode mode: ${String(mode)}.`);
}

function assertFormat(format: MnemoCodeFormat): void {
  if (!FORMAT_SET.has(format)) throw new Error(`Unsupported MnemoCode format: ${String(format)}.`);
}

function englishFromIndexes(indexes: readonly number[]): string {
  assertIndexes(indexes);
  return indexes.map((index) => englishWordlist[index]!).join(' ');
}

export function recoverMnemoCodeWord(value: string): MnemoCodeMissingWordCandidate[] {
  assertMnemonicLength(value);
  return recoverMissingWord(value);
}

export function recoverMnemoCodeLegacyLastWords(value: string): MnemoCodeMissingWordCandidate[] {
  assertMnemonicLength(value);
  return recoverLegacyValidLastWords(value);
}

export function parseMnemoCodeDate(value: string): MnemoCodeDate {
  return parseDate(value);
}

export function parseMnemoCodeDates(value: string): MnemoCodeDate[] {
  return value
    .trim()
    .split(/[\s,;]+/u)
    .filter(Boolean)
    .map(parseMnemoCodeDate);
}

export function mnemoCodeIndexesToColors(indexes: readonly number[]): string[] {
  assertIndexes(indexes);
  return indexesToColors(indexes);
}

export function formatMnemoCode(indexes: readonly number[], format: MnemoCodeFormat): string {
  assertIndexes(indexes);
  assertFormat(format);
  return formatEncoded(resultFromIndexes([], indexes, [], []), format);
}

export function parseMnemoCode(value: string, format: MnemoCodeFormat): number[] {
  assertInputLength(value);
  assertFormat(format);
  const indexes = parseInput(value, format);
  assertIndexes(indexes);
  return indexes;
}

export function detectMnemoCodeFormats(value: string): MnemoCodeFormat[] {
  return MNEMOCODE_FORMATS.filter((format) => {
    try {
      parseMnemoCode(value, format);
      return true;
    } catch {
      return false;
    }
  });
}

export function serializeMnemoCodeRecord(mode: MnemoCodeMode, format: MnemoCodeFormat, payload: string): string {
  assertMode(mode);
  assertFormat(format);
  assertInputLength(payload.trim());
  return serializeRecord(mode, format, payload);
}

export function parseMnemoCodeRecord(value: string): MnemoCodeRecord | undefined {
  assertInputLength(value.trim());
  return parseRecord(value);
}

function datesForMode(mode: MnemoCodeMode, dates: readonly MnemoCodeDate[]): readonly MnemoCodeDate[] {
  if (mode === 'direct') {
    if (dates.length > 0) throw new Error('Direct mode does not use dates.');
    return [];
  }
  if (dates.length === 0) throw new Error('Seedshift modes require at least one date.');
  return dates;
}

function transform(mnemonic: string, mode: MnemoCodeMode, dates: readonly MnemoCodeDate[]): EncodedResult {
  if (mode === 'direct') return representMnemonic(mnemonic);
  if (mode === 'seedshift') return encodeMnemonic(mnemonic, dates);
  const legacy = encodeMnemonicLegacy(mnemonic, dates);
  return mode === 'seedshift-legacy-valid' ? legacyChecksumValidResult(legacy) : legacy;
}

export function encodeMnemoCode(
  mnemonic: string,
  mode: MnemoCodeMode,
  format: MnemoCodeFormat,
  dates: readonly MnemoCodeDate[] = [],
): MnemoCodeEncodeResult {
  assertMode(mode);
  assertFormat(format);
  const canonical = assertValidMnemonic(mnemonic);
  const enteredDates = datesForMode(mode, dates);
  const result = transform(canonical, mode, enteredDates);
  // A legacy phrase whose checksum is already valid needs no replacement and keeps the exact legacy profile.
  const effectiveMode =
    mode === 'seedshift-legacy-valid' &&
    result.shiftedIndexes.at(-1) === encodeMnemonicLegacy(canonical, enteredDates).shiftedIndexes.at(-1)
      ? 'seedshift-legacy'
      : mode;
  const payload = formatEncoded(result, format);
  return {
    mode: effectiveMode,
    format,
    payload,
    record: serializeMnemoCodeRecord(effectiveMode, format, payload),
    colors: indexesToColors(result.shiftedIndexes),
    checksumValid: validateMnemonic(result.shiftedEnglish.join(' '), englishWordlist),
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
  assertMode(options.mode);
  if (options.format !== 'auto') assertFormat(options.format);
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
  const dates = datesForMode(mode, options.dates ?? []);
  if (mode === 'direct') {
    const mnemonic = englishFromIndexes(indexes);
    return { mode, format, mnemonic, checksumValid: validateMnemonic(mnemonic, englishWordlist) };
  }
  if (mode === 'seedshift-legacy') {
    const { recoveredMnemonic, checksumValid } = decodeIndexesLegacy(indexes, dates);
    return { mode, format, mnemonic: recoveredMnemonic, checksumValid };
  }
  if (!validateMnemonic(englishFromIndexes(indexes), englishWordlist)) {
    throw new Error(
      mode === 'seedshift'
        ? 'The checksum-valid Seedshift container has an invalid BIP39 checksum.'
        : 'The legacy valid-last-word container has an invalid BIP39 checksum.',
    );
  }
  if (mode === 'seedshift-legacy-valid') {
    return {
      mode,
      format,
      checksumValid: true,
      candidates: decodeIndexesLegacyValid(indexes, dates).map((candidate) => candidate.recoveredMnemonic),
    };
  }
  const { recoveredMnemonic, checksumValid } = decodeIndexes(indexes, dates);
  return { mode, format, mnemonic: recoveredMnemonic, checksumValid };
}
