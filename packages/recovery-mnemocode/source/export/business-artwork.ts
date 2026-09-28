import {
  createRasterImage,
  readRenderAsset,
  renderPlatform,
  type RasterImage,
} from './platform.js';
import { hueOrigins, type PhysicalBusinessStyle } from './business-designs.js';
import { hsv } from './color-math.js';

// Cache decoded/resampled bundled images only, never a caller's recolored references.
const sources = new Map<PhysicalBusinessStyle, Promise<RasterImage>>();

async function source(style: PhysicalBusinessStyle): Promise<RasterImage> {
  let cached = sources.get(style);
  if (!cached) {
    cached = readRenderAsset(`images/business-${style}-v1.png`)
      .then((data) => {
        const original = renderPlatform().decodePng(data);
        // 254 dpi at 90 x 50 mm; smooth sampling preserves the approved photo detail.
        const out = createRasterImage(900, 500);
        // Pixel-center bilinear sampling; retain this arithmetic order for identical output.
        for (let y = 0; y < out.height; y++)
          for (let x = 0; x < out.width; x++) {
            const sx = ((x + 0.5) * original.width) / out.width - 0.5;
            const sy = ((y + 0.5) * original.height) / out.height - 0.5;
            const x0 = Math.max(0, Math.floor(sx));
            const y0 = Math.max(0, Math.floor(sy));
            const x1 = Math.min(original.width - 1, x0 + 1);
            const y1 = Math.min(original.height - 1, y0 + 1);
            const dx = sx - x0;
            const dy = sy - y0;
            for (let c = 0; c < 4; c++)
              out.data[(y * out.width + x) * 4 + c] = Math.round(
                original.data[(y0 * original.width + x0) * 4 + c]! * (1 - dx) * (1 - dy) +
                  original.data[(y0 * original.width + x1) * 4 + c]! * dx * (1 - dy) +
                  original.data[(y1 * original.width + x0) * 4 + c]! * (1 - dx) * dy +
                  original.data[(y1 * original.width + x1) * 4 + c]! * dx * dy,
              );
          }
        return out;
      })
      .catch((error: unknown) => {
        sources.delete(style);
        throw new Error(`Cannot load ${style} business-card artwork: ${String(error)}`);
      });
    sources.set(style, cached);
  }
  return cached;
}

/** Decorative hue follows the reference approximately. The printed HEX remains exact. */
export async function businessArtwork(
  style: PhysicalBusinessStyle,
  hex: string,
): Promise<Uint8Array> {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new Error('Invalid RGB reference.');
  const base = await source(style);
  const target = hsv(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
  const out = createRasterImage(base.width, base.height);
  out.data.set(base.data);
  for (let p = 0; p < out.data.length; p += 4) {
    const [h, s, v] = hsv(out.data[p]! / 255, out.data[p + 1]! / 255, out.data[p + 2]! / 255);
    if (s < 0.2 || v < 0.08) continue; // Black paper, white lettering/icons, and highlights stay neutral.
    const hue = (((h + target[0] - hueOrigins[style]) % 1) + 1) % 1;
    const sat =
      target[1] < 0.08
        ? 0
        : s *
          (style !== 'it' && style !== 'architect'
            ? Math.max(0.65, target[1])
            : Math.max(0.35, Math.min(0.68, target[1] * 0.75)));
    const value = v * (target[1] < 0.08 ? 0.6 : style !== 'it' && style !== 'architect' ? 1 : 0.86);
    const sector = hue * 6;
    const c = value * sat;
    const x = c * (1 - Math.abs((sector % 2) - 1));
    const m = value - c;
    const rgb =
      sector < 1
        ? [c, x, 0]
        : sector < 2
          ? [x, c, 0]
          : sector < 3
            ? [0, c, x]
            : sector < 4
              ? [0, x, c]
              : sector < 5
                ? [x, 0, c]
                : [c, 0, x];
    for (let j = 0; j < 3; j++) out.data[p + j] = Math.round((rgb[j]! + m) * 255);
  }
  return renderPlatform().encodePng(out, 6);
}
