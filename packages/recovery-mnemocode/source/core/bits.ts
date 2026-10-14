/** Bit order is most significant bit first, matching BIP39 entropy serialization. */

import { BIP39_INDEX_BITS, BITS_PER_BYTE, checksumBits } from "./bip39-sizes.js";
import { textPieces } from "./pieces.js";

// Defined in bip39-sizes.ts, which this module imports and which may not import it back.
export { BITS_PER_BYTE };

/**
 * Whether `left` and `right` hold the same bytes. Every byte is read, without stopping at the first
 * difference, so that the time does not tell where secret bytes differ; JavaScript promises no
 * constant time beyond that. A prefix or a part is compared through a subarray of it.
 */
export function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left[index]! ^ right[index]!;
  return different === 0;
}

/** `value` as `width` bits, most significant first. */
export function bitsOf(value: number, width: number): string {
  return value.toString(2).padStart(width, "0");
}

/** BIP39 indexes as their 11 bits each, in order: the bits of a phrase, checksum included. */
export function bitsOfIndexes(indexes: readonly number[]): string {
  return indexes.map((index) => bitsOf(index, BIP39_INDEX_BITS)).join("");
}

/**
 * The checksum bits at the end of `lastIndex`, the last word of a phrase of `wordCount` words, as
 * candidate tables show them.
 */
export function lastWordChecksumBits(lastIndex: number, wordCount: number): string {
  return bitsOf(lastIndex, BIP39_INDEX_BITS).slice(-checksumBits(wordCount));
}

/** Wipes every array of `arrays`: copies of secrets that their owner is done with. */
export function wipeAll(arrays: Iterable<Uint8Array>): void {
  for (const array of arrays) array.fill(0);
}

/**
 * What `use` makes of `bytes`, which are wiped afterwards, whatever happens: for bytes that hold a
 * secret only for a moment, such as a share read to be written again (AUD-015-SEC001).
 */
export function wipedAfter<T>(bytes: Uint8Array, use: (bytes: Uint8Array) => T): T {
  try {
    return use(bytes);
  } finally {
    bytes.fill(0);
  }
}

/**
 * wipedAfter for a `use` that finishes later, such as saving a file: the bytes are wiped once it
 * has settled, saved or refused, never while it may still read them.
 */
export async function wipedAfterAsync<T>(
  bytes: Uint8Array,
  use: (bytes: Uint8Array) => Promise<T>,
): Promise<T> {
  try {
    return await use(bytes);
  } finally {
    bytes.fill(0);
  }
}

export function modulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

export function bytesToBits(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(BITS_PER_BYTE, "0")).join("");
}

export function bitsToBytes(bits: string): Uint8Array {
  if (bits.length % BITS_PER_BYTE !== 0 || !/^[01]+$/u.test(bits))
    throw new Error("Entropy must contain a whole number of bytes.");
  return Uint8Array.from(textPieces(bits, BITS_PER_BYTE, (byte) => Number.parseInt(byte, 2)));
}

/**
 * Bytes as lower-case hexadecimal text, two digits each: what every check and every printed key
 * writes bytes as (AUD-012-ARC004).
 */
export function hexOfBytes(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(HEX_DIGITS_PER_BYTE, "0")).join("");
}

/** The hexadecimal digits of one byte. */
export const HEX_DIGITS_PER_BYTE = 2;

/**
 * The bytes of hexadecimal text, two digits each, in either case: the inverse of hexOfBytes.
 * Refuses text of an odd length or with another character; what the bytes mean, a key or a
 * color, its caller checks.
 */
export function bytesOfHex(text: string): Uint8Array {
  if (text.length % HEX_DIGITS_PER_BYTE !== 0 || !/^[0-9a-f]*$/iu.test(text))
    throw new Error("Hexadecimal text has two digits, 0-9 or a-f, for each byte.");
  return Uint8Array.from(
    textPieces(text, HEX_DIGITS_PER_BYTE, (byte) => Number.parseInt(byte, 16)),
  );
}

/**
 * Adds `delta` to `target` in place, byte by byte, so that no new array holds the bytes: a change
 * to a share's payload, or to a secret and its digest. The caller owns both and wipes them.
 */
export function xorInto(target: Uint8Array, delta: ArrayLike<number>): void {
  for (let index = 0; index < target.length; index += 1) target[index]! ^= delta[index]!;
}
