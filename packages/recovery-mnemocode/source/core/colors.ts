import {
  BIP39_WORD_COUNTS,
  WORD_NUMBER_DIGITS,
  WORD_NUMBER_RANGE,
  wordNumberOf,
  assertPhraseIndexes,
} from "./bip39-sizes.js";
import {
  compactCode,
  completeHexUnits,
  UNICODE_CODE_DIGITS,
  hexCodePoint,
  unspacedCode,
} from "./code-text.js";
import { inWholeRange } from "./typed-number.js";
import { listInWords } from "./places.js";
import { listPieces, textPieces } from "./pieces.js";
import { defined } from "./defined.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.colors", {
  "each-color-use-uppercase-rrggbb-form": () => "Each color must use uppercase #RRGGBB form.",
  "invalid-rgb-reference": () => "Invalid RGB reference.",
  "enter-colors-standard-bip39-word-count": (value0: string) =>
    `Enter ${value0} colors for a standard BIP39 word count.`,
  "parse-colors-refused": suppliedMessage,
  "invalid-color-set": () => INVALID_COLOR_SET,
  "color-codes-do-not-contain-valid-bip39-word": () =>
    "The color codes do not contain valid BIP39 word positions.",
  "colors-can-read-do-not-tell-where-others": () =>
    "The colors that can be read do not tell where the others belong.",
  "color-unicode-uses-only-mnemo-code-private-use": () =>
    "Color Unicode uses only MnemoCode Private Use Area code points.",
  "color-unicode-contains-value-outside-rrggbb-range": () =>
    "Color Unicode contains a value outside the #RRGGBB range.",
  "color-unicode-pairs": () => COLOR_UNICODE_PAIRS,
  "codes-all": (value0: string, value1: string) => `${value0}: ${value1} codes in all.`,
});

const RGB_PAYLOAD_DIGITS = 6;
const ORDER_TAG_DIGITS = 2;
/** The hexadecimal digits of a color #RRGGBB. */
export const RGB_HEX_DIGITS = 6;
/** The largest color, #FFFFFF: three bytes. */
export const RGB_MAX_VALUE = 0xffffff;

/**
 * `value`, a color as one number from 0 through RGB_MAX_VALUE, as # and six upper-case
 * hexadecimal digits. The colors of a phrase, of a share and the decorative colors of share cards
 * are all written through it.
 */
export function rgbHex(value: number): string {
  return `#${value.toString(16).toUpperCase().padStart(RGB_HEX_DIGITS, "0")}`;
}
/** The colors of a phrase: four position digits a word, six in a color (8 for 12 words). */
export const RGB_REFERENCE_COUNTS: readonly number[] = BIP39_WORD_COUNTS.map(
  (words) => (words * WORD_NUMBER_DIGITS) / RGB_PAYLOAD_DIGITS,
);
/** The colors of a phrase as the help and the questions name them: "8 to 16". */
export const COLOR_COUNTS_TEXT = `${RGB_REFERENCE_COUNTS[0]} to ${defined(RGB_REFERENCE_COUNTS.at(-1))}`;
/** A #RRGGBB color code, upper case. */
const COLOR_CODE = new RegExp(`^#[0-9A-F]{${RGB_HEX_DIGITS}}$`, "u");
/** Why colors are refused whose order tags are not those of one BIP39Colors set. */
const INVALID_COLOR_SET = "These colors do not form a valid BIP39Colors-compatible set.";
/**
 * Colors written with their #, the spacing left out: each # starts the six digits of one color.
 * A text of colors writes every # so or none. The element tokenizer (core/code-text.ts) takes a
 * # for a separator, so a # out of place is refused here rather than read around.
 */
const HASHED_COLORS = new RegExp(`^(?:#[0-9A-F]{${RGB_HEX_DIGITS}})+$`, "u");
/** A color as an export takes it: six hexadecimal digits, in any case, with or without #. */
const RGB_REFERENCE = new RegExp(`^#?[0-9A-F]{${RGB_HEX_DIGITS}}$`, "iu");

/** Refuses a color that is not a #RRGGBB code in capitals (COLOR_CODE). */
function assertColorCode(color: string): void {
  if (!COLOR_CODE.test(color)) throw ERRORS.create("each-color-use-uppercase-rrggbb-form", []);
}

/** Whether `reference` is a color as the card exports take it (RGB_REFERENCE). */
export function isRgbReference(reference: string): boolean {
  return RGB_REFERENCE.test(reference);
}

/** The six hexadecimal digits of a color in capitals, without #; refuses another text. */
export function rgbReferenceDigits(reference: string): string {
  if (!isRgbReference(reference)) throw ERRORS.create("invalid-rgb-reference", []);
  return reference.replace(/^#/u, "").toUpperCase();
}

/** Refuses a number of colors that no BIP39 phrase has. */
function assertColorCount(count: number): void {
  if (!RGB_REFERENCE_COUNTS.includes(count))
    throw ERRORS.create("enter-colors-standard-bip39-word-count", [
      `${listInWords(RGB_REFERENCE_COUNTS, "or")}`,
    ]);
}

/**
 * How far apart the order tags of the colors of a phrase are: BIP39Colors numbers the 8 colors of
 * 12 words 0, 2, 4…, every other phrase 0, 1, 2….
 */
function orderTagStep(colorCount: number): number {
  return colorCount === RGB_REFERENCE_COUNTS[0] ? 2 : 1;
}

/** The order tag and the six position digits of a color, from its decimal value. */
function tagAndPayload(color: string): { readonly tag: number; readonly payload: string } {
  assertColorCode(color);
  const digits = Number.parseInt(color.slice(1), 16)
    .toString(10)
    .padStart(ORDER_TAG_DIGITS + RGB_PAYLOAD_DIGITS, "0");
  return {
    tag: Number(digits.slice(0, ORDER_TAG_DIGITS)),
    payload: digits.slice(-RGB_PAYLOAD_DIGITS),
  };
}

/** Position digits cut into the four digits of each word. */
function wordPositionsOf(digits: string): string[] {
  return textPieces(digits, WORD_NUMBER_DIGITS);
}

/** CSS RGB packing of BIP39 indexes. The 12- and 24-word cases are BIP39Colors-compatible. */
export function indexesToColors(given: readonly number[]): string[] {
  // Array.from turns holes into undefined, which is refused; some() would skip them, and map and
  // join would then leave them out of the colors without a word.
  const indexes = Array.from(given);
  assertPhraseIndexes(indexes);
  // Four decimal digits per 1-based word position; each RGB stores six of
  // those digits plus an order tag. This is the BIP39Colors wire format, not
  // ordinary 11-bit BIP39 packing. Preserve the special 12-word tag stride.
  const digitString = indexes
    .map((index) => String(wordNumberOf(index)).padStart(WORD_NUMBER_DIGITS, "0"))
    .join("");
  const chunks = textPieces(digitString, RGB_PAYLOAD_DIGITS);
  const step = orderTagStep(chunks.length);
  return chunks.map((chunk, position) => rgbHex(Number(`${position * step}${chunk}`)));
}

/** The colors of a seed phrase, #RRGGBB codes or six digits each, apart or run together. */
export function parseColors(value: string): string[] {
  const hashed = value.includes("#");
  const codes =
    hashed && !HASHED_COLORS.test(unspacedCode(value))
      ? undefined
      : completeHexUnits(value, RGB_HEX_DIGITS);
  if (codes === undefined)
    throw ERRORS.create("parse-colors-refused", [
      hashed
        ? "Colors must use #RRGGBB codes, separated or concatenated."
        : "A continuous RGB stream must contain complete six-digit RRGGBB values.",
    ]);
  const colors = codes.map((code) => `#${code}`);
  assertColorCount(colors.length);
  return colors;
}

/**
 * The word numbers that `given` colors stand for, from 0; refuses a count of colors that no phrase
 * has and a color that is no word's.
 */
export function colorsToIndexes(given: readonly string[]): number[] {
  // Array.from, so that a hole is a color that is refused rather than one that map skips.
  const colors = Array.from(given);
  assertColorCount(colors.length);
  const encoded = colors.map(tagAndPayload).sort((left, right) => left.tag - right.tag);
  // Legacy readers accept uniformly offset order tags. Preserve that decoding
  // behavior here; enforcing a zero first tag would reject existing records.
  const expectedDifference = orderTagStep(colors.length);
  for (let index = 1; index < encoded.length; index += 1) {
    if (defined(encoded[index]).tag - defined(encoded[index - 1]).tag !== expectedDifference) {
      throw ERRORS.create("invalid-color-set", []);
    }
  }
  const positions = wordPositionsOf(encoded.map((color) => color.payload).join("")).map(Number);
  if (!positions.every((position) => inWholeRange(position, WORD_NUMBER_RANGE)))
    throw ERRORS.create("color-codes-do-not-contain-valid-bip39-word", []);
  return positions.map((position) => position - WORD_NUMBER_RANGE.min);
}

/**
 * The 1-based word positions that colors give, four decimal digits each, where some colors cannot
 * be read (undefined): "?" for every digit of such a color. The colors may come in any order, as
 * colorsToIndexes takes them: the order tags of those that can be read place them, and one that
 * cannot be read takes a tag that is left. MnemoCode counts the tags from 0; another offset is
 * taken only where the tags read leave no doubt about it.
 */
export function wordPositionPatterns(colors: readonly (string | undefined)[]): string[] {
  const given = Array.from(colors);
  assertColorCount(given.length);
  const step = orderTagStep(given.length);
  const payloads = new Map<number, string>();
  for (const color of given) {
    if (color === undefined) continue;
    const { tag, payload } = tagAndPayload(color);
    if (payloads.has(tag)) throw ERRORS.create("invalid-color-set", []);
    payloads.set(tag, payload);
  }
  const tags = [...payloads.keys()];
  const fits = (offset: number) =>
    tags.every((tag) => (tag - offset) % step === 0 && (tag - offset) / step < given.length);
  const lowest = Math.min(...tags, Number.POSITIVE_INFINITY);
  const offsets = Array.from(
    { length: Number.isFinite(lowest) ? lowest + 1 : 1 },
    (_, o) => o,
  ).filter((offset) => offset <= lowest && fits(offset));
  // The tags of MnemoCode start at 0; another start is taken only when it is the one that fits.
  const offset = offsets.includes(0) ? 0 : offsets.length === 1 ? offsets[0] : undefined;
  if (offset === undefined) throw ERRORS.create("colors-can-read-do-not-tell-where-others", []);
  return wordPositionsOf(
    given
      .map((_, slot) => payloads.get(offset + slot * step) ?? "?".repeat(RGB_PAYLOAD_DIGITS))
      .join(""),
  );
}

// The BMP Private Use Area has 0x1900 scalars. Quotient/remainder in that radix
// fits every 24-bit RGB value into two scalars without using surrogate code units.
/**
 * The first code point of Color Unicode, the start of the Private Use Area of the Basic
 * Multilingual Plane.
 */
export const COLOR_UNICODE_BASE = 0xe000;

/**
 * How many code points Color Unicode uses: the 0x1900 of the Private Use Area, the radix in which a
 * color is two code points.
 */
export const COLOR_UNICODE_WIDTH = 0x1900;
/**
 * The digits of one Color Unicode code point, a code point of the Basic Multilingual Plane: four
 * hexadecimal digits, and a color takes two of them.
 */
export const COLOR_UNICODE_CODE_POINT_DIGITS = UNICODE_CODE_DIGITS;
/**
 * How many code points stand for one color: two, the quotient and the remainder of its RGB value in
 * COLOR_UNICODE_WIDTH.
 */
export const COLOR_UNICODE_POINTS_PER_COLOR = 2;
/** Why Color Unicode is refused whose codes do not pair up into colors. */
export const COLOR_UNICODE_PAIRS = "Color Unicode needs two four-digit codes for every color.";

/** Whether `point` is one of the Private Use code points that color Unicode writes. */
export function isColorUnicodePoint(point: number): boolean {
  return point >= COLOR_UNICODE_BASE && point < COLOR_UNICODE_BASE + COLOR_UNICODE_WIDTH;
}

/** Refuses code points of which any is not one of the Private Use code points of Color Unicode. */
function assertColorUnicodePoints(points: readonly number[]): void {
  if (!points.every(isColorUnicodePoint))
    throw ERRORS.create("color-unicode-uses-only-mnemo-code-private-use", []);
}

/** Whether `symbol` is one character of the Color Unicode codes. */
export function isColorUnicodeSymbol(symbol: string): boolean {
  const point = symbol.codePointAt(0);
  return Array.from(symbol).length === 1 && point !== undefined && isColorUnicodePoint(point);
}

/** The Color Unicode characters as a class of a regular expression, for a reader that needs one. */
export const COLOR_UNICODE_SYMBOL_CLASS = [
  COLOR_UNICODE_BASE,
  COLOR_UNICODE_BASE + COLOR_UNICODE_WIDTH - 1,
]
  .map((point) => `\\u{${point.toString(16)}}`)
  .join("-");

/** The #RRGGBB color of two code points of color Unicode; refuses what writes no color. */
export function colorOfUnicodePair(high: number, low: number): string {
  assertColorUnicodePoints([high, low]);
  const color = (high - COLOR_UNICODE_BASE) * COLOR_UNICODE_WIDTH + low - COLOR_UNICODE_BASE;
  if (color > RGB_MAX_VALUE)
    throw ERRORS.create("color-unicode-contains-value-outside-rrggbb-range", []);
  return rgbHex(color);
}

/** Portable text form: two four-digit Private Use code points per CSS RGB color. */
export function colorsToUnicode(colors: readonly string[]): string {
  // Array.from, so that a hole is a color that is refused rather than one left out of the text.
  return Array.from(colors)
    .map((color) => {
      assertColorCode(color);
      const value = Number.parseInt(color.slice(1), 16);
      return [
        COLOR_UNICODE_BASE + Math.floor(value / COLOR_UNICODE_WIDTH),
        COLOR_UNICODE_BASE + (value % COLOR_UNICODE_WIDTH),
      ]
        .map((point) => hexCodePoint(point))
        .join("");
    })
    .join("");
}

/**
 * The code points of color Unicode text: four hexadecimal digits each, or the symbols themselves.
 */
function colorUnicodePoints(value: string): number[] {
  const compact = compactCode(value);
  return /^[0-9A-F]+$/iu.test(compact) && compact.length % COLOR_UNICODE_CODE_POINT_DIGITS === 0
    ? textPieces(compact, COLOR_UNICODE_CODE_POINT_DIGITS, (code) => Number.parseInt(code, 16))
    : Array.from(value)
        .filter((point) => !/\s/u.test(point))
        .map((point) => defined(point.codePointAt(0)));
}

/** Two code points per color back to #RRGGBB codes, for any number of colors. */
function colorsFromUnicodePoints(points: readonly number[]): string[] {
  if (points.length === 0 || points.length % COLOR_UNICODE_POINTS_PER_COLOR !== 0)
    throw ERRORS.create("color-unicode-pairs", []);
  // Every point is checked before any color is made, so that the message names the points.
  assertColorUnicodePoints(points);
  return listPieces(points, COLOR_UNICODE_POINTS_PER_COLOR).map(([high, low]) =>
    colorOfUnicodePair(defined(high), defined(low)),
  );
}

/** Color Unicode of a seed phrase: 8 to 16 colors, two code points each. */
export function unicodeToColors(value: string): string[] {
  const points = colorUnicodePoints(value);
  if (!RGB_REFERENCE_COUNTS.includes(points.length / COLOR_UNICODE_POINTS_PER_COLOR))
    throw ERRORS.create("codes-all", [
      `${COLOR_UNICODE_PAIRS.slice(0, -1)}`,
      `${listInWords(
        RGB_REFERENCE_COUNTS.map((count) => count * COLOR_UNICODE_POINTS_PER_COLOR),
        "or",
      )}`,
    ]);
  return colorsFromUnicodePoints(points);
}

/** Color Unicode of any length, such as a share written as colors (src/sskr/transport.ts). */
export function unicodeToColorCodes(value: string): string[] {
  return colorsFromUnicodePoints(colorUnicodePoints(value));
}

/**
 * Color Unicode written as the Private Use symbols themselves, with a ? where one cannot be read:
 * the symbols and the ? marks, white space left out; undefined when the text is empty or holds
 * anything else, such as the codes written in digits.
 */
export function colorSymbolsOf(text: string): string[] | undefined {
  const symbols = Array.from(text.replace(/\s+/gu, ""));
  if (
    symbols.length === 0 ||
    !symbols.every((symbol) => symbol === "?" || isColorUnicodeSymbol(symbol))
  )
    return undefined;
  return symbols;
}

/**
 * The symbols of colorSymbolsOf, each as its four hexadecimal digits, or ?. The reading of marked
 * codes and the repair of marked shares take such text through it.
 */
export function markedColorSymbols(text: string): string[] | undefined {
  return colorSymbolsOf(text)?.map((symbol) =>
    symbol === "?" ? "?" : hexCodePoint(defined(symbol.codePointAt(0))),
  );
}
