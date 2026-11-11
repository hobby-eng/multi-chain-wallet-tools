// Synthetic PNG files for the unit tests and the browser cases alike (synthetic-png.d.mts gives
// the tests its types): pictures for MnemoCode's cross-stitch patterns, and QR codes written by
// another encoder than MnemoCode's, uqr. Public test data only.
import { deflateSync } from "node:zlib";
import { encode } from "uqr";

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * An 8-bit RGB PNG file of `width` by `height` pixels whose image data is `imageData` as given,
 * its chunks framed with their lengths and CRCs, in bytes of its own. Data that is no zlib stream
 * makes a file that PNG admission takes and no decoder reads.
 */
export function framedPng(width, height, imageData) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  // A copy outside Node's shared pool, so that its buffer holds this file alone.
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", Buffer.from(imageData)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** An RGB PNG file of `width` by `height` pixels, each coloured by `pixel`, in bytes of its own. */
export function syntheticPng(width, height, pixel) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) rows.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  return framedPng(width, height, deflateSync(rows));
}

/** Smooth shades across the picture, which hold a phrase in their legend. */
export function smoothPicture(width = 400, height = 300) {
  return syntheticPng(width, height, (x, y) => [
    Math.round((255 * x) / width),
    Math.round(128 + 127 * Math.sin(y / 17 + x / 29)),
    Math.round((255 * y) / height),
  ]);
}

/** One flat colour, which no legend can hold a phrase in. */
export function flatPicture(width = 400, height = 300) {
  return syntheticPng(width, height, () => [90, 120, 150]);
}

/**
 * A PNG file of `width` by `height` white pixels with the QR code of `payload` (text, or bytes as
 * an array of numbers) as uqr writes it, numeric mode for digits, at its centre, `scale` pixels a
 * module.
 */
export function syntheticQrPng(payload, width, height, scale) {
  const matrix = encode(payload, { ecc: "L", border: 4 }).data;
  const left = Math.floor((width - matrix.length * scale) / 2);
  const top = Math.floor((height - matrix.length * scale) / 2);
  return syntheticPng(width, height, (x, y) =>
    matrix[Math.floor((y - top) / scale)]?.[Math.floor((x - left) / scale)] === true
      ? BLACK
      : WHITE,
  );
}
