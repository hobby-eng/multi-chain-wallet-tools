/** Shared contracts; importing types never loads renderers or platform adapters. */

export const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

export type Bip39WordCount = (typeof BIP39_WORD_COUNTS)[number];

export type OutputFormat = 'english' | 'indexes' | 'unicode' | 'colors' | 'colors-unicode' | 'json';

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
