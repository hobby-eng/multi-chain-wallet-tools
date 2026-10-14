// The forms that the codes of an encoded seed phrase are written in, each with what it is: how its
// codes are read and written, what they are called, how text in it looks, how it prints on cards,
// which list its words are typed from, and whether a seed phrase in it is always masked. A new form
// is one more variant here, and the compiler asks for each of its facts; every reader, writer and
// question asks the form.
//
// Host-neutral: it reaches only the core's words and colors.

import { BIP39_WORD_COUNTS, wordNumberOf, type Bip39WordCount } from "./bip39-sizes.js";
import {
  UNICODE_CODE_DIGITS,
  codeTokens,
  compactCode,
  elementsFit,
  hexUnits,
} from "./code-text.js";
import { textPieces } from "./pieces.js";
import {
  COLOR_UNICODE_POINTS_PER_COLOR,
  RGB_HEX_DIGITS,
  RGB_REFERENCE_COUNTS,
  colorsToIndexes,
  colorsToUnicode,
  indexesToColors,
  isColorUnicodeSymbol,
  colorSymbolsOf,
  parseColors,
  unicodeToColors,
} from "./colors.js";
import { englishTokens, indexesOfWords, wordsOfIndexes } from "./english-words.js";
import { LineWordHints, WordList, type WordHints } from "./word-hints.js";
import {
  ENCODED_FORMATS,
  isEncodedFormat,
  type CardKind,
  type EncodedFormat,
  type EncodedResult,
} from "./types.js";
import {
  canonicalEnglishWords,
  unicodeCodesOfIndexes,
  unicodeIndexesOf,
  wordIndexOfNumber,
} from "./words.js";
import { defined } from "./defined.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.encoded-form", {
  "unsupported-encoded-format": (value0: string) => `Unsupported encoded format: ${value0}.`,
});

/** How the elements of a form are counted for a phrase: one per word, or one per colour. */
type ElementUnit = "word" | "color";

/**
 * The first `count` hexadecimal codes of `width` digits in `text`, apart or run together, marks
 * kept, written apart; undefined when the text is not written so.
 */
function leadingHexUnits(text: string, width: number, count: number): string[] | undefined {
  return hexUnits(text, width)?.slice(0, count);
}

/** What one form is. */
interface Variant {
  /** The BIP39 indexes of codes written in this form; throws why they cannot be read. */
  readonly read: (text: string) => number[];
  /** Codes, by their BIP39 indexes, written in this form. */
  readonly write: (indexes: readonly number[]) => string;
  /** What its codes are called in a message about their count. */
  readonly unit: string;
  /** Whether typed text looks like this form, judged by its characters alone. */
  readonly looks: (text: string) => boolean;
  /** The digits of each code where the codes are written joined, which a sample spaces apart. */
  readonly joinedWidth?: number;
  /** Whether a phrase has one element of this form per word, or one per colour. */
  readonly elementUnit: ElementUnit;
  /**
   * The first `count` elements of `text`, written again as text of this form, marks kept;
   * undefined when the text cannot be split into elements of this form.
   */
  readonly leading: (text: string, count: number) => string | undefined;
  /** How it prints on cards; none for a form without cards. */
  readonly cardKind: CardKind | undefined;
  /**
   * The codes that its cards print, one to a card, where the cards' colours only decorate them;
   * none where the codes are the colours themselves, or where the form has no cards.
   */
  readonly cardCodes?: (indexes: readonly number[]) => string[];
  /** Whether its codes are colours: the terminal shows them as coloured cards. */
  readonly colors: boolean;
  /**
   * Whether a seed phrase in it is always masked: English words are the phrase itself, and anyone
   * with the BIP39 list reads word numbers, so unmasked they would protect nothing.
   */
  readonly alwaysMasked: boolean;
  /** The list that the form's words are typed from, for the hints below codes being typed. */
  readonly words?: WordList;
}

const VARIANTS = Object.freeze({
  english: {
    read: (text) => indexesOfWords(canonicalEnglishWords(text)),
    words: WordList.BIP39,
    write: (indexes) => wordsOfIndexes(indexes).join(" "),
    unit: "words",
    // What looks like no other form is taken for words.
    looks: () => true,
    elementUnit: "word",
    leading: (text, count) => englishTokens(text).slice(0, count).join(" "),
    cardKind: undefined,
    colors: false,
    alwaysMasked: true,
  },
  indexes: {
    read: (text) => codeTokens(text).map(wordIndexOfNumber),
    write: (indexes) => indexes.map((index) => String(wordNumberOf(index))).join(" "),
    unit: "word numbers",
    // The looks split the elements as the readers do (code-text.ts, elementsFit).
    looks: (text) => elementsFit(text, /^\d+$/u),
    elementUnit: "word",
    leading: (text, count) => codeTokens(text).slice(0, count).join(" "),
    cardKind: undefined,
    colors: false,
    alwaysMasked: true,
  },
  unicode: {
    read: unicodeIndexesOf,
    write: (indexes) => unicodeCodesOfIndexes(indexes).join(""),
    unit: "codes",
    looks: (text) => elementsFit(text, /^[0-9A-F]+$/u),
    joinedWidth: UNICODE_CODE_DIGITS,
    elementUnit: "word",
    leading: (text, count) => leadingHexUnits(text, UNICODE_CODE_DIGITS, count)?.join(" "),
    // Cards that print its codes, one to a card, in colours that decorate them (owner, 2026-10-13).
    cardKind: "colors",
    cardCodes: unicodeCodesOfIndexes,
    colors: false,
    alwaysMasked: false,
  },
  "colors-unicode": {
    read: (text) => colorsToIndexes(unicodeToColors(text)),
    write: (indexes) => colorsToUnicode(indexesToColors(indexes)),
    unit: "codes",
    // MnemoCode's colour codes are characters of its part of the Private Use Area (colors.ts).
    looks: (text) => Array.from(text).some(isColorUnicodeSymbol),
    // One code point: a ? stands for one in every reader, and a color takes two (owner,
    // 2026-10-13: codes shown apart as the Unicode codes of words are).
    joinedWidth: UNICODE_CODE_DIGITS,
    elementUnit: "color",
    // Each colour is two code points, written as symbols run together or as four-digit codes.
    leading: (text, count) => {
      const points = count * COLOR_UNICODE_POINTS_PER_COLOR;
      const symbols = colorSymbolsOf(text);
      if (symbols !== undefined) return symbols.slice(0, points).join("");
      return leadingHexUnits(text, UNICODE_CODE_DIGITS, points)?.join(" ");
    },
    cardKind: "colors",
    colors: true,
    alwaysMasked: false,
  },
  colors: {
    read: (text) => colorsToIndexes(parseColors(text)),
    write: (indexes) => indexesToColors(indexes).join(" "),
    unit: "codes",
    looks: (text) => text.includes("#"),
    elementUnit: "color",
    leading: (text, count) =>
      leadingHexUnits(text, RGB_HEX_DIGITS, count)
        ?.map((unit) => `#${unit}`)
        .join(" "),
    cardKind: "colors",
    colors: true,
    alwaysMasked: false,
  },
} satisfies Readonly<Record<EncodedFormat, Variant>>);

/**
 * The order in which the forms are guessed from typed text: the most telling characters first,
 * English words last, which every other text is taken for.
 */
const LIKELY_ORDER = Object.freeze([
  "colors",
  "colors-unicode",
  "indexes",
  "unicode",
  "english",
] as const satisfies readonly EncodedFormat[]);

/**
 * One form of codes and its facts. A class, so that callers ask the form instead of switching
 * over its name: the values are made once, one for each form, and never change.
 */
export class EncodedForm {
  static readonly #values = Object.freeze(
    Object.fromEntries(
      ENCODED_FORMATS.map((format) => [format, new EncodedForm(format, VARIANTS[format])]),
    ) as Record<EncodedFormat, EncodedForm>,
  );

  readonly #format: EncodedFormat;
  readonly #variant: Variant;

  private constructor(format: EncodedFormat, variant: Variant) {
    this.#format = format;
    this.#variant = variant;
  }

  /**
   * The form named `format`; refuses a value that names none, as a record, an option or a host
   * may pass anything. The one refusal of such a value: every other module asks it.
   */
  static of(format: EncodedFormat): EncodedForm {
    if (!isEncodedFormat(format))
      throw ERRORS.create("unsupported-encoded-format", [`${String(format)}`]);
    return EncodedForm.#values[format];
  }

  /**
   * The hints below codes being typed in any form: the words of the form that the line so far
   * most likely is, English words only.
   */
  static readonly typedWords: WordHints = new LineWordHints(
    (line) => EncodedForm.of(EncodedForm.likely(line)).#variant.words,
  );

  /** The form that typed text most likely is, judged by its characters. */
  static likely(text: string): EncodedFormat {
    return defined(LIKELY_ORDER.find((format) => VARIANTS[format].looks(text)));
  }

  get format(): EncodedFormat {
    return this.#format;
  }

  /** The BIP39 indexes of `text`, codes in this form; throws why they cannot be read. */
  read(text: string): number[] {
    return this.#variant.read(text);
  }

  /** The codes of `result` written in this form. */
  write(result: EncodedResult): string {
    return this.codes(result.shiftedIndexes);
  }

  /**
   * Codes, by their BIP39 indexes, written in this form: every form is written from the indexes
   * alone, so that no two forms of one result can disagree.
   */
  codes(indexes: readonly number[]): string {
    return this.#variant.write(indexes);
  }

  /**
   * What a place of a phrase is called in a message of this form: a code where each code is a
   * word; a word where the codes are colours, each of which holds parts of several words.
   */
  get placeName(): string {
    return this.#variant.elementUnit === "word" ? "Code" : "Word";
  }

  /** How many elements of this form a seed phrase of `words` words has: one a word, or a colour. */
  elementCount(words: Bip39WordCount): number {
    if (this.#variant.elementUnit === "word") return words;
    return defined(RGB_REFERENCE_COUNTS[BIP39_WORD_COUNTS.indexOf(words)]);
  }

  /**
   * The elements of a seed phrase of `words` words at the start of `text`, as text of this form:
   * those of a backup printed on cards, before the decoys that follow them (owner, 2026-10-13).
   * Text with fewer elements keeps them all; text that this form cannot split is given back as it
   * is. Either is left for the reader to refuse with its own words.
   */
  leadingCodes(text: string, words: Bip39WordCount): string {
    return this.#variant.leading(text, this.elementCount(words)) ?? text;
  }

  /** What the codes are called in a message about their count: "words", "word numbers", "codes". */
  get unit(): string {
    return this.#variant.unit;
  }

  /** The digits of each code where the codes are written joined, or undefined. */
  get joinedWidth(): number | undefined {
    return this.#variant.joinedWidth;
  }

  /**
   * The codes of `text`, codes of this form, one by one, where the form writes them joined
   * (joinedWidth): a screen shows them apart beside the joined text, so that a person sees where
   * each code ends and which one to mark with ? (owner, 2026-10-13). Undefined for a form whose
   * text has its codes apart already.
   */
  apartCodes(text: string): string[] | undefined {
    const width = this.#variant.joinedWidth;
    return width === undefined ? undefined : textPieces(compactCode(text), width);
  }

  get cardKind(): CardKind | undefined {
    return this.#variant.cardKind;
  }

  /**
   * The codes that the cards of `indexes` print where its colours only decorate them (Unicode
   * codes), or undefined where the cards print their colours, or the form has none.
   */
  cardCodes(indexes: readonly number[]): string[] | undefined {
    return this.#variant.cardCodes?.(indexes);
  }

  /** Whether its codes are colours: the terminal shows them as coloured cards. */
  get writtenInColors(): boolean {
    return this.#variant.colors;
  }

  get alwaysMasked(): boolean {
    return this.#variant.alwaysMasked;
  }
}
