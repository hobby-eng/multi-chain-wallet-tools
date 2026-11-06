// MnemoCode in the Deriver: a seed phrase encoded as codes and an MNC1 record, and codes decoded
// again, by MnemoCode's WebAssembly (mnemocode-engine.ts), which reads the phrase, the dates, the
// form and the mode and refuses what it does not take, in its own words. This module adds the
// page's input limits and the shapes its results take on the page.
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemocode } from "./mnemocode-engine.js";
import {
  EncodedForm,
  Masking,
  isEncodedFormat,
  isMaskingMode,
  type EncodedFormat,
  type MaskingMode,
} from "./mnemocode-facts.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";

export { ENCODED_FORMATS, MASKING_MODES, MNEMOCODE_VERSION } from "./mnemocode-facts.js";
export type MnemoCodeFormat = EncodedFormat;
export type MnemoCodeMode = MaskingMode;
/** Dates as typed, a line of them that MnemoCode reads; none for a mode without Seedshift. */
export type MnemoCodeDates = string | undefined;

/** The lengths a seed phrase may have, for the page's word-count choices. */
export const MNEMOCODE_PHRASE_WORD_COUNTS = Object.freeze([12, 15, 18, 21, 24] as const);
/** The words of the seed phrase, where the person gave them: only so many words' codes are read. */
export type MnemoCodePhraseWords = (typeof MNEMOCODE_PHRASE_WORD_COUNTS)[number] | undefined;

/** Where this page reads Shamir shares, which MnemoCode names when a share is typed elsewhere. */
export const MNEMOCODE_SHARE_READER = "MnemoCode's Restore tab";
/** Where this page reads an encoded seed phrase, which MnemoCode names when one is typed as a share. */
export const MNEMOCODE_DECODE_ENTRY = "MnemoCode › Decode";

export interface MnemoCodeEncodeResult {
  /** The mode the record names: a replaced last word names the valid one. */
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  /** The codes, as the form writes them. */
  readonly payload: string;
  readonly record: string;
  /** The colours of the codes, for a form written in colours. */
  readonly colors?: readonly string[];
  /** Whether the codes, read as English words, keep the BIP39 checksum. */
  readonly checksumValid: boolean;
  /** The phrase that was encoded. */
  readonly mnemonic: string;
  /** The codes as English words: the masked phrase, or the phrase itself without Seedshift. */
  readonly shiftedEnglish: string;
  readonly originalFingerprint: string;
  /** The fingerprint of the codes read as a phrase, where MnemoCode gives one. */
  readonly encodedFingerprint: string | undefined;
  /** For the Original Seedshift: the masked phrase with a checksum-valid last word, and whether it changed. */
  readonly validLastWord?: { readonly phrase: string; readonly changed: boolean };
}

export interface MnemoCodeDecodeResult {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
  readonly checksumValid: boolean;
  readonly mnemonic?: string;
  /** Every phrase a record with a replaced last word may hold. */
  readonly candidates?: readonly string[];
  /**
   * Where the checksum failed, the phrases of fewer words that the first codes give with a valid
   * checksum: codes typed from printed cards end with decoys. A page shows them by fingerprint.
   */
  readonly shorter?: readonly { readonly words: number; readonly mnemonic: string }[];
}

/** Whether `mode` masks the phrase with dates, which are then needed to undo it. */
export function mnemoCodeTakesDates(mode: MnemoCodeMode): boolean {
  return Masking.of(mode).masked;
}

/** The dates that `mode` takes from `text`: none for a mode without Seedshift. */
export function mnemoCodeDatesFor(mode: MnemoCodeMode, text: string): MnemoCodeDates {
  if (!Masking.of(mode).masked) return undefined;
  MnemoCodeInputAdmission.assertSize(text, "Date input");
  return text;
}

/**
 * A backup as typed or pasted, read by MnemoCode: its record header, and a Shamir share refused
 * with the place this page reads it; `seedshiftOnly` refuses a record without Seedshift. The
 * caller frees it.
 */
export function readMnemoCodeBackup(
  text: string,
  seedshiftOnly = false,
  words?: MnemoCodePhraseWords,
) {
  MnemoCodeInputAdmission.backup(text);
  return mnemocode().ReadBackup.read(
    text,
    seedshiftOnly,
    MNEMOCODE_SHARE_READER,
    words ?? Number.NaN,
  );
}

/** What an MNC1 record names: its mode and its form. */
export interface MnemoCodeRecordHeader {
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat;
}

/**
 * The mode and the form that a record names, once MnemoCode has read the backup; none for raw
 * codes. Refused as MnemoCode refuses the backup.
 */
export function mnemoCodeRecordHeader(text: string): MnemoCodeRecordHeader | undefined {
  using reading = readMnemoCodeBackup(text);
  if (!reading.hasRecord) return undefined;
  const [, mode, format] = /^MNC1:([a-z-]+):([a-z-]+):/u.exec(text.trim()) ?? [];
  return isMaskingMode(mode) && isEncodedFormat(format) ? { mode, format } : undefined;
}

/** The codes of a backup as typed: after a record's header, or the text itself. */
export function mnemoCodeCodesText(text: string): string {
  const header = /^\s*MNC1:[a-z-]+:[a-z-]+:/u.exec(text)?.[0];
  return header === undefined ? text : text.slice(header.length);
}

/** The mode a record header names, read from MNC1:<mode>:<form>:; none for raw codes. */
function recordedMode(record: string): MnemoCodeMode | undefined {
  const mode = /^MNC1:([a-z-]+):/u.exec(record)?.[1];
  return isMaskingMode(mode) ? mode : undefined;
}

/**
 * The codes of `mnemonic` in `mode`, with `dates` where it takes them. This page offers the
 * Original Seedshift with a checksum-valid last word as a mode of its own, which is the Original
 * Seedshift with its last word replaced: the record names it only where the word changed.
 */
export function encodeMnemoCode(
  mnemonic: string,
  mode: MnemoCodeMode,
  format: MnemoCodeFormat,
  dates: MnemoCodeDates,
): MnemoCodeEncodeResult {
  MnemoCodeInputAdmission.assertSize(mnemonic, "Mnemonic input");
  const validLastWord = mode === "seedshift-legacy-valid";
  const asked: MnemoCodeMode = validLastWord ? "seedshift-legacy" : mode;
  const binding = mnemocode();
  const encode = (form: MnemoCodeFormat, valid: boolean) =>
    binding.EncodedBackup.encode(mnemonic, dates, form, asked, valid);
  const form = EncodedForm.of(format);
  using backup = encode(format, validLastWord);
  // The masked words, and the colours of a form written in colours, are the same backup written
  // in another form; without Seedshift the words are the phrase itself, which MnemoCode does not
  // write as unmasked English codes.
  const masked = Masking.of(asked).masked;
  using english = format === "english" || !masked ? undefined : encode("english", validLastWord);
  using colored =
    form.writtenInColors && format !== "colors" ? encode("colors", validLastWord) : undefined;
  const payload = backup.codes();
  const record = backup.record();
  const shiftedEnglish = english?.codes() ?? (masked ? payload : mnemonic);
  const colors = form.writtenInColors ? (colored?.codes() ?? payload).split(/\s+/u) : undefined;
  let alternative: MnemoCodeEncodeResult["validLastWord"];
  if (asked === "seedshift-legacy" && !validLastWord) {
    using valid = encode("english", true);
    alternative = { phrase: valid.codes(), changed: valid.lastWordChanged };
  }
  return {
    mode: recordedMode(record) ?? asked,
    format,
    payload,
    record,
    ...(colors === undefined ? {} : { colors }),
    checksumValid: validateMnemonic(shiftedEnglish, wordlist),
    mnemonic,
    shiftedEnglish,
    originalFingerprint: backup.originalFingerprint,
    encodedFingerprint: backup.encodedFingerprint(),
    ...(alternative === undefined ? {} : { validLastWord: alternative }),
  };
}

type BackupReading = ReturnType<typeof readMnemoCodeBackup>;

/**
 * The form and the mode that the codes of `reading` take: a record names its own; raw codes take
 * the selected mode, and the selected form or the one form they fit.
 */
function formAndMode(
  reading: BackupReading,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
): { format: MnemoCodeFormat; mode: MnemoCodeMode } {
  const formats = reading.forms(selectedFormat === "auto" ? undefined : selectedFormat);
  if (formats.length > 1)
    throw new Error(`The input is ambiguous; select one of: ${formats.join(", ")}.`);
  const mode = reading.mode(selectedMode);
  return {
    format: formats[0] as MnemoCodeFormat,
    mode: isMaskingMode(mode) ? mode : selectedMode,
  };
}

/** The mode a decode uses: the record's own, or for raw codes the selected one. */
export function effectiveMnemoCodeMode(input: string, selectedMode: MnemoCodeMode): MnemoCodeMode {
  try {
    using reading = readMnemoCodeBackup(input);
    const mode = reading.mode(selectedMode);
    return isMaskingMode(mode) ? mode : selectedMode;
  } catch {
    return selectedMode;
  }
}

/** The form and the mode of the codes an input holds, for a search of their dates. */
export function mnemoCodeFormAndMode(
  input: string,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
  words?: MnemoCodePhraseWords,
): { format: MnemoCodeFormat; mode: MnemoCodeMode } {
  using reading = readMnemoCodeBackup(input, false, words);
  return formAndMode(reading, selectedMode, selectedFormat);
}

/**
 * The fingerprint of the codes of an input read as a phrase, before any date, so that it can be
 * compared with the one Encode showed; undefined while the input cannot be read or MnemoCode gives
 * the codes no fingerprint.
 */
export function mnemoCodeEncodedFingerprint(
  input: string,
  selectedMode: MnemoCodeMode,
  selectedFormat: MnemoCodeFormat | "auto",
  words?: MnemoCodePhraseWords,
): string | undefined {
  try {
    using reading = readMnemoCodeBackup(input, false, words);
    const { format, mode } = formAndMode(reading, selectedMode, selectedFormat);
    if (Masking.of(mode).givesSeveral || mode === "seedshift-legacy") return undefined;
    // Without dates, the codes are undone as they are: the phrase they spell.
    using decoded = reading.decode(format, "direct", undefined);
    return decoded.encodedFingerprint;
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
    dates?: string | undefined;
    words?: MnemoCodePhraseWords;
  }>,
): MnemoCodeDecodeResult {
  using reading = readMnemoCodeBackup(input, false, options.words);
  const { format, mode } = formAndMode(reading, options.mode, options.format);
  // A record names its own mode. Dates left in the form are no reason to refuse a Direct record.
  const dates = Masking.of(mode).masked ? options.dates : undefined;
  using decoded = reading.decode(format, mode, dates);
  if (decoded.count > 1)
    return {
      mode,
      format,
      checksumValid: true,
      candidates: Array.from({ length: decoded.count }, (_, at) => decoded.phrase(at) ?? ""),
    };
  const mnemonic = decoded.phrase(0) ?? "";
  const checksumValid = decoded.checksumValid(0);
  if (checksumValid || options.words !== undefined)
    return { mode, format, mnemonic, checksumValid };
  // Codes typed from printed cards end with decoys: the phrases that fewer words give.
  const shorter = MNEMOCODE_PHRASE_WORD_COUNTS.flatMap((words) => {
    try {
      using fewer = readMnemoCodeBackup(input, false, words);
      using result = fewer.decode(format, mode, dates);
      const phrase = result.phrase(0);
      return result.count === 1 && result.checksumValid(0) && phrase !== undefined
        ? [{ words, mnemonic: phrase }]
        : [];
    } catch {
      return [];
    }
  });
  return { mode, format, mnemonic, checksumValid, shorter };
}
