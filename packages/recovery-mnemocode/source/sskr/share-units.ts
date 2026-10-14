// The forms that a share is written in, and how each writes its units as text: the bits of one
// unit, how one unit as written is read and written, and how the units are joined. The writer and
// the readers of shares (transport.ts) and the repair of marked ones (repair.ts) read and write
// units through it, so that a share repaired is written as a share is. What the units hold, the
// bytes of a UR and of Bytewords, or the word indexes and colors of a mixed share
// (mixed-layout.ts), and how a whole text is told apart, stay with each reader.
//
// Needs from the host: nothing.

import {
  BYTEWORD_VALUES,
  bytewords,
  MINIMAL_BYTEWORD_VALUES,
  MINIMAL_BYTEWORDS,
} from "./bytewords-list.js";
import { COLOR_FORM, WORD_FORM, type MixedForm } from "./mixed-layout.js";
import { colorsToUnicode, RGB_HEX_DIGITS, rgbHex, unicodeToColorCodes } from "../core/colors.js";
import { UNICODE_CODES, UNICODE_INDEX, wordIndexOf } from "../core/words.js";
import { BITS_PER_BYTE, WORD_NUMBER_DIGITS, wordNumberOf } from "../core/bip39-sizes.js";
import { ELEMENT_SPACING } from "../core/code-text.js";
import { defined } from "../core/defined.js";

/** The forms that a share is written in, the standard UR first as the default. */
export const SHARE_FORMATS = Object.freeze([
  "ur",
  "words",
  "indexes",
  "unicode",
  "colors",
  "colors-unicode",
] as const);
/** A form that a share is written in (SHARE_FORMATS). */
export type ShareFormat = (typeof SHARE_FORMATS)[number];

/** What the UR of a share starts with (BCR-2020-005), before its bytewords. */
export const UR_SSKR_PREFIX = "ur:sskr/";
/**
 * The prefix at the start of a text, in any case, as a UR may be written (BCR-2020-005). Its flags
 * are the one case rule of the prefix: the reader of a UR (transport.ts) and the repair of a marked
 * one both match by it, so that a text that reads as a UR is repaired as one. Under them, as
 * JavaScript folds case, the long s (U+017F) and the Kelvin sign (U+212A) match s and k too.
 */
export const UR_SSKR_START = new RegExp(`^${UR_SSKR_PREFIX}`, "iu");
/**
 * What separates the words of a share in Bytewords: the spacing between the elements of every
 * form (core/code-text.ts), or the dashes of other tools.
 */
export const BYTEWORD_SEPARATORS = new RegExp(`[${ELEMENT_SPACING}-]+`, "u");
/** The letters of every Byteword (BCR-2020-012): four, the first word's; a test checks the rest. */
export const BYTEWORD_LETTERS = defined(bytewords[0]).length;
/** A Byteword or a ? for a whole one, in Bytewords run together. */
const BYTEWORD_OR_MARK = new RegExp(`[a-z]{${BYTEWORD_LETTERS}}|\\?`, "gu");

/**
 * The Bytewords of a share as written, in lower case: apart (BYTEWORD_SEPARATORS), or run
 * together, four letters each, where a ? stands for a whole word, as hexadecimal codes run
 * together are read (core/code-text.ts). Every word has four letters, so words run together are
 * told apart without a doubt. The reader of a share and the repair of a marked one take Bytewords
 * through it; text that is neither is given back apart, so that its reader names a word that it
 * does not know.
 */
export function bytewordUnits(text: string): string[] {
  const apart = text.toLowerCase().split(BYTEWORD_SEPARATORS).filter(Boolean);
  const known = (unit: string): boolean => unit === "?" || BYTEWORD_VALUES.has(unit);
  if (apart.every(known)) return apart;
  const joined = apart.join("");
  const units = joined.match(BYTEWORD_OR_MARK) ?? [];
  return units.join("") === joined && units.every(known) ? units : apart;
}

/**
 * A word number of a share as written: at most the digits of 2048. Narrower than a phrase's on
 * purpose (AUD-011-ARC026): a share's text is read element by element in a repair, and a width
 * keeps a long run of digits from passing as one number.
 */
const SHARE_WORD_NUMBER = new RegExp(`^\\d{1,${WORD_NUMBER_DIGITS}}$`, "u");

/**
 * The word index, from 0, of a word number of a share as written; undefined when it is none. The
 * reader, the repair and the reasons of a refused mark all read word numbers through it.
 */
export function shareWordIndex(token: string): number | undefined {
  return wordIndexOf(token, SHARE_WORD_NUMBER);
}

/**
 * A color as its hexadecimal digits, in capitals, with or without the # that rgbHex writes: the
 * element tokenizer (core/code-text.ts) removes it, and unitText writes it back.
 */
const COLOR_TEXT = new RegExp(`^#?([0-9A-F]{${RGB_HEX_DIGITS}})$`, "u");

/** The value of a color written as its six hexadecimal digits; undefined when it is none. */
function colorValue(color: string): number | undefined {
  const digits = COLOR_TEXT.exec(color)?.[1];
  return digits === undefined ? undefined : Number.parseInt(digits, 16);
}

/**
 * The value of a color written as its two Color Unicode code points, each as its four
 * hexadecimal digits; undefined when the two make no color, or when the text holds more colors
 * than one, which are no one unit.
 */
function colorUnicodeValue(codes: string): number | undefined {
  let colors: string[];
  try {
    colors = unicodeToColorCodes(codes);
  } catch {
    return undefined;
  }
  return colors.length === 1 ? colorValue(defined(colors[0])) : undefined;
}

/** How one form writes its units. */
export interface ShareUnits {
  /** The bits that one unit holds. */
  readonly unitBits: number;
  /**
   * The value of one unit as written, a Byteword or a pair of letters of a UR in lower case, a
   * code or a color in capitals; undefined when it is none.
   */
  readonly valueOf: (unit: string) => number | undefined;
  /** One unit as written. */
  readonly unitText: (value: number) => string;
  /** The text of a share of these units, joined as the form writes them. */
  readonly text: (values: readonly number[]) => string;
  /**
   * The mixed layout that the units hold (mixed-layout.ts); none for the standard forms, the UR
   * and Bytewords, whose units are the bytes of the share's transport.
   */
  readonly mixed?: MixedForm;
}

/**
 * The units of a form: those of `mixed`, or bytes; their text is `prefix`, then each unit,
 * `separator` between them.
 */
function unitsOf(
  units: {
    readonly mixed?: MixedForm;
    readonly valueOf: (unit: string) => number | undefined;
    readonly unitText: (value: number) => string;
  },
  separator: string,
  prefix = "",
): ShareUnits {
  const { mixed, valueOf, unitText } = units;
  return Object.freeze({
    unitBits: mixed?.unitBits ?? BITS_PER_BYTE,
    valueOf,
    unitText,
    text: (values: readonly number[]) => `${prefix}${values.map(unitText).join(separator)}`,
    ...(mixed === undefined ? {} : { mixed }),
  });
}

/** One color as Color Unicode: its two code points. */
const colorUnicodeText = (value: number): string => colorsToUnicode([rgbHex(value)]);

/** The units of every form: a share's bytes, word indexes or colors, as each form writes them. */
export const SHARE_UNITS: Readonly<Record<ShareFormat, ShareUnits>> = Object.freeze({
  // The UR: the prefix, then two letters per byte, run together.
  ur: unitsOf(
    {
      valueOf: (pair) => MINIMAL_BYTEWORD_VALUES.get(pair),
      unitText: (byte) => defined(MINIMAL_BYTEWORDS[byte]),
    },
    "",
    UR_SSKR_PREFIX,
  ),
  words: unitsOf(
    { valueOf: (word) => BYTEWORD_VALUES.get(word), unitText: (byte) => defined(bytewords[byte]) },
    " ",
  ),
  indexes: unitsOf(
    {
      mixed: WORD_FORM,
      valueOf: shareWordIndex,
      unitText: (index) => String(wordNumberOf(index)),
    },
    " ",
  ),
  unicode: unitsOf(
    {
      mixed: WORD_FORM,
      valueOf: (code) => UNICODE_INDEX.get(code),
      unitText: (index) => defined(UNICODE_CODES[index]),
    },
    " ",
  ),
  colors: unitsOf({ mixed: COLOR_FORM, valueOf: colorValue, unitText: rgbHex }, " "),
  // Color Unicode runs its code points together, as an encoded seed phrase writes it.
  "colors-unicode": unitsOf(
    { mixed: COLOR_FORM, valueOf: colorUnicodeValue, unitText: colorUnicodeText },
    "",
  ),
});
