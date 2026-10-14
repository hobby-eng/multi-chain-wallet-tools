import { BITS_PER_BYTE } from "../core/bip39-sizes.js";
import { defined } from "../core/defined.js";

const CRC32_INITIAL = 0xffffffff;
const CRC32_REFLECTED_POLYNOMIAL = 0xedb88320;

/** The bytes of a CRC-32, as transports and lists store it (big-endian). */
export const CRC32_BYTES = 4;

/** Bytewords transport checksum; error detection, not authentication. */
export function crc32(bytes: Uint8Array): number {
  let crc = CRC32_INITIAL;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const polynomial = crc & 1 ? CRC32_REFLECTED_POLYNOMIAL : 0;
      crc = (crc >>> 1) ^ polynomial;
    }
  }
  return (crc ^ CRC32_INITIAL) >>> 0;
}

/**
 * The CRC-32 stored big-endian at `at` in `bytes`: how every form of a share keeps its checksum.
 * The reader of shares checks it, and the repair of marked ones solves for it, through this read.
 */
export function checksumAt(bytes: ArrayLike<number>, at: number): number {
  let value = 0;
  for (let index = 0; index < CRC32_BYTES; index += 1)
    value = value * 2 ** BITS_PER_BYTE + defined(bytes[at + index]);
  return value;
}

/** Public, reversible mixing used by the color and word share layouts; not encryption. */
export function shareMask(checksum: Uint8Array, index: number): number {
  return crc32(Uint8Array.of(...checksum, index >>> 8, index & 0xff)) & 0xff;
}
