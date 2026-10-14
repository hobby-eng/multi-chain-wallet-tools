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
export type MaskingMode = (typeof MASKING_MODES)[number];

/** Whether `value` names a transformation mode; a record, an option or a host may pass anything. */
export function isMaskingMode(value: unknown): value is MaskingMode {
  return (MASKING_MODES as readonly unknown[]).includes(value);
}

export interface DateShiftDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface EncodedResult {
  readonly sourceMnemonic: string;
  readonly shiftedIndexes: readonly number[];
  readonly shiftedEnglish: readonly string[];
  readonly unicodeCodePoints: readonly string[];
  readonly dates: readonly DateShiftDate[];
  readonly shifts: readonly number[];
}

export interface DecodedResult {
  readonly recoveredMnemonic: string;
  readonly recoveredIndexes: readonly number[];
  readonly dates: readonly DateShiftDate[];
  readonly shifts: readonly number[];
  readonly checksumValid: boolean;
}

export interface MappingRow {
  readonly index: number;
  readonly english: string;
  readonly unicodeHex: string;
}

export interface MissingWordCandidate {
  readonly position: number;
  readonly word: string;
  readonly wordIndex: number;
  readonly mnemonic: string;
  readonly checksumBits: string;
  readonly preservesLegacyEntropy?: boolean;
}

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
