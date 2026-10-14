// PNG structure and resource admission shared by image-reading hosts. No decoder, files or zlib:
// the host supplies bounded inflation and decodes only after these checks. Borrowed input must
// remain unchanged until decoding ends; file readers own and wipe that input in one scope.

import { BITS_PER_BYTE, equalBytes } from "./bits.js";
import { MEBIBYTE } from "./byte-units.js";
import { CRC32_BYTES, crc32 } from "../sskr/checksum.js";

export const MAX_PNG_BYTES = 16 * MEBIBYTE;
export const MAX_PNG_DIMENSION = 4096;
export const MEGAPIXEL = MEBIBYTE;
export const MAX_PNG_PIXELS = 16 * MEGAPIXEL;

// PNG signature, chunk framing and IHDR fields: W3C PNG Third Edition, sections 5 and 11.2.1.
const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const CHUNK_LENGTH_BYTES = 4;
const CHUNK_TYPE_BYTES = 4;
const CHUNK_HEADER_BYTES = CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES;
const CHUNK_OVERHEAD_BYTES = CHUNK_HEADER_BYTES + CRC32_BYTES;
const IHDR_BYTES = 13;
const IHDR = 0x49484452;
const IDAT = 0x49444154;
const IEND = 0x49454e44;
const PLTE = 0x504c5445;
const PNG_ANCILLARY_BIT = 0x20000000;
const MAX_PALETTE_BYTES = 256 * 3;
const FILTER_BYTES_PER_ROW = 1;
export const INVALID_PNG_INPUT = "The QR input is not a valid PNG file.";
const HEADER_FIELDS = {
  width: 0,
  height: 4,
  depth: 8,
  color: 9,
  compression: 10,
  filter: 11,
  interlace: 12,
} as const;

/** Color types and permitted sample depths, PNG section 11.2.1. */
const COLOR_LAYOUTS: Readonly<Record<number, { channels: number; depths: readonly number[] }>> = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16] },
  2: { channels: 3, depths: [8, 16] },
  3: { channels: 1, depths: [1, 2, 4, 8] },
  4: { channels: 2, depths: [8, 16] },
  6: { channels: 4, depths: [8, 16] },
};

/** x/y start and step for each Adam7 pass, PNG section 8.1. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function refused(): never {
  throw new Error(INVALID_PNG_INPUT);
}

function assertDimensions(width: number, height: number): void {
  if (width === 0 || height === 0) throw new Error("QR PNG dimensions must be non-zero.");
  if (width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION || width * height > MAX_PNG_PIXELS)
    throw new Error(
      `QR PNG dimensions exceed the ${MAX_PNG_DIMENSION} px / ${MAX_PNG_PIXELS / MEGAPIXEL}-megapixel safety limit.`,
    );
}

function rowBytes(width: number, bitsPerPixel: number): number {
  return FILTER_BYTES_PER_ROW + Math.ceil((width * bitsPerPixel) / BITS_PER_BYTE);
}

function scanlineBytes(width: number, height: number, bits: number, interlaced: boolean): number {
  if (!interlaced) return height * rowBytes(width, bits);
  return ADAM7.reduce((total, [x, y, xStep, yStep]) => {
    const columns = Math.max(0, Math.ceil((width - x) / xStep));
    const rows = Math.max(0, Math.ceil((height - y) / yStep));
    return total + (columns === 0 || rows === 0 ? 0 : rows * rowBytes(columns, bits));
  }, 0);
}

/** A structurally admitted PNG and its exact filtered-byte budget, before any pixel allocation. */
export class PngAdmission {
  readonly #parts: readonly Uint8Array[];
  readonly #filteredBytes: number;

  private constructor(parts: readonly Uint8Array[], filteredBytes: number) {
    this.#parts = parts;
    this.#filteredBytes = filteredBytes;
  }

  /** Detects PNG bytes regardless of their file name or host-supplied media type. */
  static hasSignature(bytes: Uint8Array): boolean {
    return (
      bytes.length >= SIGNATURE.length && equalBytes(bytes.subarray(0, SIGNATURE.length), SIGNATURE)
    );
  }

  /** Validates the whole chunk stream; a second IHDR can never replace admitted dimensions. */
  static read(bytes: Uint8Array): PngAdmission {
    if (bytes.byteLength > MAX_PNG_BYTES)
      throw new Error(`QR PNG input exceeds the ${MAX_PNG_BYTES / MEBIBYTE} MiB safety limit.`);
    if (bytes.length < SIGNATURE.length)
      throw new Error("The QR input is not a complete PNG file.");
    if (!PngAdmission.hasSignature(bytes)) throw new Error("The QR input is not a PNG file.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = SIGNATURE.length;
    let budget: number | undefined;
    let ended = false;
    let palette = false;
    let colorType = 0;
    let dataEnded = false;
    const parts: Uint8Array[] = [];
    while (offset < bytes.length) {
      if (bytes.length - offset < CHUNK_OVERHEAD_BYTES) refused();
      const length = view.getUint32(offset);
      const type = view.getUint32(offset + CHUNK_LENGTH_BYTES);
      const start = offset + CHUNK_HEADER_BYTES;
      const end = start + length;
      if (end + CRC32_BYTES > bytes.length) refused();
      if (crc32(bytes.subarray(offset + CHUNK_LENGTH_BYTES, end)) !== view.getUint32(end))
        refused();
      if (budget === undefined && type !== IHDR) refused();
      if (type === IHDR) {
        if (budget !== undefined || length !== IHDR_BYTES) refused();
        const width = view.getUint32(start + HEADER_FIELDS.width);
        const height = view.getUint32(start + HEADER_FIELDS.height);
        assertDimensions(width, height);
        const depth = bytes[start + HEADER_FIELDS.depth]!;
        colorType = bytes[start + HEADER_FIELDS.color]!;
        const layout = Object.hasOwn(COLOR_LAYOUTS, colorType)
          ? COLOR_LAYOUTS[colorType]
          : undefined;
        if (!layout || !layout.depths.includes(depth)) refused();
        if (
          bytes[start + HEADER_FIELDS.compression] !== 0 ||
          bytes[start + HEADER_FIELDS.filter] !== 0 ||
          bytes[start + HEADER_FIELDS.interlace]! > 1
        )
          refused();
        budget = scanlineBytes(
          width,
          height,
          depth * layout.channels,
          bytes[start + HEADER_FIELDS.interlace] === 1,
        );
      } else if (type === IDAT) {
        if (dataEnded || (colorType === 3 && !palette)) refused();
        parts.push(bytes.subarray(start, end));
      } else {
        if (parts.length > 0) dataEnded = true;
        if (type === PLTE) {
          if (
            palette ||
            dataEnded ||
            length === 0 ||
            length > MAX_PALETTE_BYTES ||
            length % 3 !== 0
          )
            refused();
          palette = true;
        } else if (type === IEND) {
          if (length !== 0 || parts.length === 0 || end + CRC32_BYTES !== bytes.length) refused();
          ended = true;
        } else if ((type & PNG_ANCILLARY_BIT) === 0) refused();
      }
      offset = end + CRC32_BYTES;
    }
    if (!ended || budget === undefined) refused();
    return new PngAdmission(parts, budget);
  }

  get filteredBytes(): number {
    return this.#filteredBytes;
  }

  /** An owned compressed-data copy: the host wipes it after bounded inflation. */
  compressedData(): Uint8Array {
    const bytes = new Uint8Array(this.#parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of this.#parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }

  /** Rejects both truncated scanlines and surplus expansion, including Adam7's empty passes. */
  assertInflatedSize(length: number): void {
    if (length !== this.#filteredBytes) refused();
  }
}
