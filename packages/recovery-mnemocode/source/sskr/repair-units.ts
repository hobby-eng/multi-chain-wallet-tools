// The units and the layouts of a share as its repair reads them (repair.ts): the digits of each
// form, the marks of an element that cannot be read, and every structure of the bytes of a share
// that a count of units allows (its CBOR layouts and, for the mixed forms, their header and
// length), each affine over GF(2) in the unit values.

import { UNICODE_CODE_DIGITS } from "../core/code-text.js";
import {
  byteStringHeads,
  MEMBER_BYTE,
  NIBBLE_BITS,
  SHARE_LENGTHS,
  SSKR_CBOR_TAGS,
  tagBytes,
  payloadLayouts,
} from "./share-layout.js";
import { checksumAt, crc32 } from "./checksum.js";
import { BitFields } from "./gf2.js";
import { CHECKSUM_BYTES, MAX_TRANSPORT_BYTES, type ShareFormat } from "./transport.js";
import {
  fillingFields,
  headerFields,
  SHARE_HEADER_BYTES,
  unmixedBody,
  type MixedForm,
  type ZeroField,
} from "./mixed-layout.js";
import { SHARE_UNITS } from "./share-units.js";
import { RGB_HEX_DIGITS } from "../core/colors.js";
import { BITS_PER_BYTE } from "../core/bits.js";
import { defined } from "../core/defined.js";

/** Hexadecimal digits of a color, #RRGGBB. */
export const COLOR_DIGITS = RGB_HEX_DIGITS;
/** Hexadecimal digits of a Unicode code of a word. */
export const CODE_DIGITS = UNICODE_CODE_DIGITS;

/** The bits of one hexadecimal digit. */
export const HEX_DIGIT_BITS = 4;

/** A whole Unicode code, alone. */
export const WHOLE_CODE = new RegExp(`^[0-9A-F]{${CODE_DIGITS}}$`, "u");

/** The code points of Color Unicode text, each as its hexadecimal digits. */
export const CODE_POINT_TEXT = new RegExp(`.{${CODE_DIGITS}}`, "gu");

/** A pair of letters of a UR as written, in lower case. */
const UR_PAIR = /[a-z]{2}/;

/** The longest text of one share that a repair reads (exceedsMarks). */
export const MAX_REPAIR_TEXT_LENGTH = 2048;

/** The most units of a share: each holds at least one byte of the transport. */
export const MAX_REPAIR_UNITS = MAX_TRANSPORT_BYTES;

const CRC_BITS = CHECKSUM_BYTES * BITS_PER_BYTE;

/** Whether `text`, a whole share as written, marks an element that could not be read with ?. */
export function isMarked(text: string): boolean {
  return text.includes("?");
}

/** The codes of the errors of a share's repair: several shares fit, the marks fit too many ways. */
export type ShareRepairErrorCode = "share-variants" | "ambiguous-marks";

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
export interface ReadingUnits {
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
  /** Whether complete decoy cards follow these units, as a prefix of the text (addUnitModel). */
  readonly decoys?: boolean;
}

/** The units of a share in one form, with every structure that their count allows. */
export interface UnitModel extends ReadingUnits {
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
  const headerBytes = defined(
    byteStringHeads(payloadLength).find((head) => head.length === header),
  );
  return [
    ...tagBytes.map((byte, index) => [defined(cbor[index]) ^ byte, BITS_PER_BYTE] as const),
    ...headerBytes.map(
      (byte, index) => [defined(cbor[tag + index]) ^ byte, BITS_PER_BYTE] as const,
    ),
    // The reserved high nibble of the member's byte (sskr encoding.rs).
    [defined(cbor[tag + header + MEMBER_BYTE]) >>> NIBBLE_BITS, BITS_PER_BYTE - NIBBLE_BITS],
  ];
}

function payloadOf(cbor: ArrayLike<number>, layout: CborLayout): Uint8Array {
  return Uint8Array.from({ length: layout.payloadLength }, (_, index) =>
    defined(cbor[layout.tagBytes.length + layout.header + index]),
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
export function mixedUnitCounts(form: MixedForm): ReadonlySet<number> {
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
export function structuresOf(format: ShareFormat, units: number): ShareStructure[] {
  const { mixed } = SHARE_UNITS[format];
  return mixed === undefined ? standardStructures(units) : mixedStructures(mixed, units);
}

/** `units`, or undefined when there are more of them than any repairable share has. */
export function withinRepair(units: string[] | undefined): string[] | undefined {
  return units !== undefined && units.length <= MAX_REPAIR_UNITS ? units : undefined;
}

/** The pairs of letters of a UR as written, with ? for an unreadable pair, or undefined. */
export function urPairs(body: string): string[] | undefined {
  const units = body.match(new RegExp(`${UR_PAIR.source}|\\?`, "giu"));
  return withinRepair(units !== null && units.join("") === body ? units : undefined);
}
