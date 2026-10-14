// How a share is laid out in MnemoCode's own forms, colors and words (word numbers and Unicode
// codes): its checksum, then a version, the length of its CBOR and the CBOR, mixed so that shares
// do not all open alike (mixShare), packed into units of the form, 24-bit colors or 11-bit word
// indexes, the last unit filled with zero bits. The reader of shares (transport.ts) and the repair
// of marked ones (repair.ts) take every fact of the layout from here: the version and the number of
// units of each form, how its units are packed into bytes, and which bits must be zero. The reader
// requires them to be zero; the repair solves for them, which it can because each is affine in the
// bits of the units.
//
// Needs from the host: nothing.

import { BIP39_DICTIONARY_SIZE, BIP39_INDEX_BITS, BITS_PER_BYTE } from "../core/bip39-sizes.js";
import { CRC32_BYTES, shareMask } from "./checksum.js";
import { defined } from "../core/defined.js";

/** The version byte and the length of the CBOR, before the CBOR of a share in colors or words. */
export const SHARE_HEADER_BYTES = 2;
/** The bytes of one color, #RRGGBB, red first. */
export const RGB_BYTES = 3;
/** The version byte of shares written in colors, MnemoCode's own form. */
export const COLOR_VERSION = 0xa1;
/** Shares written as BIP39 word numbers or Unicode codes: MnemoCode's own form, like colors. */
export const WORD_VERSION = 0xa2;
/** The largest value of one byte. */
const BYTE_MASK = 2 ** BITS_PER_BYTE - 1;

/** Bits that a well-formed share holds as zero: their value, and how many bits they are. */
export type ZeroField = readonly [value: number, bits: number];

/** Bytes packed from the units of a share, and the bits left over after the last whole byte. */
export interface PackedUnits {
  readonly bytes: readonly number[];
  readonly leftover: ZeroField;
}

/**
 * One mixed form: its version byte, its units and how they are packed. Each form owns these facts
 * so that the reader and the repair of a share in it never write them again.
 */
export interface MixedForm {
  readonly version: number;
  /** The bits of one unit. */
  readonly unitBits: number;
  /** The units that a share of `shareBytes` bytes takes, its checksum and header included. */
  readonly unitCount: (shareBytes: number) => number;
  /** The bytes that `values`, its units, hold, the first unit first. */
  readonly pack: (values: readonly number[]) => PackedUnits;
  /** The units that hold `bytes`, the last one filled with zero bits. */
  readonly unpack: (bytes: readonly number[]) => number[];
  /** Why text that reads as units of this form holds no share. */
  readonly refusal: string;
}

/** BIP39 word indexes from bytes, 11 bits each, the last one filled with zero bits. */
function bytesToWordIndexes(bytes: readonly number[]): number[] {
  const indexes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << BITS_PER_BYTE) | byte;
    bits += BITS_PER_BYTE;
    while (bits >= BIP39_INDEX_BITS) {
      bits -= BIP39_INDEX_BITS;
      indexes.push((buffer >>> bits) & (BIP39_DICTIONARY_SIZE - 1));
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) indexes.push((buffer << (BIP39_INDEX_BITS - bits)) & (BIP39_DICTIONARY_SIZE - 1));
  return indexes;
}

/**
 * Bytes from 11-bit word indexes, the first bit highest, and the bits left over after the last
 * whole byte: their value, which a share's zero filling makes 0, and how many they are. The
 * reader of shares and the repair of marked ones both pack words through it.
 */
export function wordIndexesToBytes(indexes: readonly number[]): {
  readonly bytes: number[];
  readonly leftover: number;
  readonly leftoverBits: number;
} {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const index of indexes) {
    buffer = (buffer << BIP39_INDEX_BITS) | index;
    bits += BIP39_INDEX_BITS;
    while (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((buffer >>> bits) & BYTE_MASK);
    }
    buffer &= (1 << bits) - 1;
  }
  return { bytes, leftover: buffer, leftoverBits: bits };
}

/** The bytes of one color, red first. */
function colorBytes(color: number): number[] {
  return Array.from(
    { length: RGB_BYTES },
    (_, index) => (color >>> (BITS_PER_BYTE * (RGB_BYTES - 1 - index))) & BYTE_MASK,
  );
}

/** The colors of `bytes`, three bytes each, red first, the last filled with zero bytes. */
function bytesToColors(bytes: readonly number[]): number[] {
  const colors: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += RGB_BYTES) {
    const color = Array.from({ length: RGB_BYTES }, (_, index) => bytes[offset + index] ?? 0);
    colors.push(color.reduce((value, byte) => value * 2 ** BITS_PER_BYTE + byte, 0));
  }
  return colors;
}

/** Shares in colors: version A1, three bytes per color, filled with zero bytes to a whole color. */
export const COLOR_FORM: MixedForm = Object.freeze({
  version: COLOR_VERSION,
  unitBits: RGB_BYTES * BITS_PER_BYTE,
  unitCount: (shareBytes: number) => Math.ceil(shareBytes / RGB_BYTES),
  // Whole bytes: nothing is left over.
  pack: (values: readonly number[]) => ({
    bytes: values.flatMap(colorBytes),
    leftover: [0, 0] as const,
  }),
  unpack: bytesToColors,
  refusal: "Unsupported or truncated SSKR color record.",
});

/**
 * Shares in word numbers or Unicode codes: version A2, 11 bits per word, the last word filled
 * with zero bits. Word numbers and Unicode codes write these indexes as the encoded seed phrase
 * writes its own, so that a share looks like the form chosen for it.
 */
export const WORD_FORM: MixedForm = Object.freeze({
  version: WORD_VERSION,
  unitBits: BIP39_INDEX_BITS,
  unitCount: (shareBytes: number) => Math.ceil((shareBytes * BITS_PER_BYTE) / BIP39_INDEX_BITS),
  pack: (values: readonly number[]) => {
    const { bytes, leftover, leftoverBits } = wordIndexesToBytes(values);
    return { bytes, leftover: [leftover, leftoverBits] as const };
  },
  unpack: bytesToWordIndexes,
  refusal: "Unsupported or truncated SSKR share in word numbers or Unicode codes.",
});

/**
 * The checksum, then the version, CBOR length and CBOR, mixed to remove the constant prefix.
 * First codes can still coincide; anyone can undo this mixing and recognize the format.
 */
export function mixShare(transport: Uint8Array, version: number): number[] {
  const checksum = transport.subarray(-CRC32_BYTES);
  const cbor = transport.subarray(0, -CRC32_BYTES);
  const body = [version, cbor.length, ...cbor];
  return [...checksum, ...body.map((byte, index) => byte ^ shareMask(checksum, index))];
}

/**
 * The first `length` bytes after the checksum of mixed `bytes`, unmixed whatever they hold: the
 * version, the CBOR length, the CBOR, then any filling. Never refused, so that the repair can take
 * it as a function of the units, affine for each checksum.
 */
export function unmixedBody(bytes: readonly number[], length: number): number[] {
  const checksum = Uint8Array.from(bytes.slice(0, CRC32_BYTES));
  return Array.from(
    { length },
    (_, index) => defined(bytes[CRC32_BYTES + index]) ^ shareMask(checksum, index),
  );
}

/** The header of an unmixed body that must hold `version` and `cborLength`: zero when it does. */
export function headerFields(
  body: readonly number[],
  version: number,
  cborLength: number,
): ZeroField[] {
  return [
    [defined(body[0]) ^ version, BITS_PER_BYTE],
    [defined(body[1]) ^ cborLength, BITS_PER_BYTE],
  ];
}

/**
 * What follows a share of `end` bytes in its units, which must be zero: the filling, then the bits
 * left over.
 */
export function fillingFields(packed: PackedUnits, end: number): ZeroField[] {
  return [
    ...packed.bytes.slice(end).map((byte): ZeroField => [byte, BITS_PER_BYTE]),
    packed.leftover,
  ];
}

/**
 * How many of `values`, the units of `form`, the share that they start with takes, by the length
 * of its CBOR that its header gives; undefined where they are too few to hold a header. Units after
 * them are no part of it, such as the decoys after a share's codes on its cards (owner,
 * 2026-10-13); the checksum then tells whether the units before them are a share at all.
 */
export function ownUnitCount(form: MixedForm, values: readonly number[]): number | undefined {
  const { bytes } = form.pack(values);
  if (bytes.length < CRC32_BYTES + SHARE_HEADER_BYTES) return undefined;
  const cborLength = defined(unmixedBody(bytes, SHARE_HEADER_BYTES)[1]);
  return form.unitCount(CRC32_BYTES + SHARE_HEADER_BYTES + cborLength);
}

/**
 * The transport bytes, CBOR then checksum, of the share that `units` units of `form`, packed as
 * `packed`, hold; undefined when they hold none: the body must open with the form's version and a
 * CBOR length that the units hold exactly, and leave zero bits after the share. The checksum and
 * the CBOR are checked by the reader of transports.
 */
export function mixedTransport(
  form: MixedForm,
  packed: PackedUnits,
  units: number,
): Uint8Array | undefined {
  const { bytes } = packed;
  if (bytes.length < CRC32_BYTES) return undefined;
  const body = unmixedBody(bytes, bytes.length - CRC32_BYTES);
  const cborLength = body[1] ?? 0;
  const bodyEnd = SHARE_HEADER_BYTES + cborLength;
  if (cborLength < 1 || body.length < bodyEnd) return undefined;
  const end = CRC32_BYTES + bodyEnd;
  if (form.unitCount(end) !== units) return undefined;
  const fields = [...headerFields(body, form.version, cborLength), ...fillingFields(packed, end)];
  if (fields.some(([value]) => value !== 0)) return undefined;
  return Uint8Array.from([
    ...body.slice(SHARE_HEADER_BYTES, bodyEnd),
    ...bytes.slice(0, CRC32_BYTES),
  ]);
}
