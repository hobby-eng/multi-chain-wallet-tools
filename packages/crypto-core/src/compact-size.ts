// Bitcoin's CompactSize, the variable-length unsigned integer of its serialization (Bitcoin Core
// src/serialize.h WriteCompactSize and ReadCompactSize): one byte below 0xFD; otherwise the marker
// 0xFD, 0xFE or 0xFF followed by 2, 4 or 8 little-endian bytes. Bitcoin's signed messages write
// their lengths with it, and ZIP-316's unified encodings their typecodes and lengths. Reading
// refuses a value written longer than it needs, as Bitcoin Core and zcash_encoding do, so that a
// value has one encoding.

/** Each longer form: its first byte, the bytes of the value after it, and its least value. */
const LONGER_FORMS = [
  { marker: 0xfd, bytes: 2, least: 0xfdn },
  { marker: 0xfe, bytes: 4, least: 0x1_0000n },
  { marker: 0xff, bytes: 8, least: 0x1_0000_0000n },
] as const;

/**
 * The CompactSize of `value`, a non-negative safe integer, in its shortest form. Refuses
 * (RangeError) any other number.
 */
export function encodeCompactSize(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("A CompactSize holds a non-negative safe integer.");
  if (value < 0xfd) return Uint8Array.of(value);
  const [two, four, eight] = LONGER_FORMS;
  const form = value < four.least ? two : value < eight.least ? four : eight;
  const out = new Uint8Array(1 + form.bytes);
  out[0] = form.marker;
  let rest = BigInt(value);
  for (let at = 1; at < out.length; at += 1) {
    out[at] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** A CompactSize read from bytes: its value and the offset just past it. */
export interface CompactSizeRead {
  readonly value: bigint;
  readonly end: number;
}

/**
 * The CompactSize that starts at `offset` of `bytes`, or undefined when the bytes end before it
 * does or it is not in its shortest form.
 */
export function readCompactSize(bytes: Uint8Array, offset: number): CompactSizeRead | undefined {
  const first = bytes[offset];
  if (first === undefined) return undefined;
  const form = LONGER_FORMS.find(({ marker }) => marker === first);
  if (form === undefined) return { value: BigInt(first), end: offset + 1 };
  const end = offset + 1 + form.bytes;
  if (end > bytes.length) return undefined;
  let value = 0n;
  for (let at = end - 1; at > offset; at -= 1) value = (value << 8n) | BigInt(bytes[at] ?? 0);
  return value < form.least ? undefined : { value, end };
}
