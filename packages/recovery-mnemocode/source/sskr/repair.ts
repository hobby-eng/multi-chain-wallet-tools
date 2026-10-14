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
// mixed-layout.ts, as the reader of shares reads them (transport.ts). The structures of a share's
// bytes are repair-units.ts, and the ways to read a marked share as units of a form, which a
// MarkedReading solves, repair-models.ts.

import { apartHexUnits, codeTokens, withJoinedMarksHint, wholeMark } from "../core/code-text.js";
import { SHARE_METADATA_BYTES } from "./share-layout.js";
import { BitFields, combination, linearize, solve, unitVectors } from "./gf2.js";
import { readShare, type ShareFormat } from "./transport.js";
import { SHARE_UNITS } from "./share-units.js";
import { xorInto } from "../core/bits.js";
import { capitalized } from "../core/prose.js";
import { defined } from "../core/defined.js";
import {
  isMarked,
  MAX_REPAIR_TEXT_LENGTH,
  type ReadBits,
  type ReadingUnits,
  type ShareRepairErrorCode,
  type ShareStructure,
} from "./repair-units.js";
import { CODE_FORMS, type CodeForm, DIGIT_MARKED_WIDTHS, unitModels } from "./repair-models.js";
import { ErrorCatalog, suppliedMessage } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.repair", {
  "each-at-place": (value0: string) => `${value0}, each at its place.`,
  "repair-candidates-refused": suppliedMessage,
  "shares-readings-refused": suppliedMessage,
});

/** More marked elements than this leave too few checksum bits to find them. */
export const MAX_MARKED_ELEMENTS = 6;

/**
 * Readings that one share alone is tried in, one for each choice of words for its partly read
 * Unicode codes (MarkedReading.choicesAt), when the checksum alone leaves too many solutions.
 */
export const MAX_CODE_CHOICES = 256;

/**
 * Up to 2^4 solutions of one share are listed as variants. Restoring with other shares may try up
 * to 2^8 of them, since the SSKR library then keeps only the one whose secret digest fits.
 */
export const LISTED_FREE_BITS = 4;

/** An element filled in by a repair: its place, counted from 1, and what it is. */
export interface FilledElement {
  readonly position: number;
  readonly value: string;
}

/**
 * A share as a repair reads it: its UR, its form, whether marked elements were filled in, and
 * which.
 */
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

/**
 * Thrown when several shares fit the marked elements. The message names only their places: an
 * error may be shown where the screen is not private. The values are in `variants`, for the
 * caller to show where it shows secrets.
 */
export class ShareVariantsError extends Error {
  readonly code: ShareRepairErrorCode = "share-variants";

  constructor(readonly variants: readonly ReadRepairableShare[]) {
    const places = defined(variants[0])
      .filled.map((element) => element.position)
      .join(", ");
    super(
      `${variants.length} shares fit the marked elements ${places}. Use another copy of this share, or another share.`,
    );
  }
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

  /** Whether the reading takes decoy cards after a prefix of the text (addUnitModel). */
  get withDecoys(): boolean {
    return this.#units.decoys === true;
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
        flipped[place] = defined(values[place]) ^ (1 << bit);
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
    return defined(everyPick(tried.map((place) => defined(defined(candidates)[place])))).map(
      (values) =>
        this.withValues(new Map(tried.map((place, index) => [place, defined(values[index])]))),
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
      value: units.unitText(defined(values[index])),
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
            bitsRead === undefined ? 0 : (defined(values[hole]) ^ bitsRead.value) & bitsRead.mask;
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

  [Symbol.dispose](): void {
    this.wipe();
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
    throw ERRORS.create("each-at-place", [`${capitalized(markLimit(MAX_MARKED_ELEMENTS))}`]);
  const problem = markProblem(text);
  if (problem !== undefined)
    throw ERRORS.create("repair-candidates-refused", [capitalized(problem)]);
  const outcomes = MarkedReading.of(text)
    .flatMap((reading) => triedReadings(reading, freeBits))
    .map((model) => {
      const solved = solutions(model, freeBits);
      return {
        withDecoys: model.withDecoys,
        tooMany: solved.tooMany,
        shares: solved.found.flatMap((values) => model.solvedShare(values) ?? []),
      };
    });
  return sharesOfReadings(outcomes, text);
}

/** What one reading of a marked share gave (repairCandidates). */
export interface ReadingOutcome {
  /** Whether the reading takes decoy cards after a prefix of the text. */
  readonly withDecoys: boolean;
  /** Whether its search stopped at the cap, with filters left that it could not apply. */
  readonly tooMany: boolean;
  /** The shares it solved. */
  readonly shares: readonly ReadRepairableShare[];
}

/**
 * The shares that the readings of the marked share `text` gave, each once, by their outcomes. A
 * capped reading of the whole text keeps uniqueness from being established, since the cap stops
 * its remaining filters: it refuses with "Too many elements" whatever the others solved. One that
 * takes decoy cards after a prefix is only one hypothesis more and leaves a solved reading
 * standing (AUD-022-FUN001). Without a share, the refusal says why.
 */
export function sharesOfReadings(
  outcomes: readonly ReadingOutcome[],
  text: string,
): ReadRepairableShare[] {
  const found = new Map<string, ReadRepairableShare>();
  let tooMany = false;
  let cappedDecoys = false;
  for (const outcome of outcomes) {
    if (outcome.withDecoys) cappedDecoys ||= outcome.tooMany;
    else tooMany ||= outcome.tooMany;
    for (const share of outcome.shares) found.set(share.ur, share);
  }
  if (tooMany || found.size === 0)
    throw ERRORS.create("shares-readings-refused", [
      tooMany || cappedDecoys
        ? "Too many elements are marked for this form: the checksum cannot tell them. Mark fewer, or use another share."
        : withJoinedMarksHint(
            "No valid share fits the marked elements. Check their places and the other elements.",
            text,
          ),
    ]);
  return [...found.values()];
}

/** The one share that `value` can be; several are listed as variants (ShareVariantsError). */
export function readRepairableShare(value: string): ReadRepairableShare {
  const candidates = repairCandidates(value);
  if (candidates.length > 1) throw new ShareVariantsError(candidates);
  return defined(candidates[0]);
}
