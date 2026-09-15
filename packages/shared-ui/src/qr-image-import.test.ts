import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';
import { decodeQrPixels } from './qr-image-import.js';

function rasterize(payload: string | readonly number[]) {
  const matrix = encode(payload, { ecc: 'L', border: 4 }).data;
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

describe('offline QR image decoder', () => {
  it('decodes a textual recovery share', () => {
    const payload = 'academic acid acrobat romp romp boring voting';
    expect(decodeQrPixels(rasterize(payload)).text).toBe(payload);
  });

  it('preserves CompactSeedQR bytes containing NUL and line-break values', () => {
    const payload = Array.from(Buffer.from('0e59dde276009317f1275f1389888078c99368d1e82489b5f629531fc5b6a56e', 'hex'));
    expect(Array.from(decodeQrPixels(rasterize(payload)).binaryData ?? [])).toEqual(payload);
  });
});
