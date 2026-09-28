import {
  createRasterImage,
  readRenderAsset,
  renderPlatform,
  type RasterImage,
} from './platform.js';
import { hsv } from './color-math.js';

// Caches hold only bundled public artwork. Per-export reference colors are never cached here.
let source: Promise<RasterImage> | undefined;
function rgb(h: number, s: number, v: number): number[] {
  const sector = h * 6;
  const c = v * s;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const m = v - c;
  const channels =
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
  return channels.map((n) => Math.round((n + m) * 255));
}

const compactSources = new Map<number, Promise<Uint8Array>>();
/** The approved 4-in-1 recolors ink ribbons; compact 6/8 use fixed decorative JPEG palettes. */
export async function glassArtwork(
  references: readonly string[],
  referencesPerCard: 4 | 6 | 8 = 4,
): Promise<Uint8Array> {
  if (
    references.length < 1 ||
    references.length > referencesPerCard ||
    references.some((ref) => !/^#[0-9A-F]{6}$/u.test(ref))
  )
    throw new Error(`Glass cards require one through ${referencesPerCard} RGB references.`);
  if (referencesPerCard !== 4) {
    let bytes = compactSources.get(referencesPerCard);
    if (!bytes) {
      bytes = readRenderAsset(`images/business-glass-${referencesPerCard}in1.jpg`).catch(
        (error) => {
          compactSources.delete(referencesPerCard);
          throw error;
        },
      );
      compactSources.set(referencesPerCard, bytes);
    }
    return bytes;
  }
  source ??= readRenderAsset('images/business-glass-4in1.png').then((bytes) =>
    renderPlatform().decodePng(bytes),
  );
  const base = await source;
  const out = createRasterImage(base.width, base.height);
  out.data.set(base.data);
  const targets = references.map((ref) =>
    hsv(
      ...([1, 3, 5].map((p) => parseInt(ref.slice(p, p + 2), 16) / 255) as [
        number,
        number,
        number,
      ]),
    ),
  );
  const bounds: number[][] = [];
  // Bridge up to six pixels of photographic highlights when finding a continuous ink band.
  const longest = (rows: number[]): [number, number] | undefined => {
    const runs: Array<[number, number]> = [];
    for (const y of rows) {
      const last = runs.at(-1);
      if (last && y - last[1] <= 6) last[1] = y;
      else runs.push([y, y]);
    }
    return runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  };
  // These hue/position bounds belong to the approved 4-in-1 image, not the data format.
  for (let x = 0; x < base.width; x++) {
    const teal: number[] = [];
    const blue: number[] = [];
    for (let y = Math.floor(base.height * 0.22); y < base.height * 0.69; y++) {
      const p = (y * base.width + x) * 4;
      const [h, s] = hsv(base.data[p]! / 255, base.data[p + 1]! / 255, base.data[p + 2]! / 255);
      if (s > 0.22 && h > 0.43 && h < 0.56) teal.push(y);
      if (s > 0.15 && h >= 0.56 && h < 0.68) blue.push(y);
    }
    const t = longest(teal);
    const b = longest(blue);
    bounds.push(t && b ? [t[0], t[1], b[0], b[1]] : []);
  }
  for (let x = 0; x < base.width; x++) {
    const neighborhood = bounds
      .slice(Math.max(0, x - 8), Math.min(base.width, x + 9))
      .filter((b) => b.length === 4);
    if (!neighborhood.length) continue;
    const smooth = (n: number) =>
      Math.round(
        neighborhood.map((b) => b[n]!).sort((a, b) => a - b)[Math.floor(neighborhood.length / 2)]!,
      );
    const t0 = smooth(0);
    const t1 = smooth(1);
    const b0 = smooth(2);
    const b1 = smooth(3);
    const thickness = Math.max(8, b1 - b0);
    // Keep recolouring inside the ink band; its thin translucent outer rim retains the photographic highlight.
    const goldTop = t0 - Math.round(thickness * 0.9);
    const ranges = [
      [goldTop, t0 - 1],
      [t0, t1],
      [b0, b1],
      [b1 + 1, b1 + thickness],
    ];
    for (let band = 0; band < 4; band++) {
      const [lo, hi] = ranges[band]!;
      for (let y = Math.max(0, lo!); y <= Math.min(base.height - 1, hi!); y++) {
        const p = (y * base.width + x) * 4;
        const [h, s, v] = hsv(
          base.data[p]! / 255,
          base.data[p + 1]! / 255,
          base.data[p + 2]! / 255,
        );
        if (s < 0.07 || v > 0.985) continue;
        const belongs =
          band === 0
            ? h > 0.04 && h < 0.19 && s > 0.16
            : band === 1 || band === 2
              ? true
              : h > 0.04 && h < 0.19 && s > 0.07;
        if (!belongs) continue;
        const target = targets[band];
        // An unfilled last group has neutral unused ribbons, never fabricated reference values.
        const channels = target
          ? rgb(
              target[0],
              Math.min(0.5, target[1] * 0.55) * Math.min(1, s / 0.15),
              Math.min(0.96, v * (0.72 + target[2] * 0.24)),
            )
          : rgb(0, 0, Math.min(0.96, v * 0.25 + 0.7));
        for (let c = 0; c < 3; c++) out.data[p + c] = channels[c]!;
      }
    }
  }
  return renderPlatform().encodePng(out, 9);
}
