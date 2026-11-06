// Synthetic pictures for MnemoCode's cross-stitch patterns: PNG files of smooth shades, which
// hold a phrase as a photograph does, and of one flat colour, which cannot hold one.
import { deflateSync } from "node:zlib";
import { crc32 } from "./mncl-list.js";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGB PNG file of `width` by `height` pixels, each coloured by `pixel`. */
export function syntheticPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number],
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) rows.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array()),
  ];
  const file = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

/** Smooth shades across the picture, which hold a phrase in their legend. */
export function smoothPicture(width = 400, height = 300): Uint8Array {
  return syntheticPng(width, height, (x, y) => [
    Math.round((255 * x) / width),
    Math.round(128 + 127 * Math.sin(y / 17 + x / 29)),
    Math.round((255 * y) / height),
  ]);
}

/** One flat colour, which no legend can hold a phrase in. */
export function flatPicture(width = 400, height = 300): Uint8Array {
  return syntheticPng(width, height, () => [90, 120, 150]);
}
