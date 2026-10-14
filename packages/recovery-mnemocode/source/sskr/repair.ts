// Repairs a share with up to six unreadable elements, each marked with ? at its place: a word
// number, a Unicode code, a color, a Byteword or a pair of letters of a UR. Every form keeps a
// CRC32 checksum, and the mixed forms a version and a length byte (transport.ts), and all of these
// are affine over GF(2) in the bits of the share: the mixing XORs each byte with a CRC32 of the
// checksum, and CRC32 itself is affine. So the missing bits are the solutions of a system of linear
// equations, found by elimination instead of by trying every value, which for three colors would
// be 2^72 tries. Each solution is then read as an ordinary share, which checks everything again.
// More solutions than one are listed as variants, never chosen silently; unmarked errors are never
// repaired.
//
// An element may also be read in part, a ? standing for each digit that cannot be read: a color
// such as #B5?0??, whose digits are bits, adds the bits read as equations of their own. A Unicode
// code such as 4E?0, whose digits are not bits of its word number, is unknown as a whole, and the
// words whose code fits are its candidates: a solution must be one of them (fits), and where that
// shortens the search they are tried one by one, each as the code's bits (withValues).
//
// MarkedReading and ReadingSpace are the classes of the repair: a way to read a marked text, and
// the solutions of that reading on its own, which owns the share's secret arrays and wipes them.
// The units of each form are read and written through share-units.ts and the mixed layout through
// mixed-layout.ts, as the reader of shares reads them (transport.ts).

import {
  apartHexUnits,
  codeTokens,
  fitsPattern,
  withJoinedMarksHint,
  hexCodePoint,
  hexUnits,
  joinedHexUnits,
  UNICODE_CODE_DIGITS,
  wholeMark,
} from "../core/code-text.js";
import {
  byteStringHeads,
  MEMBER_BYTE,
  NIBBLE_BITS,
  SHARE_LENGTHS,
  SHARE_METADATA_BYTES,
  SSKR_CBOR_TAGS,
  tagBytes,
  payloadLayouts,
} from "./share-layout.js";
import { checksumAt, crc32 } from "./checksum.js";
import { BitFields, combination, linearize, solve, unitVectors } from "./gf2.js";
import { CHECKSUM_BYTES, MAX_TRANSPORT_BYTES, readShare, type ShareFormat } from "./transport.js";
import {
  fillingFields,
  headerFields,
  ownUnitCount,
  SHARE_HEADER_BYTES,
  unmixedBody,
  type MixedForm,
  type ZeroField,
} from "./mixed-layout.js";
import { bytewordUnits, SHARE_UNITS, UR_SSKR_START } from "./share-units.js";
import { unicodeCodesFitting } from "../core/words.js";
import {
  COLOR_UNICODE_BASE,
  COLOR_UNICODE_POINTS_PER_COLOR,
  COLOR_UNICODE_WIDTH,
  isColorUnicodePoint,
  markedColorSymbols,
  RGB_HEX_DIGITS,
} from "../core/colors.js";
import { BITS_PER_BYTE, xorInto } from "../core/bits.js";
import { capitalized } from "../core/prose.js";
import { listPieces } from "../core/pieces.js";

/** More marked elements than this leave too few checksum bits to find them. */
export const MAX_MARKED_ELEMENTS = 6;
/** Hexadecimal digits of a color, #RRGGBB, and of a Unicode code of a word. */
const COLOR_DIGITS = RGB_HEX_DIGITS;
const CODE_DIGITS = UNICODE_CODE_DIGITS;
/** The bits of one hexadecimal digit. */
const HEX_DIGIT_BITS = 4;
/** A whole Unicode code, alone. */
const WHOLE_CODE = new RegExp(`^[0-9A-F]{${CODE_DIGITS}}$`, "u");
/** The code points of Color Unicode text, each as its hexadecimal digits. */
const CODE_POINT_TEXT = new RegExp(`.{${CODE_DIGITS}}`, "gu");
/** A pair of letters of a UR as written, in lower case. */
const UR_PAIR = /[a-z]{2}/;
/**
 * Readings that one share alone is tried in, one for each choice of words for its partly read
 * Unicode codes (MarkedReading.choicesAt), when the checksum alone leaves too many solutions.
 */
export const MAX_CODE_CHOICES = 256;
/** The longest text of one share that a repair reads (exceedsMarks). */
const MAX_REPAIR_TEXT_LENGTH = 2048;
// Every unit holds at least one byte of the transport, so no repairable share has more units.
const MAX_REPAIR_UNITS = MAX_TRANSPORT_BYTES;
/**
 * Up to 2^4 solutions of one share are listed as variants. Restoring with other shares may try up
 * to 2^8 of them, since the SSKR library then keeps only the one whose secret digest fits.
 */
export const LISTED_FREE_BITS = 4;
const CRC_BITS = CHECKSUM_BYTES * BITS_PER_BYTE;

/** An element filled in by a repair: its place, counted from 1, and what it is. */
export interface FilledElement {
  readonly position: number;
  readonly value: string;
}

export interface ReadRepairableShare {
  readonly ur: string;
  readonly format: ShareFormat;
  readonly repaired: boolean;
  /** The marked elements as the repair filled them in, in order. */
  readonly filled: readonly FilledElement[];
}

/** A complete share, read in its form, as a repair gives it back with nothing filled in. */
export function unrepairedShare(text: string): ReadRepairableShare {
  return { ...readShare(text), repaired: false, filled: [] };
}

/** Whether `text`, a whole share as written, marks an element that could not be read with ?. */
export function isMarked(text: string): boolean {
  return text.includes("?");
}

/**
 * Thrown when several shares fit the marked elements. The message names only their places: an
 * error may be shown where the screen is not private. The values are in `variants`, for the
 * caller to show where it shows secrets.
 */
export class ShareVariantsError extends Error {
  constructor(readonly variants: readonly ReadRepairableShare[]) {
    const places = variants[0]!.filled.map((element) => element.position).join(", ");
    super(
      `${variants.length} shares fit the marked elements ${places}. Use another copy of this share, or another share.`,
    );
  }
}

/**
 * One way the bytes of a share can be laid out (its secret length, CBOR header and tag), as
 * functions of its unit values, both affine over GF(2): the residual bits, zero exactly when the
 * share is well formed, and the SSKR payload, 5 metadata bytes and the share value.
 */
export interface ShareStructure {
  readonly payloadLength: number;
  readonly evaluate: (values: readonly number[]) => {
    readonly residual: bigint;
    readonly payload: Uint8Array;
  };
}

/**
 * A share read as units of one form: their values, undefined where marked. The form writes the
 * units (SHARE_UNITS).
 */
interface ReadingUnits {
  readonly format: ShareFormat;
  readonly values: readonly (number | undefined)[];
  /** Rejects values that the written text rules out, such as a color code given half. */
  readonly fits?: (values: readonly number[]) => boolean;
  /** For each marked unit read in part, the bits that were read (ReadBits); equations too. */
  readonly readBits?: readonly (ReadBits | undefined)[];
  /**
   * For each partly read unit whose digits are no bits of it, such as a Unicode code, the values
   * that fit the digits read: a solution takes one of them (fits), and withValues tries them.
   */
  readonly candidates?: readonly (readonly number[] | undefined)[];
}

/** The units of a share in one form, with every structure that their count allows. */
interface UnitModel extends ReadingUnits {
  readonly structures: readonly ShareStructure[];
}

/**
 * The bits of a marked unit that were read, `mask` set where `value` holds them: the digits of a
 * color that could be read, or every bit of the one word that a reading takes for a partly read
 * Unicode code.
 */
export interface ReadBits {
  readonly value: number;
  readonly mask: number;
}

/**
 * A CBOR layout of a share: its payload length, its byte-string header in bytes, and the bytes of
 * its tag, if any.
 */
interface CborLayout {
  readonly payloadLength: number;
  readonly header: number;
  readonly tagBytes: readonly number[];
}

/** The bytes that open a share with each SSKR tag that the reader accepts (share-layout.ts). */
const SSKR_TAGS: readonly (readonly number[])[] = SSKR_CBOR_TAGS.map(tagBytes);

/** Every CBOR layout: SSKR metadata and secret, each head its length allows, each of `tags`. */
function cborLayouts(tags: readonly (readonly number[])[]): CborLayout[] {
  return [...SHARE_LENGTHS].flatMap((payloadLength) =>
    byteStringHeads(payloadLength).flatMap((head) =>
      tags.map((tagBytes) => ({ payloadLength, header: head.length, tagBytes })),
    ),
  );
}

/**
 * Residual rows that every layout adds: the tag, the byte-string header for its payload length,
 * and the reserved nibble.
 */
function cborRows(cbor: ArrayLike<number>, layout: CborLayout): ZeroField[] {
  const { payloadLength, header, tagBytes } = layout;
  const tag = tagBytes.length;
  const headerBytes = byteStringHeads(payloadLength).find((head) => head.length === header)!;
  return [
    ...tagBytes.map((byte, index) => [cbor[index]! ^ byte, BITS_PER_BYTE] as const),
    ...headerBytes.map((byte, index) => [cbor[tag + index]! ^ byte, BITS_PER_BYTE] as const),
    // The reserved high nibble of the member's byte (sskr encoding.rs).
    [cbor[tag + header + MEMBER_BYTE]! >>> NIBBLE_BITS, BITS_PER_BYTE - NIBBLE_BITS],
  ];
}

function payloadOf(cbor: ArrayLike<number>, layout: CborLayout): Uint8Array {
  return Uint8Array.from(
    { length: layout.payloadLength },
    (_, index) => cbor[layout.tagBytes.length + layout.header + index]!,
  );
}

/**
 * The residual and the payload of `cbor` laid out as `layout`, with `recorded` its checksum as
 * written: the checksum against the CBOR, then `fields` of the form, then the rows of the layout.
 * Every structure, standard or mixed, evaluates its share through it. It owns `cbor`, a new array
 * from each caller that holds the whole share, and wipes it: the payload it gives back is a copy,
 * which the caller wipes.
 */
function layoutResidual(
  cbor: Uint8Array,
  recorded: number,
  layout: CborLayout,
  fields: readonly ZeroField[] = [],
): { readonly residual: bigint; readonly payload: Uint8Array } {
  try {
    return {
      residual: BitFields.of([
        [crc32(cbor) ^ recorded, CRC_BITS],
        ...fields,
        ...cborRows(cbor, layout),
      ]),
      payload: payloadOf(cbor, layout),
    };
  } finally {
    cbor.fill(0);
  }
}

/** Every CBOR layout of a mixed share: without a tag, or with each SSKR tag. */
const MIXED_LAYOUTS: readonly CborLayout[] = cborLayouts([[], ...SSKR_TAGS]);

/** The bytes of the CBOR of `layout`: its tag, its byte-string header and its payload. */
function cborLengthOf(layout: CborLayout): number {
  return layout.tagBytes.length + layout.header + layout.payloadLength;
}

/** Where a mixed share of `layout` ends: its checksum, its version and length, and its CBOR. */
function mixedEnd(layout: CborLayout): number {
  return CHECKSUM_BYTES + SHARE_HEADER_BYTES + cborLengthOf(layout);
}

/** The unit counts that a mixed share of `form` can have: those that mixedStructures solves. */
function mixedUnitCounts(form: MixedForm): ReadonlySet<number> {
  return new Set(MIXED_LAYOUTS.map((layout) => form.unitCount(mixedEnd(layout))));
}

/**
 * Structures of a mixed share of `units` units of `form`, in colors or words (mixed-layout.ts),
 * one per CBOR layout whose length the units hold: the checksum against the unmixed CBOR, the
 * version and the length (headerFields), the filling after the share, which must be zero
 * (fillingFields), and the rows of the layout itself.
 */
function mixedStructures(form: MixedForm, units: number): ShareStructure[] {
  return MIXED_LAYOUTS.flatMap((layout) => {
    const cborLength = cborLengthOf(layout);
    const end = mixedEnd(layout);
    if (form.unitCount(end) !== units) return [];
    return [
      {
        payloadLength: layout.payloadLength,
        evaluate: (values) => {
          const packed = form.pack(values);
          const body = unmixedBody(packed.bytes, SHARE_HEADER_BYTES + cborLength);
          const cbor = Uint8Array.from(body.slice(SHARE_HEADER_BYTES));
          try {
            return layoutResidual(cbor, checksumAt(packed.bytes, 0), layout, [
              ...headerFields(body, form.version, cborLength),
              ...fillingFields(packed, end),
            ]);
          } finally {
            // The unmixed share, whose CBOR layoutResidual wipes in its own copy.
            body.fill(0);
          }
        },
      },
    ];
  });
}

/**
 * Structures of a standard share, in Bytewords or as a UR: the checksum against the bytes before
 * it, and the rows of the layout that this length takes. Either form may carry the SSKR tag, 40309
 * or the earlier 309, or none, since transport.ts reads all of them (AUD-008-API006).
 */
function standardStructures(units: number): ShareStructure[] {
  const layouts: CborLayout[] = [[], ...SSKR_TAGS].flatMap((tagBytes) =>
    payloadLayouts(units - CHECKSUM_BYTES - tagBytes.length).map(({ payloadLength, head }) => ({
      payloadLength,
      header: head,
      tagBytes,
    })),
  );
  return layouts.map((layout) => ({
    payloadLength: layout.payloadLength,
    evaluate: (values) =>
      layoutResidual(
        Uint8Array.from(values.slice(0, units - CHECKSUM_BYTES)),
        checksumAt(values, units - CHECKSUM_BYTES),
        layout,
      ),
  }));
}

/** The structures of a share of `units` units in `format`: mixed, or standard. */
function structuresOf(format: ShareFormat, units: number): ShareStructure[] {
  const { mixed } = SHARE_UNITS[format];
  return mixed === undefined ? standardStructures(units) : mixedStructures(mixed, units);
}

/** `units`, or undefined when there are more of them than any repairable share has. */
function withinRepair(units: string[] | undefined): string[] | undefined {
  return units !== undefined && units.length <= MAX_REPAIR_UNITS ? units : undefined;
}

/** The pairs of letters of a UR as written, with ? for an unreadable pair, or undefined. */
function urPairs(body: string): string[] | undefined {
  const units = body.match(new RegExp(`${UR_PAIR.source}|\\?`, "giu"));
  return withinRepair(units !== null && units.join("") === body ? units : undefined);
}

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

/** Whether `code` has digits that can be read and digits that cannot. */
function readInPart(code: string): boolean {
  return code !== "?" && code.includes("?");
}

/** The digits of `code` that can be read, as ReadBits; each digit is four bits, the first highest. */
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
  return values.some((value, index) => value === undefined && !marked(units[index]!))
    ? undefined
    : values;
}

/**
 * Adds every supported mixed prefix, keeping the text's already validated units after it as
 * complete decoys. A fully read header fixes its length; marks in the checksum or header leave
 * every supported length in play. Each structure still checks the version, length, CRC and padding,
 * and solvedShare checks the metadata. Standard forms keep their entire input.
 */
function addUnitModel(models: UnitModel[], units: ReadingUnits): void {
  const { format, values, readBits, candidates } = units;
  if (values.length > MAX_REPAIR_UNITS) return;
  const { mixed } = SHARE_UNITS[format];
  if (mixed === undefined) {
    models.push({ ...units, structures: structuresOf(format, values.length) });
    return;
  }
  const headerUnits = mixed.unitCount(CHECKSUM_BYTES + SHARE_HEADER_BYTES);
  const headerRead =
    values.length >= headerUnits &&
    values.slice(0, headerUnits).every((value) => value !== undefined);
  const own = headerRead
    ? ownUnitCount(
        mixed,
        values.slice(0, headerUnits).map((value) => value!),
      )
    : undefined;
  for (const count of mixedUnitCounts(mixed)) {
    if (count > values.length || (own !== undefined && count !== own)) continue;
    if (values.slice(count).some((value) => value === undefined)) continue;
    models.push({
      ...units,
      values: values.slice(0, count),
      ...(readBits === undefined ? {} : { readBits: readBits.slice(0, count) }),
      ...(candidates === undefined ? {} : { candidates: candidates.slice(0, count) }),
      structures: structuresOf(format, count),
    });
  }
}

/** A unit marked as a whole, by a lone ?: the only mark of a Byteword, a UR pair or a word number. */
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
function unitModels(text: string): UnitModel[] {
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
  addUnitModel(models, {
    format: "unicode",
    values,
    ...(candidates.some((words) => words !== undefined)
      ? {
          candidates,
          fits: (filled: readonly number[]) =>
            fitting
              .slice(0, filled.length)
              .every((words, place) => words?.has(filled[place]!) ?? true),
        }
      : {}),
  });
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
  const values = unitValues("colors", colors, isMarked)!;
  addUnitModel(models, {
    format: "colors",
    values,
    ...(partly
      ? { readBits: colors.map((color) => (readInPart(color) ? digitBits(color) : undefined)) }
      : {}),
  });
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
  constructor() {
    super(AMBIGUOUS_MARK_WIDTHS);
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
 * The ways to read `scalars`, Color Unicode codes run together with a ? for each one that cannot
 * be read, as colors: each mark one code, or a whole color that begins at the first code of a
 * color (docs/SSKR.md). A run of marks is expanded to each number of codes that it can stand for,
 * so that two ways to the same codes are one reading. A way is given up as soon as a color that
 * it makes fits no color, or no supported share prefix can contain its marks. Complete valid
 * colors after a prefix are decoys. Every way that is left is given, the fewest codes for each
 * run first; AmbiguousMarksError when there are more than MAX_MARK_WIDTH_READINGS, or the search
 * takes more than its steps. Prefixes share those bounds, rather than starting another search.
 */
function colorUnicodePairings(scalars: readonly string[]): string[][][] {
  if (scalars.length > MAX_REPAIR_UNITS * COLOR_UNICODE_POINTS_PER_COLOR) return [];
  const pieces = codePieces(scalars);
  const per = COLOR_UNICODE_POINTS_PER_COLOR;
  const colorCounts = [...mixedUnitCounts(SHARE_UNITS["colors-unicode"].mixed!)];
  // The fewest and the most codes that the pieces from each one on stand for: a mark one code,
  // or at most a whole color.
  const fewest = new Array<number>(pieces.length + 1).fill(0);
  const most = new Array<number>(pieces.length + 1).fill(0);
  for (let piece = pieces.length - 1; piece >= 0; piece -= 1) {
    const current = pieces[piece]!;
    const marks = typeof current === "string" ? 0 : current.marks;
    fewest[piece] = fewest[piece + 1]! + (marks === 0 ? 1 : marks);
    most[piece] = most[piece + 1]! + (marks === 0 ? 1 : marks * per);
  }
  // Only complete, valid colors may follow a candidate prefix. A malformed suffix must not
  // become a decoy merely because an earlier prefix can be repaired.
  const decoysFit = new Array<boolean>(pieces.length + 1).fill(false);
  decoysFit[pieces.length] = true;
  for (let piece = pieces.length - per; piece >= 0; piece -= 1) {
    const pair = pieces.slice(piece, piece + per);
    decoysFit[piece] =
      pair.every((code): code is string => typeof code === "string") &&
      someColorFits(pair) &&
      decoysFit[piece + per]!;
  }
  let lastMark = -1;
  for (let piece = 0; piece < pieces.length; piece += 1)
    if (typeof pieces[piece] === "object") lastMark = piece;
  const codes: string[] = [];
  const readings: string[][][] = [];
  let steps = 0;
  /** Whether the colors that the codes from `from` on touch each fit some color. */
  const colorsFit = (from: number): boolean => {
    for (let color = Math.floor(from / per); color * per < codes.length; color += 1) {
      const pair = Array.from({ length: per }, (_, half) => codes[color * per + half] ?? "?");
      if (!someColorFits(pair)) return false;
    }
    return true;
  };
  const place = (piece: number): void => {
    steps += 1;
    if (steps > MAX_MARK_WIDTH_STEPS) throw new AmbiguousMarksError();
    const required = piece <= lastMark ? fewest[piece]! - fewest[lastMark + 1]! : 0;
    const least = codes.length + required;
    const greatest = codes.length + most[piece]!;
    if (!colorCounts.some((count) => least <= count * per && count * per <= greatest)) return;
    if (colorCounts.includes(codes.length / per) && decoysFit[piece]) {
      readings.push(listPieces(codes, per));
      if (readings.length > MAX_MARK_WIDTH_READINGS) throw new AmbiguousMarksError();
    }
    if (piece === pieces.length) return;
    const current = pieces[piece]!;
    const placings =
      typeof current === "string"
        ? [[current]]
        : runLengths(current.marks, codes.length).map((length) =>
            new Array<string>(length).fill("?"),
          );
    for (const placed of placings) {
      const start = codes.length;
      codes.push(...placed);
      if (colorsFit(start)) place(piece + 1);
      codes.length = start;
    }
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
  for (const pairs of colorUnicodePairings(scalars)) {
    // Every color whose codes are all read is one (colorUnicodePairings); one with a mark in
    // either of its codes is unknown as a whole.
    const values = unitValues(
      "colors-unicode",
      pairs.map((pair) => pair.join("")),
      isMarked,
    )!;
    models.push({
      format: "colors-unicode",
      values,
      structures: structuresOf("colors-unicode", pairs.length),
      fits: (filled) =>
        pairs.every((pair, index) => {
          const written = unitText(filled[index]!).match(CODE_POINT_TEXT)!;
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
function colorsFitting(pair: readonly string[]): number[] {
  const [high, low] = pair.map((code) =>
    COLOR_CODE_POINTS.filter((point) => fitsPattern(code, point)),
  );
  const { valueOf } = SHARE_UNITS["colors-unicode"];
  return high!.flatMap((first) => low!.flatMap((second) => valueOf(first + second) ?? []));
}

/**
 * Colors written as Unicode codes apart, two codes a color, with a ? for each digit that cannot be
 * read, such as E1?A, as colors and the Unicode codes of words take them (owner, 2026-10-13). The
 * digits of a code are no bits of its color, which is a quotient and a remainder of
 * COLOR_UNICODE_WIDTH (core/colors.ts): a color with a code read in part is unknown as a whole,
 * and the colors whose codes fit what was read are its candidates, as the words of a partly read
 * Unicode code are (addUnicodeModel). A code that cannot be read at all leaves its color unknown,
 * with no candidates; text without a digit marked is read by addColorUnicodeModels alone.
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
        if (fitting[index] !== undefined) return fitting[index]!.has(filled[index]!);
        const written = unitText(filled[index]!).match(CODE_POINT_TEXT)!;
        return pair.every((code, half) => wholeMark(code) || fitsPattern(code, written[half]!));
      }),
  });
}

/**
 * Every way to pick one item of each list, the first list's items varying slowest; undefined once
 * there are more than `limit`. The choices of candidate words and the readings of several shares
 * are both expanded through it.
 */
export function everyPick<T>(
  lists: readonly (readonly T[])[],
  limit = Infinity,
): T[][] | undefined {
  let all: T[][] = [[]];
  for (const list of lists) {
    // Compared before the ways are made, and divided so that no product grows past the limit; an
    // empty list leaves no way, which is within any limit.
    if (list.length > 0 && all.length > Math.floor(limit / list.length)) return undefined;
    all = all.flatMap((prefix) => list.map((item) => [...prefix, item]));
  }
  return all;
}

/**
 * The candidate units to try value by value, in the order given, as many as keep the product of
 * their counts within `limit`; the others stay unknown as a whole.
 */
export function placesWithin<Unit extends { readonly count: number }>(
  units: readonly Unit[],
  limit: number,
): Unit[] {
  const chosen: Unit[] = [];
  let product = 1;
  for (const unit of units) {
    // Compared before multiplying, so that the product stays a whole number within the limit.
    if (unit.count > Math.floor(limit / product)) continue;
    product *= unit.count;
    chosen.push(unit);
  }
  return chosen;
}

/**
 * One way to read a marked text: a form with its unit values, undefined where marked, and one
 * structure. A class, so that a reading is made only from text (MarkedReading.of) and every
 * question about it is answered by it: its marked places and the layout of their bits, the share
 * that values at them give, and its space of solutions. It never changes: values chosen for its
 * candidates make another reading (withValues). joint-repair.ts solves several shares together
 * from these.
 */
export class MarkedReading {
  readonly #units: ReadingUnits;
  readonly #structure: ShareStructure;
  /** The places of the marked units, in the order of their bits among the unknowns. */
  readonly #holes: readonly number[];

  private constructor(units: ReadingUnits, structure: ShareStructure) {
    this.#units = units;
    this.#structure = structure;
    this.#holes = Object.freeze(
      units.values.flatMap((value, index) => (value === undefined ? [index] : [])),
    );
  }

  /**
   * Every reading of `text`: each form and structure of a supported prefix before complete card
   * decoys, or of the entire input for a standard form. Every genuine mark stays in the prefix.
   */
  static of(text: string): MarkedReading[] {
    return unitModels(text).flatMap(({ structures, ...units }) =>
      structures.map((structure) => new MarkedReading(units, structure)),
    );
  }

  /** The form that the text is read in. */
  get format(): ShareFormat {
    return this.#units.format;
  }

  /** The bits of one unit of the form. */
  get unitBits(): number {
    return SHARE_UNITS[this.format].unitBits;
  }

  /** The value of every unit, undefined where it is marked. */
  get values(): readonly (number | undefined)[] {
    return this.#units.values;
  }

  /** The layout of the share's bytes that this reading takes. */
  get structure(): ShareStructure {
    return this.#structure;
  }

  /** For each marked unit read in part, the bits that were read (ReadBits). */
  get readBits(): readonly (ReadBits | undefined)[] | undefined {
    return this.#units.readBits;
  }

  /** For each partly read unit whose digits are no bits of it, the values that fit them. */
  get candidates(): readonly (readonly number[] | undefined)[] | undefined {
    return this.#units.candidates;
  }

  /** The places of the marked units, in the order of their bits among the unknowns. */
  get holes(): readonly number[] {
    return this.#holes;
  }

  /** The unknown bits: those of every marked unit. */
  get unknownBits(): number {
    return this.#holes.length * this.unitBits;
  }

  /**
   * Where the bits of the marked unit that comes `order`-th start among the unknowns: unit k at
   * bits k * unitBits on. The one layout of the unknowns, which every reader of them asks through
   * unitMask and valuesAt.
   */
  #shift(order: number): bigint {
    return BigInt(order * this.unitBits);
  }

  /** The bits, among the unknowns, of the marked unit that comes `order`-th (holes[order]). */
  unitMask(order: number): bigint {
    return ((1n << BigInt(this.unitBits)) - 1n) << this.#shift(order);
  }

  /** The values of every unit with the unknown bits `bits` at the marked ones. */
  valuesAt(bits: bigint): number[] {
    const values = this.zeroFilled();
    this.#holes.forEach((hole, order) => {
      values[hole] = Number((bits & this.unitMask(order)) >> this.#shift(order));
    });
    return values;
  }

  /** The values of the units with every marked one taken as zero. */
  zeroFilled(): number[] {
    return this.values.map((value) => value ?? 0);
  }

  /**
   * This reading with the units at the places of `chosen` taken as the values given, each one of
   * its candidates: all their bits become equations, and they are still reported as filled in.
   */
  withValues(chosen: ReadonlyMap<number, number>): MarkedReading {
    const mask = 2 ** this.unitBits - 1;
    const readBits = this.values.map((_, place) => {
      const value = chosen.get(place);
      return value === undefined ? this.readBits?.[place] : { value, mask };
    });
    return new MarkedReading({ ...this.#units, readBits }, this.#structure);
  }

  /**
   * Whether the bits of the marked unit at `place` reach the SSKR metadata of the share, its first
   * SHARE_METADATA_BYTES payload bytes: the identifier and the thresholds, which all shares of a
   * set carry, and the member number. Units that reach it tell the shares apart, and settle the
   * most.
   */
  reachesMetadata(place: number): boolean {
    const values = this.zeroFilled();
    const before = this.#structure.evaluate(values).payload;
    try {
      for (let bit = 0; bit < this.unitBits; bit += 1) {
        const flipped = [...values];
        flipped[place] = values[place]! ^ (1 << bit);
        const after = this.#structure.evaluate(flipped).payload;
        try {
          for (let byte = 0; byte < SHARE_METADATA_BYTES; byte += 1)
            if (after[byte] !== before[byte]) return true;
        } finally {
          // A share's part of the secret, needed only for this comparison.
          after.fill(0);
        }
      }
      return false;
    } finally {
      before.fill(0);
    }
  }

  /**
   * Every reading of this one with the candidate units at `places` taken value by value
   * (withValues): one for each combination of their values.
   */
  choicesAt(places: readonly number[]): MarkedReading[] {
    const { candidates } = this;
    // Another reading of the share, such as another form, may have no candidates at these places.
    const tried = places.filter((place) => candidates?.[place] !== undefined);
    if (tried.length === 0) return [this];
    return everyPick(tried.map((place) => candidates![place]!))!.map((values) =>
      this.withValues(new Map(tried.map((place, index) => [place, values[index]!]))),
    );
  }

  /** The candidate units of this reading: each with its place and its number of values. */
  candidateCounts(): { readonly place: number; readonly count: number }[] {
    return (this.candidates ?? []).flatMap((values, place) =>
      values === undefined ? [] : [{ place, count: values.length }],
    );
  }

  /**
   * The share that this reading gives with `values` at its marks, read as an ordinary share
   * (readShare), which checks everything again, with the elements filled in; undefined when the
   * values do not fit what was read, the text is no share, or it reads as another form. The repair
   * of one share and of several together both take their solutions through it.
   */
  solvedShare(values: readonly number[]): ReadRepairableShare | undefined {
    const { fits } = this.#units;
    if (fits !== undefined && !fits(values)) return undefined;
    const units = SHARE_UNITS[this.format];
    let read;
    try {
      read = readShare(units.text(values));
    } catch {
      return undefined;
    }
    if (read.format !== this.format) return undefined;
    const filled = this.#holes.map((index) => ({
      position: index + 1,
      value: units.unitText(values[index]!),
    }));
    return { ur: read.ur, format: read.format, repaired: filled.length > 0, filled };
  }

  /** The solutions of this reading on its own (ReadingSpace.solve). */
  space(): ReadingSpace | undefined {
    return ReadingSpace.solve(this);
  }

  /** What `use` makes of the space of this reading, which is wiped after it (ReadingSpace.use). */
  withSpace<T>(use: (space: ReadingSpace | undefined) => T): T {
    return ReadingSpace.use(this, use);
  }
}

/**
 * The solutions of one reading on its own, as an affine space over the bits of its marked units
 * (bit b of the k-th mark is bit k * unitBits + b): one solution, the basis of the rest, and the
 * payload at that solution with the change each basis vector makes to it. A class because it owns
 * a share's part of the secret, the payload and its changes, and wipes them (wipe). payloadAt
 * hands out a payload to read, always as a new array that the caller wipes; secretArrays gives the
 * space's own arrays only to an owner that wipes them (AssessmentSecrets, AUD-012-SEC004).
 */
export class ReadingSpace {
  readonly #reading: MarkedReading;
  readonly #rank: number;
  readonly #particular: bigint;
  readonly #basis: readonly bigint[];
  readonly #payload: Uint8Array;
  readonly #payloadDeltas: readonly Uint8Array[];

  private constructor(
    reading: MarkedReading,
    solved: {
      readonly rank: number;
      readonly particular: bigint;
      readonly free: readonly bigint[];
    },
    payload: Uint8Array,
    payloadDeltas: readonly Uint8Array[],
  ) {
    this.#reading = reading;
    this.#rank = solved.rank;
    this.#particular = solved.particular;
    this.#basis = Object.freeze([...solved.free]);
    this.#payload = payload;
    this.#payloadDeltas = Object.freeze([...payloadDeltas]);
  }

  /** Solves one reading on its own; undefined when no values fit it. */
  static solve(reading: MarkedReading): ReadingSpace | undefined {
    const { holes, unitBits, unknownBits } = reading;
    const at = (bits: bigint) => {
      const values = reading.valuesAt(bits);
      const evaluated = reading.structure.evaluate(values);
      const { readBits } = reading;
      if (readBits === undefined) return evaluated;
      // The bits read of a partly read unit are equations too: each keeps the value it was read as.
      const read = BitFields.of(
        holes.map((hole) => {
          const bitsRead = readBits[hole];
          const change =
            bitsRead === undefined ? 0 : (values[hole]! ^ bitsRead.value) & bitsRead.mask;
          return [change, unitBits] as const;
        }),
      );
      return { ...evaluated, residual: (evaluated.residual << BigInt(unknownBits)) | read };
    };
    /** The residual alone at `bits`: the payload, a share's part of the secret, is wiped. */
    const residualAt = (bits: bigint): bigint => {
      const { residual, payload } = at(bits);
      payload.fill(0);
      return residual;
    };
    // The residual is affine in the missing bits: one column per bit, from flipping it alone.
    const { value: baseline, columns } = linearize(residualAt, 0n, unitVectors(unknownBits));
    const solved = solve(columns, baseline);
    if (solved === undefined) return undefined;
    const payload = at(solved.particular).payload;
    // Each payload made here becomes the change from `payload` in place: the space owns both.
    const payloadDeltas = solved.free.map((direction) => {
      const delta = at(solved.particular ^ direction).payload;
      xorInto(delta, payload);
      return delta;
    });
    return new ReadingSpace(reading, solved, payload, payloadDeltas);
  }

  /**
   * What `use` makes of the space of `reading` (undefined when no values fit it), for a caller
   * that needs its solutions and not its payload: the space is wiped once `use` returns
   * (AUD-012-SEC004).
   */
  static use<T>(reading: MarkedReading, use: (space: ReadingSpace | undefined) => T): T {
    const space = ReadingSpace.solve(reading);
    try {
      return use(space);
    } finally {
      space?.wipe();
    }
  }

  /** The reading that was solved. */
  get reading(): MarkedReading {
    return this.#reading;
  }

  /** The unknown bits: those of every marked unit. */
  get unknownBits(): number {
    return this.#reading.unknownBits;
  }

  /** The rank of the equations that the unknown bits meet. */
  get rank(): number {
    return this.#rank;
  }

  /** One solution, as the unknown bits. */
  get particular(): bigint {
    return this.#particular;
  }

  /** The basis of the differences between solutions. */
  get basis(): readonly bigint[] {
    return this.#basis;
  }

  /** The places of the marked units, in the order of their bits among the unknowns. */
  get holes(): readonly number[] {
    return this.#reading.holes;
  }

  /** The bits, among the unknowns, of the marked unit that comes `order`-th (holes[order]). */
  unitMask(order: number): bigint {
    return this.#reading.unitMask(order);
  }

  /** The values of every unit with the unknown bits `bits` at the marked ones. */
  valuesAt(bits: bigint): number[] {
    return this.#reading.valuesAt(bits);
  }

  /** The places of the marked units that `change`, a change of the unknown bits, touches. */
  holesChangedBy(change: bigint): number[] {
    return this.holes.filter((_, order) => (change & this.unitMask(order)) !== 0n);
  }

  /**
   * The payload at the solution that the bits of `own` pick from the basis, bit j the j-th basis
   * vector: a new array, which holds a share's part of the secret and which the caller wipes.
   */
  payloadAt(own: bigint): Uint8Array {
    const payload = Uint8Array.from(this.#payload);
    this.#payloadDeltas.forEach((delta, j) => {
      if ((own >> BigInt(j)) & 1n) xorInto(payload, delta);
    });
    return payload;
  }

  /** The payload's byte at `index` when no solution changes it; undefined when one does. */
  fixedPayloadByte(index: number): number | undefined {
    return this.#payloadDeltas.every((delta) => delta[index] === 0)
      ? this.#payload[index]
      : undefined;
  }

  /**
   * The space's own arrays that hold a share's part of the secret, the payload and the changes to
   * it, not copies: only for an owner that keeps them to wipe them, such as AssessmentSecrets
   * (AUD-012-SEC004).
   */
  secretArrays(): Uint8Array[] {
    return [this.#payload, ...this.#payloadDeltas];
  }

  /** Wipes the share's part of the secret that the space holds. */
  wipe(): void {
    for (const array of this.secretArrays()) array.fill(0);
  }
}

/**
 * The marked elements of `text`, as the repair reads them (docs/SSKR.md, Damaged shares). Among
 * colors or Unicode codes of words written apart, each code with a ? is one element: a lone ?, a
 * code read in part such as #B5?0?? or 4E?0, and a code all of whose digits are ?, such as ??????
 * or ????, which the repair reads as a lone ? (markedCodes). Elsewhere each ? counts, as each may
 * stand for a whole element of codes run together, except that a code of four or six symbols with
 * ? among its digits is still one element.
 */
export function markCount(text: string): number {
  const apart = digitCodesApart(text);
  if (apart !== undefined) return apart.filter(isMarked).length;
  return codeTokens(text).reduce((marks, token) => {
    const symbols = (token.match(/\?/gu) ?? []).length;
    const code = DIGIT_MARKED_WIDTHS.includes(token.length);
    const partly = code && symbols > 0 && symbols < token.length && /^[0-9A-F?]+$/iu.test(token);
    return marks + (partly ? 1 : symbols);
  }, 0);
}

/**
 * Whether `text` is longer than a repair reads or marks more than `maxElements` elements: the
 * bound of one share's repair and of a joint repair, each with its own number. The ? are bounded
 * with the elements: a partly read code holds fewer ? than its digits and counts as one.
 */
export function exceedsMarks(text: string, maxElements: number): boolean {
  const trimmed = text.trim();
  return trimmed.length > MAX_REPAIR_TEXT_LENGTH || markCount(trimmed) > maxElements;
}

/** The bound of exceedsMarks as a refusal says it: "mark at most N unreadable elements with ?". */
export function markLimit(maxElements: number): string {
  return `mark at most ${maxElements} unreadable elements with ?`;
}

/** Code points of the Color Unicode codes (core/colors.ts). */
const COLOR_UNICODE_CODE = (token: string): boolean =>
  WHOLE_CODE.test(token) && isColorUnicodePoint(parseInt(token, 16));

/** A form written as codes apart, with what markProblem and markCount ask of it. */
interface CodeForm {
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
const CODE_FORMS: readonly CodeForm[] = [
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
const DIGIT_MARKED_WIDTHS: readonly number[] = CODE_FORMS.flatMap((form) => form.digits ?? []);

/** The form of codes written apart (CODE_FORMS) that every code of `tokens` read fits, if any. */
function codeFormOf(tokens: readonly string[]): CodeForm | undefined {
  const read = tokens.filter((token) => !token.includes("?"));
  if (read.length === 0) return undefined;
  return CODE_FORMS.find((candidate) => read.every(candidate.reads));
}

/**
 * The codes of `text` when it is codes written apart of a form whose codes take a ? for a digit,
 * colors or Unicode codes of words, as the repair reads them (apartHexUnits); undefined otherwise.
 */
function digitCodesApart(text: string): string[] | undefined {
  const digits = codeFormOf(codeTokens(text))?.digits;
  return digits === undefined ? undefined : apartHexUnits(text, digits);
}

/**
 * Why a code with a ? among its symbols cannot be read, in words that follow "Share 2: ", when the
 * text is codes written apart of one form (CODE_FORMS): in a color or a Unicode code it must keep
 * all its symbols, a ? for each digit that cannot be read; the other forms take only a lone ? for
 * a whole code. A ? joined to a whole code, as in ?4E00, is read as before and not named. It names
 * the code by its place only: the text may be shown where the screen is not private.
 */
export function markProblem(text: string): string | undefined {
  const tokens = codeTokens(text);
  const form = codeFormOf(tokens);
  if (form === undefined) return undefined;
  for (const [index, token] of tokens.entries()) {
    if (!token.includes("?") || wholeMark(token)) continue;
    const name = `${form.name} ${index + 1}`;
    if (form.digits === undefined)
      return `${name} has a ? among its digits: ${form.plural} take only a lone ? for a whole ${form.name}.`;
    // Longer than a code: a whole mark joined to a code, which the joined reading takes.
    if (token.length < form.digits)
      return `${name} has ${token.length} of ${form.digits} symbols: write a ? for each digit that cannot be read, or a lone ? for the whole ${form.name}.`;
  }
  return undefined;
}

/**
 * The unit values of every solution of `reading` on its own; `tooMany` when there are more than
 * 2^freeBits of them, which are then not listed.
 */
function solutions(
  reading: MarkedReading,
  freeBits: number,
): { readonly found: number[][]; readonly tooMany: boolean } {
  return reading.withSpace((space) => {
    if (space === undefined) return { found: [], tooMany: false };
    if (space.basis.length > freeBits) return { found: [], tooMany: true };
    const found: number[][] = [];
    for (let choice = 0; choice < 1 << space.basis.length; choice += 1) {
      found.push(space.valuesAt(space.particular ^ combination(space.basis, BigInt(choice))));
    }
    return { found, tooMany: false };
  });
}

/**
 * `reading` as one share alone is solved: as it is, or, when the checksum leaves more than
 * 2^freeBits solutions and it has candidate units, once for each choice of their values within
 * MAX_CODE_CHOICES (placesWithin, choicesAt).
 */
function triedReadings(reading: MarkedReading, freeBits: number): MarkedReading[] {
  const counts = reading.candidateCounts();
  if (counts.length === 0) return [reading];
  const freeBitsOfReading = reading.withSpace((space) => space?.basis.length);
  if (freeBitsOfReading === undefined || freeBitsOfReading <= freeBits) return [reading];
  // The units with the fewest values first: each gains the most bits for its choices.
  const fewestFirst = [...counts].sort((a, b) => a.count - b.count);
  return reading.choicesAt(placesWithin(fewestFirst, MAX_CODE_CHOICES).map((unit) => unit.place));
}

/**
 * Every share that `value` can be, in any form, with up to MAX_MARKED_ELEMENTS elements marked with
 * ? where they are unreadable; at most 2^freeBits of them. Every candidate passes the ordinary
 * reader, so its checksum and its SSKR metadata are checked as for any share.
 */
export function repairCandidates(
  value: string,
  freeBits: number = LISTED_FREE_BITS,
): ReadRepairableShare[] {
  if (!isMarked(value)) return [unrepairedShare(value)];
  const text = value.trim();
  if (exceedsMarks(text, MAX_MARKED_ELEMENTS))
    throw new Error(`${capitalized(markLimit(MAX_MARKED_ELEMENTS))}, each at its place.`);
  const problem = markProblem(text);
  if (problem !== undefined) throw new Error(capitalized(problem));
  const found = new Map<string, ReadRepairableShare>();
  let tooMany = false;
  for (const model of MarkedReading.of(text).flatMap((reading) =>
    triedReadings(reading, freeBits),
  )) {
    const solved = solutions(model, freeBits);
    tooMany ||= solved.tooMany;
    for (const values of solved.found) {
      const share = model.solvedShare(values);
      if (share !== undefined) found.set(share.ur, share);
    }
  }
  // A solved reading does not make an unresolved affine reading disappear. The cap prevents
  // checking its remaining candidate/metadata filters, so uniqueness cannot be established.
  if (tooMany || found.size === 0)
    throw new Error(
      tooMany
        ? "Too many elements are marked for this form: the checksum cannot tell them. Mark fewer, or use another share."
        : withJoinedMarksHint(
            "No valid share fits the marked elements. Check their places and the other elements.",
            text,
          ),
    );
  return [...found.values()];
}

/** The one share that `value` can be; several are listed as variants (ShareVariantsError). */
export function readRepairableShare(value: string): ReadRepairableShare {
  const candidates = repairCandidates(value);
  if (candidates.length > 1) throw new ShareVariantsError(candidates);
  return candidates[0]!;
}
