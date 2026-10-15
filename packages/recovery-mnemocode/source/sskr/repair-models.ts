// The ways to read a marked share as units of one form (repair.ts, MarkedReading): word numbers,
// Unicode codes, colors, Bytewords and pairs of letters of a UR, each element read whole, in part
// or marked with ?, and Color Unicode codes run together, whose marks may each stand for a code or
// a whole color. Each way is a UnitModel: the values read, what a solution must fit, and the
// structures of the share that its count of units allows (repair-units.ts).

import {
  apartHexUnits,
  codeTokens,
  fitsPattern,
  hexCodePoint,
  hexUnits,
  joinedHexUnits,
  wholeMark,
} from "../core/code-text.js";
import { CHECKSUM_BYTES, type ShareFormat } from "./transport.js";
import { ownUnitCount, SHARE_HEADER_BYTES, type MixedForm } from "./mixed-layout.js";
import { bytewordUnits, SHARE_UNITS, UR_SSKR_START } from "./share-units.js";
import { unicodeCodesFitting } from "../core/words.js";
import {
  COLOR_UNICODE_BASE,
  COLOR_UNICODE_POINTS_PER_COLOR,
  COLOR_UNICODE_WIDTH,
  isColorUnicodePoint,
  markedColorSymbols,
} from "../core/colors.js";
import { listPieces } from "../core/pieces.js";
import { defined } from "../core/defined.js";
import {
  CODE_DIGITS,
  CODE_POINT_TEXT,
  COLOR_DIGITS,
  HEX_DIGIT_BITS,
  isMarked,
  MAX_REPAIR_UNITS,
  MAX_PARTIAL_UNIT_CANDIDATES,
  mixedUnitCounts,
  type ReadBits,
  type ReadingUnits,
  type ShareRepairErrorCode,
  structuresOf,
  type UnitModel,
  urPairs,
  WHOLE_CODE,
  withinRepair,
} from "./repair-units.js";

/**
 * Hexadecimal codes of `digits` digits, such as colors or Unicode codes, as code-text reads them
 * (hexUnits): written apart, each a lone ? where none of its digits can be read, or `digits`
 * symbols in which each ? is one digit that cannot be read, a code all of whose digits are ? being
 * the same as a lone ?; or run together, a ? standing for a whole code. Undefined when the text is
 * neither.
 */
function markedCodes(text: string, digits: number): string[] | undefined {
  return withinRepair(hexUnits(text, digits, { foldWholeMarks: true }));
}

/**
 * Whether reading `text` as codes of `digits` digits runs a code across a separator of the reader
 * of codes (codeTokens: spaces, commas, semicolons or #): the text is not such codes written
 * apart, and one of its elements is not such codes run together, as with word numbers or Unicode
 * codes written apart read as colors. Such a reading is in another form than the one written and
 * takes no decoy cards after a prefix (AUD-022-FUN001). Colors run together with their #, such as
 * #37B8CA?#DB206C, keep every code within its element, so they are read in their own form.
 */
function readAcrossSeparators(text: string, digits: number): boolean {
  return (
    apartHexUnits(text, digits) === undefined &&
    codeTokens(text).some((token) => joinedHexUnits(token, digits) === undefined)
  );
}

/** Whether `code` has digits that can be read and digits that cannot. */
function readInPart(code: string): boolean {
  return code !== "?" && code.includes("?");
}

/**
 * The digits of `code` that can be read, as ReadBits; each digit is four bits, the first highest.
 */
function digitBits(code: string): ReadBits {
  let value = 0;
  let mask = 0;
  for (const digit of code) {
    value = value * 2 ** HEX_DIGIT_BITS + (digit === "?" ? 0 : parseInt(digit, 16));
    mask = mask * 2 ** HEX_DIGIT_BITS + (digit === "?" ? 0 : 2 ** HEX_DIGIT_BITS - 1);
  }
  return { value, mask };
}

/**
 * The values of `units` in `format`, undefined at each unit that is `marked`; undefined when a unit
 * that is not marked has none. Every model of a form reads its units through it.
 */
function unitValues(
  format: ShareFormat,
  units: readonly string[],
  marked: (unit: string) => boolean,
): (number | undefined)[] | undefined {
  const { valueOf } = SHARE_UNITS[format];
  const values = units.map((unit) => (marked(unit) ? undefined : valueOf(unit)));
  return values.some((value, index) => value === undefined && !marked(defined(units[index])))
    ? undefined
    : values;
}

/**
 * The number of units that a share of `form` says it has, when the units of its checksum and
 * header lead `values` and are all read; undefined otherwise. Every unit after it is a decoy.
 */
function ownCountRead(
  form: MixedForm,
  values: readonly (number | undefined)[],
): number | undefined {
  const headerUnits = form.unitCount(CHECKSUM_BYTES + SHARE_HEADER_BYTES);
  if (values.length < headerUnits) return undefined;
  const header = values.slice(0, headerUnits);
  return header.every((value): value is number => value !== undefined)
    ? ownUnitCount(form, header)
    : undefined;
}

/**
 * Adds every supported mixed prefix, keeping the text's already validated units after it as
 * complete decoys. A fully read header fixes its length, and marks after it are decoy cards marked
 * as unreadable, which carry nothing (AUD-022-FUN003); marks in the checksum or header leave every
 * supported length in play, with no mark after the prefix. Each structure still checks the version,
 * length, CRC and padding, and solvedShare checks the metadata. Standard forms, and a reading
 * across the text's separators (`prefixes` false, readAcrossSeparators), keep their entire input.
 */
function addUnitModel(models: UnitModel[], units: ReadingUnits, prefixes = true): void {
  const { format, values, readBits, candidates } = units;
  if (values.length > MAX_REPAIR_UNITS) return;
  const { mixed } = SHARE_UNITS[format];
  if (mixed === undefined || !prefixes) {
    models.push({ ...units, structures: structuresOf(format, values.length) });
    return;
  }
  const own = ownCountRead(mixed, values);
  for (const count of mixedUnitCounts(mixed)) {
    if (count > values.length || (own !== undefined && count !== own)) continue;
    if (own === undefined && values.slice(count).some((value) => value === undefined)) continue;
    models.push({
      ...units,
      values: values.slice(0, count),
      ...(readBits === undefined ? {} : { readBits: readBits.slice(0, count) }),
      ...(candidates === undefined ? {} : { candidates: candidates.slice(0, count) }),
      decoys: count < values.length,
      structures: structuresOf(format, count),
    });
  }
}

/**
 * A unit marked as a whole, by a lone ?: the only mark of a Byteword, a UR pair or a word number.
 */
const loneMark = (unit: string): boolean => unit === "?";

/** Adds the model of `units` in `format` when every unit that is not a lone ? has a value. */
function addModel(
  models: UnitModel[],
  format: ShareFormat,
  units: readonly string[] | undefined,
): void {
  if (units === undefined) return;
  const values = unitValues(format, units, loneMark);
  if (values === undefined) return;
  addUnitModel(models, { format, values });
}

/** Every way that `text` can be read as a share in one form, with marked elements. */
export function unitModels(text: string): UnitModel[] {
  const models: UnitModel[] = [];
  const prefix = UR_SSKR_START.exec(text)?.[0];
  if (prefix !== undefined) {
    addModel(models, "ur", urPairs(text.slice(prefix.length).toLowerCase()));
    return models;
  }
  addModel(models, "indexes", codeTokens(text));
  addModel(models, "words", bytewordUnits(text));
  addUnicodeModel(models, text);
  addColorModel(models, text);
  addColorUnicodeModels(models, text);
  addColorUnicodeDigitModel(models, text);
  return models;
}

/**
 * Unicode codes of words, read apart or run together. A code read in part, such as 4E?0, is
 * unknown as a whole; the words whose code fits it are its candidates, and a solution must take
 * one of them. A code that no word fits leaves no reading in this form.
 */
function addUnicodeModel(models: UnitModel[], text: string): void {
  const codes = markedCodes(text, CODE_DIGITS);
  if (codes === undefined) return;
  // A code with a ? among its digits is unknown as a whole, as a lone ? is.
  const values = unitValues("unicode", codes, isMarked);
  if (values === undefined) return;
  const candidates = codes.map((code) =>
    readInPart(code) ? unicodeCodesFitting(code) : undefined,
  );
  if (candidates.some((words) => words?.length === 0)) return;
  const fitting = candidates.map((words) => (words === undefined ? undefined : new Set(words)));
  addUnitModel(
    models,
    {
      format: "unicode",
      values,
      ...(candidates.some((words) => words !== undefined)
        ? {
            candidates,
            fits: (filled: readonly number[]) =>
              fitting
                .slice(0, filled.length)
                .every((words, place) => words?.has(defined(filled[place])) ?? true),
          }
        : {}),
    },
    !readAcrossSeparators(text, CODE_DIGITS),
  );
}

/**
 * Colors written apart, each a lone ? when it cannot be read at all, or with a ? for each digit
 * that cannot be read, whose digits read are then known bits; or colors run together, a ? standing
 * for a whole color.
 */
function addColorModel(models: UnitModel[], text: string): void {
  const colors = markedCodes(text, COLOR_DIGITS);
  if (colors === undefined) return;
  const partly = colors.some(readInPart);
  // Every color not marked has six digits (markedCodes), so it has a value.
  const values = defined(unitValues("colors", colors, isMarked));
  addUnitModel(
    models,
    {
      format: "colors",
      values,
      ...(partly
        ? { readBits: colors.map((color) => (readInPart(color) ? digitBits(color) : undefined)) }
        : {}),
    },
    !readAcrossSeparators(text, COLOR_DIGITS),
  );
}

/**
 * Ways to read the marks of one share's Color Unicode codes that a repair tries at most
 * (colorUnicodePairings). Every way is solved, some milliseconds each: eight colors of a public
 * share each written as ?? fit about 110 ways, solved together with two other shares in a few
 * seconds. More ways than this are refused instead of solved for minutes.
 */
const MAX_MARK_WIDTH_READINGS = 2 ** 8;

/**
 * Steps of the search for those ways, each a code or a run of marks placed: a bound on its work
 * when many ways are given up before the end, some tens of milliseconds at most.
 */
const MAX_MARK_WIDTH_STEPS = 2 ** 16;

/** The refusal of a share whose marks fit more ways than MAX_MARK_WIDTH_READINGS or the steps. */
export const AMBIGUOUS_MARK_WIDTHS =
  "Its ? marks fit too many ways to read the Color Unicode codes, each ? a code or a whole color: read more of the codes.";

/**
 * Thrown when the marks of Color Unicode codes fit too many ways (AMBIGUOUS_MARK_WIDTHS): none
 * of them is left out unsaid. A joint repair names the share by its place.
 */
export class AmbiguousMarksError extends Error {
  readonly code: ShareRepairErrorCode = "ambiguous-marks";

  constructor() {
    super(AMBIGUOUS_MARK_WIDTHS);
    this.name = "AmbiguousMarksError";
  }
}

/** A Color Unicode code as read, or a run of marks: that many ? together. */
type CodePiece = string | { readonly marks: number };

/** `scalars`, codes and ? marks, with each run of ? together as one piece. */
function codePieces(scalars: readonly string[]): CodePiece[] {
  const pieces: CodePiece[] = [];
  for (const code of scalars) {
    const last = pieces.at(-1);
    if (code !== "?") pieces.push(code);
    else if (typeof last === "object") pieces[pieces.length - 1] = { marks: last.marks + 1 };
    else pieces.push({ marks: 1 });
  }
  return pieces;
}

/**
 * The numbers of codes, fewest first, that `marks` marks together stand for when the first is at
 * `start`: each mark one code, or a whole color, which begins at the first code of a color. A
 * number of codes is one reading however the marks make it.
 */
function runLengths(marks: number, start: number): number[] {
  let lengths = new Set([0]);
  for (let mark = 0; mark < marks; mark += 1) {
    const next = new Set<number>();
    for (const length of lengths) {
      next.add(length + 1);
      if ((start + length) % COLOR_UNICODE_POINTS_PER_COLOR === 0)
        next.add(length + COLOR_UNICODE_POINTS_PER_COLOR);
    }
    lengths = next;
  }
  return [...lengths].sort((a, b) => a - b);
}

/** The lowest Color Unicode code, which a marked code is taken as to ask whether a color fits. */
const LOWEST_COLOR_CODE = hexCodePoint(COLOR_UNICODE_BASE);

/**
 * Whether some color fits `pair`, its codes with ? where marked or not yet placed. The first code
 * holds the high part of the value, so a color fits exactly when one fits with each ? taken as the
 * lowest code.
 */
function someColorFits(pair: readonly string[]): boolean {
  const lowest = pair.map((code) => (code === "?" ? LOWEST_COLOR_CODE : code));
  return SHARE_UNITS["colors-unicode"].valueOf(lowest.join("")) !== undefined;
}

/**
 * The fewest and the most codes that the pieces from each one on stand for: a code one, a mark one
 * code or at most a whole color.
 */
function codeCountsFrom(pieces: readonly CodePiece[]): { fewest: number[]; most: number[] } {
  const per = COLOR_UNICODE_POINTS_PER_COLOR;
  const fewest = Array.from({ length: pieces.length + 1 }, () => 0);
  const most = Array.from({ length: pieces.length + 1 }, () => 0);
  for (let piece = pieces.length - 1; piece >= 0; piece -= 1) {
    const current = defined(pieces[piece]);
    const marks = typeof current === "string" ? 0 : current.marks;
    fewest[piece] = defined(fewest[piece + 1]) + (marks === 0 ? 1 : marks);
    most[piece] = defined(most[piece + 1]) + (marks === 0 ? 1 : marks * per);
  }
  return { fewest, most };
}

/**
 * Whether the codes of `scalars` from each one on are decoys: valid colors only, complete ones
 * unless the share's own length is known (`ownKnown`), when a ? may stand for a code or a whole
 * color of a decoy. A malformed suffix must not become a decoy merely because an earlier prefix
 * can be repaired.
 */
function decoysFromEach(scalars: readonly string[], ownKnown: boolean): boolean[] {
  const per = COLOR_UNICODE_POINTS_PER_COLOR;
  const decoysFrom = Array.from({ length: scalars.length + 1 }, () => false);
  decoysFrom[scalars.length] = true;
  for (let at = scalars.length - 1; at >= 0; at -= 1) {
    const pair = scalars.slice(at, at + per);
    decoysFrom[at] =
      (ownKnown && scalars[at] === "?" && defined(decoysFrom[at + 1])) ||
      (pair.length === per &&
        (ownKnown || !pair.includes("?")) &&
        someColorFits(pair) &&
        defined(decoysFrom[at + per]));
  }
  return decoysFrom;
}

/**
 * The ways to read `scalars`, Color Unicode codes run together with a ? for each one that cannot
 * be read, as colors: each mark one code, or a whole color that begins at the first code of a
 * color (docs/SSKR.md). A run of marks is expanded to each number of codes that it can stand for,
 * so that two ways to the same codes are one reading. A way is given up as soon as a color that
 * it makes fits no color, or no supported share prefix can contain its marks. Complete valid
 * colors after a prefix are decoys; when the colors of the checksum and header lead the codes
 * read, the share's own length is known and whatever follows it, marks too, is decoys
 * (AUD-022-FUN003), as addUnitModel takes them. Every way that is left is given, the fewest codes
 * for each run first; AmbiguousMarksError when there are more than MAX_MARK_WIDTH_READINGS, or the
 * search takes more than its steps. Prefixes share those bounds, rather than starting another
 * search.
 */
function colorUnicodePairings(
  scalars: readonly string[],
): { readonly pairs: string[][]; readonly decoys: boolean }[] {
  if (scalars.length > MAX_REPAIR_UNITS * COLOR_UNICODE_POINTS_PER_COLOR) return [];
  const pieces = codePieces(scalars);
  const per = COLOR_UNICODE_POINTS_PER_COLOR;
  const { mixed, valueOf } = SHARE_UNITS["colors-unicode"];
  // The colors before the first mark are read as they stand: a mark alone may be a whole color.
  const firstMark = scalars.indexOf("?");
  const leading = firstMark < 0 ? scalars : scalars.slice(0, firstMark);
  const own = ownCountRead(
    defined(mixed),
    listPieces(leading.slice(0, leading.length - (leading.length % per)), per).map((pair) =>
      valueOf(pair.join("")),
    ),
  );
  const colorCounts = [...mixedUnitCounts(defined(mixed))].filter(
    (count) => own === undefined || count === own,
  );
  const { fewest, most } = codeCountsFrom(pieces);
  const decoysFrom = decoysFromEach(scalars, own !== undefined);
  // Where each piece begins among the codes as written.
  const scalarAt = [0];
  for (const piece of pieces)
    scalarAt.push(defined(scalarAt.at(-1)) + (typeof piece === "string" ? 1 : piece.marks));
  let lastMark = -1;
  for (let piece = 0; piece < pieces.length; piece += 1)
    if (typeof pieces[piece] === "object") lastMark = piece;
  const codes: string[] = [];
  const readings: { pairs: string[][]; decoys: boolean }[] = [];
  let steps = 0;
  /** Whether the colors that the codes from `from` on touch each fit some color. */
  const colorsFit = (from: number): boolean => {
    for (let color = Math.floor(from / per); color * per < codes.length; color += 1) {
      const pair = Array.from({ length: per }, (_, half) => codes[color * per + half] ?? "?");
      if (!someColorFits(pair)) return false;
    }
    return true;
  };
  const read = (decoys: boolean): void => {
    readings.push({ pairs: listPieces(codes, per), decoys });
    if (readings.length > MAX_MARK_WIDTH_READINGS) throw new AmbiguousMarksError();
  };
  /** Places `placed` after the codes so far and, when the colors fit, goes on with `then`. */
  const withPlaced = (placed: readonly string[], then: () => void): void => {
    const start = codes.length;
    codes.push(...placed);
    if (colorsFit(start)) then();
    codes.length = start;
  };
  const marksOf = (length: number) => Array.from({ length }, () => "?");
  const place = (piece: number): void => {
    steps += 1;
    if (steps > MAX_MARK_WIDTH_STEPS) throw new AmbiguousMarksError();
    // Marks after a share of known length are decoys and need no place in it.
    const required =
      own === undefined && piece <= lastMark
        ? defined(fewest[piece]) - defined(fewest[lastMark + 1])
        : 0;
    const least = codes.length + required;
    const greatest = codes.length + defined(most[piece]);
    if (!colorCounts.some((count) => least <= count * per && count * per <= greatest)) return;
    if (colorCounts.includes(codes.length / per) && decoysFrom[defined(scalarAt[piece])]) {
      read(piece < pieces.length);
      if (own !== undefined) return;
    }
    if (piece === pieces.length) return;
    const current = defined(pieces[piece]);
    if (typeof current === "string") {
      withPlaced([current], () => place(piece + 1));
      return;
    }
    for (const length of runLengths(current.marks, codes.length))
      withPlaced(marksOf(length), () => place(piece + 1));
    // A run of marks that goes on past the end of a share of known length: the share takes the
    // first of them, and the others are decoys.
    if (own !== undefined)
      for (let taken = 1; taken < current.marks; taken += 1)
        for (const length of runLengths(taken, codes.length))
          if (codes.length + length === own * per && decoysFrom[defined(scalarAt[piece]) + taken])
            withPlaced(marksOf(length), () => read(true));
  };
  place(0);
  return readings;
}

/**
 * Colors written as Unicode codes, two per color: each mark may stand for one of the two codes or
 * for a whole color, and every way that fits is tried (colorUnicodePairings). A color with a mark
 * is unknown as a whole; one with one code given keeps that code (`fits`).
 */
function addColorUnicodeModels(models: UnitModel[], text: string): void {
  // Run together only: a ? among the codes' digits marks no digit of a color (CODE_FORMS).
  const scalars = markedColorSymbols(text) ?? withinRepair(joinedHexUnits(text, CODE_DIGITS));
  if (scalars === undefined) return;
  if (!scalars.every((code) => code === "?" || isColorUnicodePoint(parseInt(code, 16)))) return;
  const { unitText } = SHARE_UNITS["colors-unicode"];
  for (const { pairs, decoys } of colorUnicodePairings(scalars)) {
    // Every color whose codes are all read is one (colorUnicodePairings); one with a mark in
    // either of its codes is unknown as a whole.
    const values = defined(
      unitValues(
        "colors-unicode",
        pairs.map((pair) => pair.join("")),
        isMarked,
      ),
    );
    models.push({
      format: "colors-unicode",
      values,
      decoys,
      structures: structuresOf("colors-unicode", pairs.length),
      fits: (filled) =>
        pairs.every((pair, index) => {
          const written = defined(unitText(defined(filled[index])).match(CODE_POINT_TEXT));
          return pair.every((code, half) => code === "?" || code === written[half]);
        }),
    });
  }
}

/** The Color Unicode code points, in their order, as four hexadecimal digits each. */
const COLOR_CODE_POINTS: readonly string[] = Array.from(
  { length: COLOR_UNICODE_WIDTH },
  (_, index) => hexCodePoint(COLOR_UNICODE_BASE + index),
);

/**
 * The colors whose two Color Unicode codes fit `pair`, its codes with a ? for each digit that
 * cannot be read: every high code that fits, with every low code that fits, that writes a color.
 */
function colorsFitting(pair: readonly string[]): number[] | undefined {
  const [high, low] = pair.map((code) =>
    COLOR_CODE_POINTS.filter((point) => fitsPattern(code, point)),
  );
  const { valueOf } = SHARE_UNITS["colors-unicode"];
  // Broad constraints stay symbolic in fits: no candidates are truncated or eagerly expanded.
  if (defined(high).length > Math.floor(MAX_PARTIAL_UNIT_CANDIDATES / defined(low).length))
    return undefined;
  return defined(high).flatMap((first) =>
    defined(low).flatMap((second) => valueOf(first + second) ?? []),
  );
}

/**
 * Colors written as Unicode codes apart, two codes a color, with a ? for each digit that cannot be
 * read, such as E1?A, as colors and the Unicode codes of words take them (owner, 2026-10-13). The
 * digits of a code are no bits of its color, which is a quotient and a remainder of
 * COLOR_UNICODE_WIDTH (core/colors.ts): a color with a code read in part is unknown as a whole,
 * and small sets of colors whose codes fit are its candidates, as the words of a partly read
 * Unicode code are (addUnicodeModel). A code that cannot be read at all leaves its color unknown,
 * with no candidates; broad pairs also keep just their digit predicate, avoiding a Cartesian
 * expansion before the assessment's work guard. No allowed colors are discarded. Text without a
 * digit marked is read by addColorUnicodeModels alone.
 */
function addColorUnicodeDigitModel(models: UnitModel[], text: string): void {
  const codes = withinRepair(apartHexUnits(text, CODE_DIGITS));
  if (codes === undefined || !codes.some(readInPart)) return;
  if (codes.length % COLOR_UNICODE_POINTS_PER_COLOR !== 0) return;
  const pairs = listPieces(codes, COLOR_UNICODE_POINTS_PER_COLOR);
  const { valueOf, unitText } = SHARE_UNITS["colors-unicode"];
  const values: (number | undefined)[] = [];
  const candidates: (number[] | undefined)[] = [];
  for (const pair of pairs) {
    if (pair.some(isMarked)) {
      values.push(undefined);
      // Only a color whose codes are all read in part or in full narrows to its candidates.
      const narrow = pair.some(readInPart) && !pair.some(wholeMark);
      const fitting = narrow ? colorsFitting(pair) : undefined;
      if (fitting?.length === 0) return;
      candidates.push(fitting);
    } else {
      const value = valueOf(pair.join(""));
      if (value === undefined) return;
      values.push(value);
      candidates.push(undefined);
    }
  }
  const fitting = candidates.map((colors) => (colors === undefined ? undefined : new Set(colors)));
  addUnitModel(models, {
    format: "colors-unicode",
    values,
    ...(candidates.some((colors) => colors !== undefined) ? { candidates } : {}),
    // A solution keeps every digit read, also beside a code that cannot be read.
    fits: (filled) =>
      pairs.slice(0, filled.length).every((pair, index) => {
        if (fitting[index] !== undefined)
          return defined(fitting[index]).has(defined(filled[index]));
        const written = defined(unitText(defined(filled[index])).match(CODE_POINT_TEXT));
        return pair.every(
          (code, half) => wholeMark(code) || fitsPattern(code, defined(written[half])),
        );
      }),
  });
}

/** Code points of the Color Unicode codes (core/colors.ts). */
const COLOR_UNICODE_CODE = (token: string): boolean =>
  WHOLE_CODE.test(token) && isColorUnicodePoint(parseInt(token, 16));

/** A form written as codes apart, with what markProblem and markCount ask of it. */
export interface CodeForm {
  readonly name: string;
  readonly plural: string;
  /** The symbols of a code, where a ? may stand for one of them. */
  readonly digits?: number;
  readonly reads: (token: string) => boolean;
}

/**
 * The forms written as codes apart, as markProblem tells them by the codes that can be read:
 * colors, the Unicode codes of words and Color Unicode codes take a ? for a digit; word numbers
 * only for a whole number.
 */
export const CODE_FORMS: readonly CodeForm[] = [
  {
    name: "color",
    plural: "colors",
    digits: COLOR_DIGITS,
    reads: (token) => SHARE_UNITS.colors.valueOf(token) !== undefined,
  },
  {
    name: "code",
    plural: "Unicode codes",
    digits: CODE_DIGITS,
    reads: (token) => SHARE_UNITS.unicode.valueOf(token) !== undefined,
  },
  // Their digits are no bits of a color, but they narrow it (addColorUnicodeDigitModel).
  { name: "code", plural: "Color Unicode codes", digits: CODE_DIGITS, reads: COLOR_UNICODE_CODE },
  {
    name: "word number",
    plural: "word numbers",
    reads: (token) => SHARE_UNITS.indexes.valueOf(token) !== undefined,
  },
];

/** The widths of the codes in which a ? may stand for one digit (CODE_FORMS): six and four. */
export const DIGIT_MARKED_WIDTHS: readonly number[] = CODE_FORMS.flatMap(
  (form) => form.digits ?? [],
);
