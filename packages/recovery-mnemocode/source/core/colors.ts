import { assertWordCount, BIP39_DICTIONARY_SIZE } from './words.js';

const RGB_REFERENCE_COUNTS = [8, 10, 12, 14, 16];
const WORD_POSITION_DIGITS = 4;
const RGB_PAYLOAD_DIGITS = 6;
const ORDER_TAG_DIGITS = 2;
const RGB_HEX_DIGITS = 6;
const RGB_MAX_VALUE = 0xffffff;

/** CSS RGB packing of BIP39 indexes. The 12- and 24-word cases are BIP39Colors-compatible. */
export function indexesToColors(indexes: readonly number[]): string[] {
  assertWordCount(indexes.length);
  if (
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= BIP39_DICTIONARY_SIZE)
  ) {
    throw new Error('Every BIP39 index must be an integer from 0 through 2047.');
  }
  // Four decimal digits per 1-based word position; each RGB stores six of
  // those digits plus an order tag. This is the BIP39Colors wire format, not
  // ordinary 11-bit BIP39 packing. Preserve the special 12-word tag stride.
  const digitString = indexes
    .map((index) => String(index + 1).padStart(WORD_POSITION_DIGITS, '0'))
    .join('');
  return Array.from({ length: digitString.length / RGB_PAYLOAD_DIGITS }, (_, position) => {
    const chunk = digitString.slice(
      position * RGB_PAYLOAD_DIGITS,
      position * RGB_PAYLOAD_DIGITS + RGB_PAYLOAD_DIGITS,
    );
    const orderingTag = indexes.length === 12 ? position * 2 : position;
    const value = Number(`${orderingTag}${chunk}`);
    return `#${value.toString(16).toUpperCase().padStart(RGB_HEX_DIGITS, '0')}`;
  });
}

export function parseColors(value: string): string[] {
  const normalized = value.trim().toUpperCase();
  const compact = normalized.replace(/[;,\s]+/gu, '');
  let colors: string[];
  if (compact.includes('#')) {
    if (!/^(?:#[0-9A-F]{6})+$/u.test(compact))
      throw new Error('Colors must use #RRGGBB codes, separated or concatenated.');
    colors = compact.match(/#[0-9A-F]{6}/gu)!;
  } else {
    if (!/^[0-9A-F]+$/u.test(compact) || compact.length % 6 !== 0) {
      throw new Error('A continuous RGB stream must contain complete six-digit RRGGBB values.');
    }
    colors = Array.from(
      { length: compact.length / 6 },
      (_, index) => `#${compact.slice(index * 6, index * 6 + 6)}`,
    );
  }
  if (!RGB_REFERENCE_COUNTS.includes(colors.length))
    throw new Error('Enter 8, 10, 12, 14, or 16 colors for a standard BIP39 word count.');
  return colors;
}

export function colorsToIndexes(colors: readonly string[]): number[] {
  if (!RGB_REFERENCE_COUNTS.includes(colors.length))
    throw new Error('Enter 8, 10, 12, 14, or 16 colors for a standard BIP39 word count.');
  const encoded = colors
    .map((color) => {
      if (!/^#[0-9A-F]{6}$/u.test(color))
        throw new Error('Each color must use uppercase #RRGGBB form.');
      return Number.parseInt(color.slice(1), 16)
        .toString(10)
        .padStart(ORDER_TAG_DIGITS + RGB_PAYLOAD_DIGITS, '0');
    })
    .sort();
  // Legacy readers accept uniformly offset order tags. Preserve that decoding
  // behavior here; enforcing a zero first tag would reject existing records.
  const expectedDifference = colors.length === 8 ? 2 : 1;
  for (let index = 1; index < encoded.length; index += 1) {
    if (
      Number(encoded[index]!.slice(0, ORDER_TAG_DIGITS)) -
        Number(encoded[index - 1]!.slice(0, ORDER_TAG_DIGITS)) !==
      expectedDifference
    ) {
      throw new Error('These colors do not form a valid BIP39Colors-compatible set.');
    }
  }
  const digits = encoded.map((color) => color.slice(-RGB_PAYLOAD_DIGITS)).join('');
  const positions = Array.from({ length: digits.length / WORD_POSITION_DIGITS }, (_, index) =>
    Number(
      digits.slice(
        index * WORD_POSITION_DIGITS,
        index * WORD_POSITION_DIGITS + WORD_POSITION_DIGITS,
      ),
    ),
  );
  if (
    positions.some(
      (position) => !Number.isInteger(position) || position < 1 || position > BIP39_DICTIONARY_SIZE,
    )
  ) {
    throw new Error('The color codes do not contain valid BIP39 word positions.');
  }
  return positions.map((position) => position - 1);
}

// The BMP Private Use Area has 0x1900 scalars. Quotient/remainder in that radix
// fits every 24-bit RGB value into two scalars without using surrogate code units.
const COLOR_UNICODE_BASE = 0xe000;

const COLOR_UNICODE_WIDTH = 0x1900;
const COLOR_UNICODE_CODE_POINT_DIGITS = 4;

/** Portable text form: two four-digit Private Use code points per CSS RGB color. */
export function colorsToUnicode(colors: readonly string[]): string {
  return colors
    .map((color) => {
      if (!/^#[0-9A-F]{6}$/u.test(color))
        throw new Error('Each color must use uppercase #RRGGBB form.');
      const value = Number.parseInt(color.slice(1), 16);
      return [
        COLOR_UNICODE_BASE + Math.floor(value / COLOR_UNICODE_WIDTH),
        COLOR_UNICODE_BASE + (value % COLOR_UNICODE_WIDTH),
      ]
        .map((point) =>
          point.toString(16).toUpperCase().padStart(COLOR_UNICODE_CODE_POINT_DIGITS, '0'),
        )
        .join('');
    })
    .join('');
}

export function unicodeToColors(value: string): string[] {
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
  if (![16, 20, 24, 28, 32].includes(points.length))
    throw new Error(
      'Color Unicode must contain two code points per CSS color: 16, 20, 24, 28, or 32 code points.',
    );
  if (
    points.some(
      (point) => point < COLOR_UNICODE_BASE || point >= COLOR_UNICODE_BASE + COLOR_UNICODE_WIDTH,
    )
  ) {
    throw new Error('Color Unicode uses only MnemoCode Private Use Area code points.');
  }
  return Array.from({ length: points.length / 2 }, (_, index) => {
    const color =
      (points[index * 2]! - COLOR_UNICODE_BASE) * COLOR_UNICODE_WIDTH +
      points[index * 2 + 1]! -
      COLOR_UNICODE_BASE;
    if (color > RGB_MAX_VALUE)
      throw new Error('Color Unicode contains a value outside the #RRGGBB range.');
    return `#${color.toString(16).toUpperCase().padStart(RGB_HEX_DIGITS, '0')}`;
  });
}
