/**
 * Browser adapter for the MnemoCode core.
 *
 * The transformations, representations and record format are the unmodified
 * upstream sources vendored under packages/recovery-mnemocode/source by
 * tooling/sync-mnemocode-source.mjs. This module only adds the Derivation
 * Tool's input limits, its BIP39 validation and the result shapes used by the UI.
 */
import { assertValidMnemonic } from "@ckd/core/bip39.js";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import {
  indexesToColors,
  parseDate,
  recoverLegacyValidLastWords,
  type MissingWordCandidate,
} from "../../recovery-mnemocode/source/core.js";
import { BackupReading } from "../../recovery-mnemocode/source/core/backup-reading.js";
import {
  BIP39_WORD_COUNTS,
  type Bip39WordCount,
} from "../../recovery-mnemocode/source/core/bip39-sizes.js";
import { WordCandidateSearch } from "../../recovery-mnemocode/source/core/candidates.js";
import { DatesAnswer } from "../../recovery-mnemocode/source/core/date-search.js";
import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import {
  phraseChecksumValid,
  phraseOfIndexes,
} from "../../recovery-mnemocode/source/core/english-words.js";
import { Masking } from "../../recovery-mnemocode/source/core/masking.js";
import { formatEncoded } from "../../recovery-mnemocode/source/core/representations.js";
import {
  ENCODED_FORMATS,
  MASKING_MODES,
  type DateShiftDate,
  type EncodedFormat,
  type MaskingMode,
} from "../../recovery-mnemocode/source/core/types.js";
import {
  parseRecord,
  type MnemoCodeRecord as CoreRecord,
} from "../../recovery-mnemocode/source/record.js";

/** Must equal the version in packages/recovery-mnemocode/source.json; a test enforces it. */
export const MNEMOCODE_VERSION = "0.1.0";

// The forms and modes are MnemoCode's own, in its order (core/types.ts).
export { ENCODED_FORMATS, MASKING_MODES };
export type MnemoCodeFormat = EncodedFormat;
export type MnemoCodeMode = MaskingMode;
export type MnemoCodeDate = DateShiftDate;
export type MnemoCodeMissingWordCandidate = MissingWordCandidate;
export type MnemoCodeRecord = CoreRecord;

export interface MnemoCodeEncodeResult {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly payload: string;
  readonly record: string;
  /** The library's JSON representation includes dates and shifts, unlike an MNC1 record. */
  readonly json: string;
  readonly colors: readonly string[];
  readonly checksumValid: boolean;
  /** The phrase that was encoded, with its words written out in full. */
  readonly mnemonic: string;
  /** The encoded words as a BIP39 phrase; absent when they fail its checksum (Original Seedshift). */
  readonly encodedMnemonic?: string;
  /** The codes as BIP39 word indexes, 0 to 2047, as a backup check compares them. */
  readonly indexes: readonly number[];
  /**
   * For the Original Seedshift: the masked phrase with a checksum-valid last word, chosen or not,
   * and whether that word differs from the shifted one (EncodedBackup.encode).
   */
  readonly validLastWord?: { readonly phrase: string; readonly changed: boolean };
}

export interface MnemoCodeDecodeResult {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly checksumValid: boolean;
  readonly mnemonic?: string;
  readonly candidates?: readonly string[];
  /**
   * Where the checksum failed, the phrases of fewer words that the first codes give with a valid
   * checksum (EncodedBackup.shorterPhrases): codes typed from printed cards end with decoys. A page
   * shows them by fingerprint only, as MnemoCode's decode does.
   */
  readonly shorter?: readonly { readonly words: Bip39WordCount; readonly mnemonic: string }[];
}

/** The lengths a seed phrase may have, for the page's word-count choices (MnemoCode's list). */
export const MNEMOCODE_PHRASE_WORD_COUNTS: readonly Bip39WordCount[] = BIP39_WORD_COUNTS;

/** The words of the seed phrase, where the person gave them: only so many words' codes are read. */
export type MnemoCodePhraseWords = Bip39WordCount | undefined;

// Pasted browser input is bounded before any parser allocates from it: the page's own limit.
const MAX_INPUT_LENGTH = 64 * 1024;
/** Where this page reads Shamir shares, which MnemoCode names when a share is typed elsewhere. */
export const MNEMOCODE_SHARE_READER = "MnemoCode's Restore tab";

function assertInputLength(value: string): void {
  if (value.length === 0) throw new Error("Enter a MnemoCode payload or MNC1 record.");
  if (value.length > MAX_INPUT_LENGTH)
    throw new Error("MnemoCode input exceeds the 64 KiB safety limit.");
}

function assertMnemonicLength(value: string): void {
  if (value.length > MAX_INPUT_LENGTH)
    throw new Error("Mnemonic input exceeds the 64 KiB safety limit.");
}

/**
 * A backup as typed or pasted, read by MnemoCode's own rules (core/backup-reading.ts): its record
 * header, and a Shamir share refused with the place this page reads it; `seedshiftOnly` refuses a
 * record without Seedshift where only a Seedshift backup will do.
 */
export function readMnemoCodeBackup(
  text: string,
  seedshiftOnly = false,
  words?: MnemoCodePhraseWords,
): BackupReading {
  assertInputLength(text.trim());
  return BackupReading.of(text, {
    seedshiftOnly,
    shareReader: MNEMOCODE_SHARE_READER,
    ...(words === undefined ? {} : { words }),
  });
}

/** The candidates of a phrase with one forgotten word, written ?: MnemoCode's word search. */
export function recoverMnemoCodeWord(value: string): MnemoCodeMissingWordCandidate[] {
  assertMnemonicLength(value);
  const search = WordCandidateSearch.parse(value, "unknown-words");
  if (search.unknownPlaces.length !== 1)
    throw new Error("Enter exactly one ? placeholder for the forgotten BIP39 word.");
  const place = search.unknownPlaces[0]!;
  return Array.from(search.candidates(), (candidate) => {
    const index = candidate.words[place]!;
    return {
      position: place + 1,
      word: englishWordlist[index]!,
      wordIndex: index + 1,
      mnemonic: candidate.phrase,
      checksumBits: candidate.checksumBits,
    };
  });
}

export function recoverMnemoCodeLegacyLastWords(value: string): MnemoCodeMissingWordCandidate[] {
  assertMnemonicLength(value);
  return recoverLegacyValidLastWords(value);
}

export function parseMnemoCodeDate(value: string): MnemoCodeDate {
  return parseDate(value);
}

/**
 * The dates of a Seedshift phrase typed in full, read by MnemoCode's own reader (DatesAnswer) with
 * its separators, limits and messages; none for an empty field, which the caller judges.
 */
export function parseMnemoCodeDates(value: string): MnemoCodeDate[] {
  if (value.length > MAX_INPUT_LENGTH)
    throw new Error("Date input exceeds the 64 KiB safety limit.");
  if (value.trim() === "") return [];
  return [...DatesAnswer.parse(value.trim(), { patterns: false }).known];
}

/**
 * The dates that `mode` takes from `text`: none for a mode without Seedshift, whose text left in
 * a hidden field is ignored (MnemoCode's Masking says which modes mask).
 */
export function mnemoCodeDatesFor(mode: MnemoCodeMode, text: string): MnemoCodeDate[] {
  return Masking.of(mode).masked ? parseMnemoCodeDates(text) : [];
}

/** Whether `mode` masks the phrase with dates, which are then needed to undo it. */
export function mnemoCodeTakesDates(mode: MnemoCodeMode): boolean {
  return Masking.of(mode).masked;
}

export function parseMnemoCodeRecord(value: string): MnemoCodeRecord | undefined {
  assertInputLength(value.trim());
  return parseRecord(value);
}

/**
 * The codes of `mnemonic` in `mode`, with `dates` where the mode takes them, made by MnemoCode's
 * own Encode (EncodedBackup.encode), which also refuses a wrong count of dates. This page offers
 * the Original Seedshift with a checksum-valid last word as a mode of its own,
 * "seedshift-legacy-valid": that is the Original Seedshift with its last word replaced, which the
 * record then names only where the word really changed.
 */
export function encodeMnemoCode(
  mnemonic: string,
  mode: MnemoCodeMode,
  format: MnemoCodeFormat,
  dates: readonly MnemoCodeDate[] = [],
): MnemoCodeEncodeResult {
  assertMnemonicLength(mnemonic);
  const validLastWord = mode === "seedshift-legacy-valid";
  const asked: MnemoCodeMode = validLastWord ? "seedshift-legacy" : mode;
  EncodedBackup.assertEncodable(asked, { validLastWord });
  Masking.of(asked).assertDateCount(dates.length);
  const canonical = assertValidMnemonic(mnemonic);
  const {
    backup,
    result: encoded,
    validLastWord: alternative,
    lastWordChanged,
  } = EncodedBackup.encode(canonical, dates, format, asked, { validLastWord });
  const encodedMnemonic = phraseOfIndexes(backup.indexes);
  const checksumValid = phraseChecksumValid(encodedMnemonic);
  return {
    mode: backup.mode,
    format,
    payload: backup.text(),
    record: backup.record(),
    json: formatEncoded(encoded, "json"),
    colors: indexesToColors(backup.indexes),
    checksumValid,
    mnemonic: canonical,
    ...(checksumValid ? { encodedMnemonic } : {}),
    indexes: [...backup.indexes],
    ...(alternative === undefined
      ? {}
      : {
          validLastWord: {
            phrase: alternative.shiftedEnglish.join(" "),
            changed: lastWordChanged,
          },
        }),
  };
}

/**
 * The codes of an input with their mode, by MnemoCode's rules: a record names its mode and form;
 * raw input takes the selected mode, and the selected form or the one form it fits.
 */
export function readMnemoCodeCodes(
  input: string,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
  words?: MnemoCodePhraseWords,
): EncodedBackup {
  const reading = readMnemoCodeBackup(input, false, words);
  const formats = reading.formats(selectedFormat === "auto" ? undefined : selectedFormat);
  if (formats.length > 1)
    throw new Error(`The input is ambiguous; select one of: ${formats.join(", ")}.`);
  return reading.codes(formats[0]!).withMode(reading.mode(Masking.of(selectedMode).mode)!);
}

/** The mode and the BIP39 indexes of the codes an input holds, for a search of their dates. */
export function mnemoCodeCodes(
  input: string,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
  words?: MnemoCodePhraseWords,
): { mode: MnemoCodeMode; indexes: number[] } {
  const backup = readMnemoCodeCodes(input, selectedMode, selectedFormat, words);
  return { mode: backup.mode, indexes: [...backup.indexes] };
}

/** The mode a decode uses: the record's own, or for raw input the selected one. */
export function effectiveMnemoCodeMode(input: string, selectedMode: MnemoCodeMode): MnemoCodeMode {
  const recorded = parseMnemoCodeRecord(input)?.mode;
  return recorded ?? Masking.of(selectedMode).mode;
}

/**
 * The encoded words of an input as a BIP39 phrase, before any date is applied, so that their
 * fingerprint can be compared with the one Encode showed. Undefined while the input cannot be read
 * or its words fail the BIP39 checksum.
 */
export function mnemoCodeEncodedPhrase(
  input: string,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
  words?: MnemoCodePhraseWords,
): string | undefined {
  try {
    return readMnemoCodeCodes(input, selectedMode, selectedFormat, words).fingerprint(
      (codes) => codes,
    );
  } catch {
    return undefined;
  }
}

/** The phrase that the codes of an input and the dates give, by the codes' mode. */
export function decodeMnemoCode(
  input: string,
  options: Readonly<{
    mode: MnemoCodeMode;
    format: MnemoCodeFormat | "auto";
    dates?: readonly MnemoCodeDate[];
    words?: MnemoCodePhraseWords;
  }>,
): MnemoCodeDecodeResult {
  const backup = readMnemoCodeCodes(input, options.mode, options.format, options.words);
  const masking = Masking.of(backup.mode);
  // A record names its own mode. Dates left in the form are no reason to refuse a Direct record.
  const dates = masking.masked ? (options.dates ?? []) : [];
  masking.assertDateCount(dates.length);
  const { mode, format } = backup;
  if (backup.givesSeveral)
    return {
      mode,
      format,
      checksumValid: true,
      candidates: backup.candidates(dates).map((candidate) => candidate.recoveredMnemonic),
    };
  const { recoveredMnemonic, checksumValid } = backup.decode(dates);
  if (checksumValid) return { mode, format, mnemonic: recoveredMnemonic, checksumValid };
  const shorter = backup
    .shorterPhrases(dates)
    .map(({ words, result }) => ({ words, mnemonic: result.recoveredMnemonic }));
  return { mode, format, mnemonic: recoveredMnemonic, checksumValid, shorter };
}
