import { encode } from "uqr";

/** Public test QR pixels; no native image parser is simulated by this encoder. */
export class QrRaster {
  static of(payload: string | readonly number[]) {
    const matrix = encode(payload, { ecc: "L", border: 4 }).data;
    const scale = 5;
    const width = matrix.length * scale;
    const data = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dark = matrix[Math.floor(y / scale)]![Math.floor(x / scale)]!;
        const offset = (y * width + x) * 4;
        const value = dark ? 0 : 255;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
    return { width, height: width, data };
  }
}
