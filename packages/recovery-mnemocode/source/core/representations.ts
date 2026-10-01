import {
  englishWordlist,
  traditionalChineseWordlist,
  ENGLISH_INDEX,
  UNICODE_INDEX,
  WORD_COUNT_SET,
  canonicalEnglishWords,
  unicodeHex,
} from './words.js';
import {
  colorsToIndexes,
  indexesToColors,
  parseColors,
  colorsToUnicode,
  unicodeToColors,
} from './colors.js';
import { formatDate } from './dates.js';
import type { EncodedResult, OutputFormat, DateShiftDate } from './types.js';

export function resultFromIndexes(
  words: readonly string[],
  shiftedIndexes: readonly number[],
  dates: readonly DateShiftDate[],
  shifts: readonly number[],
): EncodedResult {
  return {
    sourceMnemonic: words.join(' '),
    shiftedIndexes,
    shiftedEnglish: shiftedIndexes.map((index) => englishWordlist[index]!),
    unicodeCodePoints: shiftedIndexes.map((index) =>
      unicodeHex(traditionalChineseWordlist[index]!),
    ),
    dates,
    shifts,
  };
}

export function parseInput(value: string, format: Exclude<OutputFormat, 'json'>): number[] {
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
      const indexes = items.map((item) => Number(item));
      if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > 2048)) {
        throw new Error('Indexes use Seedshift-compatible numbering from 1 through 2048.');
      }
      return indexes.map((index) => index - 1);
    }
    case 'unicode': {
      const compact = value.replace(/\s+/gu, '').toUpperCase();
      if (!/^[0-9A-F]+$/u.test(compact) || compact.length % 4 !== 0) {
        throw new Error(
          'Unicode input must be four-digit hexadecimal code points, separated by spaces or joined.',
        );
      }
      return Array.from({ length: compact.length / 4 }, (_, index) =>
        compact.slice(index * 4, index * 4 + 4),
      ).map((hex, position) => {
        const wordIndex = UNICODE_INDEX.get(hex);
        if (wordIndex === undefined)
          throw new Error(
            `Unicode code point at position ${position + 1} is not part of the mapped BIP39 table.`,
          );
        return wordIndex;
      });
    }
    case 'colors':
      return colorsToIndexes(parseColors(value));
    case 'colors-unicode':
      return colorsToIndexes(unicodeToColors(value));
    default:
      throw new Error(`Unsupported input format: ${String(format)}.`);
  }
}

const DETECTABLE_FORMATS = ['english', 'indexes', 'unicode', 'colors', 'colors-unicode'] as const;

/** Returns every raw representation parser that accepts a complete standard-length record. */
export function detectInputFormats(value: string): Array<Exclude<OutputFormat, 'json'>> {
  return DETECTABLE_FORMATS.filter((format) => {
    try {
      const indexes = parseInput(value, format);
      return WORD_COUNT_SET.has(indexes.length);
    } catch {
      return false;
    }
  });
}

export function formatEncoded(result: EncodedResult, format: OutputFormat): string {
  switch (format) {
    case 'english':
      return result.shiftedEnglish.join(' ');
    case 'indexes':
      return result.shiftedIndexes.map((index) => String(index + 1)).join(' ');
    case 'unicode':
      return result.unicodeCodePoints.join('');
    case 'colors':
      return indexesToColors(result.shiftedIndexes).join(' ');
    case 'colors-unicode':
      return colorsToUnicode(indexesToColors(result.shiftedIndexes));
    case 'json':
      return JSON.stringify(
        {
          algorithm: 'Seedshift-compatible date shift',
          dates: result.dates.map(formatDate),
          shifts: result.shifts,
          english: result.shiftedEnglish,
          indexes: result.shiftedIndexes.map((index) => index + 1),
          unicodeCodePoints: result.unicodeCodePoints.join(''),
        },
        null,
        2,
      );
    default:
      throw new Error(`Unsupported output format: ${String(format)}.`);
  }
}
