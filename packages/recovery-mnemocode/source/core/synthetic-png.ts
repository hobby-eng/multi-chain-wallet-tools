// Synthetic PNG images for the checks of PNG admission (png-admission.ts): the startup self-test
// and the unit tests build theirs here, so that one builder frames them all. Each chunk carries
// its real CRC-32, so that a damaged structure reaches the rule under test. The bytes follow the
// W3C PNG specification, Third Edition (sections 5.2 and 5.3: the signature and the layout of a
// chunk; 7.1: integers; 11.2.1: IHDR). They are written out here, not taken from png-admission.ts,
// so that the checks of the reader do not build their input from the reader's own constants.
// Public synthetic bytes only.
//
// Host-neutral: it imports only sskr/checksum.ts.

import { crc32 } from "../sskr/checksum.js";

/** The eight bytes that begin every PNG datastream (PNG section 5.2). */
export const PNG_SIGNATURE: readonly number[] = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

/** `value` as a PNG four-byte unsigned integer: its bytes, most significant first (section 7.1). */
export function pngUint32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** One chunk: its length, its four-letter `type`, `data` and the CRC-32 of both (section 5.3). */
export function pngChunk(type: string, data: ArrayLike<number>): Uint8Array {
  const body = Array.from(type, (letter) => letter.charCodeAt(0)).concat(Array.from(data));
  const checksum = crc32(Uint8Array.from(body));
  return Uint8Array.from([...pngUint32(data.length), ...body, ...pngUint32(checksum)]);
}

/**
 * The IHDR chunk of a `width` × `height` image of `depth` bits per sample and `color` type, with
 * `interlace` 0 for none or 1 for Adam7 (section 11.2.1).
 */
export function pngHeader(
  width: number,
  height: number,
  depth: number,
  color: number,
  interlace = 0,
): Uint8Array {
  return pngChunk("IHDR", [
    ...pngUint32(width),
    ...pngUint32(height),
    depth,
    color,
    // Compression and filter method 0, the only ones that the specification defines.
    0,
    0,
    interlace,
  ]);
}

/** A PNG datastream: the signature, `chunks` in turn, and IEND. */
export function pngImage(...chunks: readonly ArrayLike<number>[]): Uint8Array {
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...chunks.flatMap((part) => Array.from(part)),
    ...pngChunk("IEND", []),
  ]);
}
