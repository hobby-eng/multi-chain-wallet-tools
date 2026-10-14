/** Shared contracts; importing types never loads renderers or platform adapters. */

// The phrase lengths belong to the sizes of BIP39, which load no word list.
export { BIP39_WORD_COUNTS, type Bip39WordCount } from "./bip39-sizes.js";

/**
 * The forms that codes are written in. Their order is the one the command line numbers them in
 * (--format 1 to 5), the menu offers them in and detection tries them in.
 */
export const ENCODED_FORMATS = Object.freeze([
  "english",
  "indexes",
  "unicode",
  "colors-unicode",
  "colors",
] as const);
/** A form of codes that a seed phrase is written in (ENCODED_FORMATS). */
export type EncodedFormat = (typeof ENCODED_FORMATS)[number];

/** Whether `value` names a form of codes; a record, an option or a host may pass anything. */
export function isEncodedFormat(value: unknown): value is EncodedFormat {
  return (ENCODED_FORMATS as readonly unknown[]).includes(value);
}
/** What encode writes: codes in one of their forms, or JSON with every form and the shifts. */
export type OutputFormat = EncodedFormat | "json";

/**
 * The transformation modes by the names that records, the command line and the menu use, in the
 * order the menu and the help name them. core/masking.ts gives each its rules; the names are here
 * so that a record is read without loading them.
 */
export const MASKING_MODES = Object.freeze([
  "direct",
  "seedshift",
  "seedshift-legacy",
  "seedshift-legacy-valid",
] as const);
/** A transformation mode: no Seedshift, or one of the Seedshifts (MASKING_MODES). */
export type MaskingMode = (typeof MASKING_MODES)[number];

/** Whether `value` names a transformation mode; a record, an option or a host may pass anything. */
export function isMaskingMode(value: unknown): value is MaskingMode {
  return (MASKING_MODES as readonly unknown[]).includes(value);
}

/** A date of the calendar, as Seedshift takes it: year, month from 1 and day from 1. */
export interface DateShiftDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * What encoding a phrase gives: the phrase, its shifted word numbers with their English words and
 * Unicode codes, the dates and the shift of each word.
 */
export interface EncodedResult {
  readonly sourceMnemonic: string;
  readonly shiftedIndexes: readonly number[];
  readonly shiftedEnglish: readonly string[];
  readonly unicodeCodePoints: readonly string[];
  readonly dates: readonly DateShiftDate[];
  readonly shifts: readonly number[];
}

/**
 * What decoding codes gives: the phrase recovered, its word numbers, the dates, the shift of each
 * word and whether the phrase's checksum is valid.
 */
export interface DecodedResult {
  readonly recoveredMnemonic: string;
  readonly recoveredIndexes: readonly number[];
  readonly dates: readonly DateShiftDate[];
  readonly shifts: readonly number[];
  readonly checksumValid: boolean;
}

/** One row of the word table: a word number, its English word and its Unicode code. */
export interface MappingRow {
  readonly index: number;
  readonly english: string;
  readonly unicodeHex: string;
}

/**
 * A candidate for a forgotten word: its place, the word and its number, the whole phrase with it
 * and its checksum bits, and, for a last word of the Original Seedshift, whether it keeps the
 * entropy of the legacy encoding (preservesLegacyEntropy).
 */
export interface MissingWordCandidate {
  readonly position: number;
  readonly word: string;
  readonly wordIndex: number;
  readonly mnemonic: string;
  readonly checksumBits: string;
  readonly preservesLegacyEntropy?: boolean;
}

/**
 * The dates that a pattern stands for: its key, the pattern written in one canonical way, and the
 * years, months and days that its digits allow.
 */
export interface DatePattern {
  readonly key: string;
  readonly years: readonly number[];
  readonly months: readonly number[];
  readonly days: readonly number[];
}

/**
 * How a form prints on cards: coloured cards, the one kind that installed designs draw, which print
 * its colors or its codes. A form without a kind has no cards (EncodedForm.cardKind). A new kind
 * comes with its first approved design.
 */
export type CardKind = "colors";
