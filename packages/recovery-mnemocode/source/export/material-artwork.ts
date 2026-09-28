/** Approved photographic finishes. RGB entries describe the artwork, never the encoded reference. */
export type MaterialStyle = 'vehicle' | 'enclosure' | 'tile' | 'switch' | 'kitchen';
export interface MaterialFinish {
  readonly name: string;
  readonly color: string;
  readonly crop: readonly [number, number, number, number];
}
export interface MaterialArtwork {
  readonly title: string;
  readonly dark: boolean;
  readonly background: readonly [number, number, number];
  readonly finishes: readonly MaterialFinish[];
}
const finish = (
  name: string,
  color: string,
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): MaterialFinish => ({
  name,
  color,
  crop: [x / sourceWidth, y / sourceHeight, cropWidth / sourceWidth, cropHeight / sourceHeight],
});
export const materialArtwork: Record<MaterialStyle, MaterialArtwork> = {
  kitchen: {
    title: 'KITCHEN / MATERIAL SELECTION',
    dark: false,
    background: [0.928, 0.915, 0.886],
    finishes: [
      finish('Ivory limestone', 'E3DCCF', 52, 187, 346, 250, 1580, 996),
      finish('Smoked walnut', '795A42', 430, 187, 346, 250, 1580, 996),
      finish('Cashmere matte', 'AAA092', 810, 187, 346, 250, 1580, 996),
      finish('Graphite matte', '383C3D', 1190, 187, 346, 250, 1580, 996),
      finish('Champagne satin', 'A89273', 52, 507, 346, 250, 1580, 996),
      finish('Olive lacquer', '747968', 430, 507, 346, 250, 1580, 996),
      finish('Warm travertine', 'D2C0A2', 810, 507, 346, 250, 1580, 996),
      finish('Smoked glass', '87928F', 1190, 507, 346, 250, 1580, 996),
    ],
  },
  vehicle: {
    title: 'VEHICLE WRAP / FINISH SELECTION',
    dark: false,
    background: [0.916, 0.904, 0.875],
    finishes: [
      finish('Matte charcoal', '35383B', 84, 251, 335, 232, 1536, 1024),
      finish('Satin black', '181B20', 433, 251, 335, 232, 1536, 1024),
      finish('Cement gray', '8A9094', 784, 251, 335, 232, 1536, 1024),
      finish('Ivory white', 'E8E4DC', 1124, 251, 335, 232, 1536, 1024),
      finish('Desert sand', 'BAA17C', 82, 544, 335, 233, 1536, 1024),
      finish('Army olive', '59624B', 431, 544, 335, 233, 1536, 1024),
      finish('Midnight blue', '263E59', 779, 544, 335, 233, 1536, 1024),
      finish('Warm taupe', '8D8073', 1121, 544, 335, 233, 1536, 1024),
    ],
  },
  enclosure: {
    title: 'ENCLOSURE FINISH SELECTION',
    dark: true,
    background: [0.1, 0.105, 0.11],
    finishes: [
      finish('Deep blue', '304C68', 50, 148, 356, 294, 1578, 997),
      finish('Petrol teal', '35666B', 424, 148, 356, 294, 1578, 997),
      finish('Smoked violet', '514757', 798, 148, 356, 294, 1578, 997),
      finish('Sage anodised', '76816D', 1173, 148, 356, 294, 1578, 997),
      finish('Bronze gold', '827445', 50, 509, 356, 294, 1578, 997),
      finish('Burgundy', '783E49', 424, 509, 356, 294, 1578, 997),
      finish('Champagne', 'B1A69A', 798, 509, 356, 294, 1578, 997),
      finish('Graphite', '555B60', 1173, 509, 356, 294, 1578, 997),
    ],
  },
  tile: {
    title: 'BATHROOM TILE SELECTION',
    dark: true,
    background: [0.235, 0.228, 0.209],
    finishes: [
      finish('Travertine', 'BDA78B', 77, 125, 336, 319, 1578, 996),
      finish('Ivory limestone', 'D4C6AD', 446, 125, 336, 319, 1578, 996),
      finish('White marble', 'DAD8D0', 808, 125, 336, 319, 1578, 996),
      finish('Black marble', '383A39', 1175, 125, 336, 319, 1578, 996),
      finish('Olive glaze', '81856A', 77, 497, 336, 319, 1578, 996),
      finish('Petrol glaze', '335D64', 446, 497, 336, 319, 1578, 996),
      finish('Terracotta', 'A66E52', 808, 497, 336, 319, 1578, 996),
      finish('Fluted sand', 'B4AA98', 1175, 497, 336, 319, 1578, 996),
    ],
  },
  switch: {
    title: 'SWITCH FINISH SELECTION',
    dark: false,
    background: [0.934, 0.927, 0.899],
    finishes: [
      finish('Brushed brass', 'B8A078', 82, 141, 320, 303, 1579, 996),
      finish('Brushed silver', 'AAA9A0', 454, 141, 320, 303, 1579, 996),
      finish('Graphite', '414548', 827, 141, 320, 303, 1579, 996),
      finish('Porcelain', 'E5E3DC', 1199, 141, 320, 303, 1579, 996),
      finish('Aged bronze', '6B5940', 82, 506, 320, 303, 1579, 996),
      finish('Ocean blue', '315969', 454, 506, 320, 303, 1579, 996),
      finish('Sage green', '798267', 827, 506, 320, 303, 1579, 996),
      finish('Copper', 'B68161', 1199, 506, 320, 303, 1579, 996),
    ],
  },
};

// sRGB transfer curve and D65 XYZ-to-Lab conversion. Distances choose decoration only;
// the original hexadecimal reference remains untouched and fully recoverable.
function lab(hex: string): [number, number, number] {
  const channels = hex
    .replace(/^#/u, '')
    .match(/../gu)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = channels as [number, number, number];
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** Restrict imagery to actual premium finishes. Some codes intentionally share an artwork. */
export function chooseMaterialFinish(style: MaterialStyle, reference: string): MaterialFinish {
  if (!/^#?[0-9a-f]{6}$/iu.test(reference))
    throw new Error('Material reference must contain exactly six hexadecimal digits.');
  const target = lab(reference);
  const distance = (finish: MaterialFinish) =>
    lab(finish.color).reduce((sum, v, i) => sum + (v - target[i]!) ** 2, 0);
  return materialArtwork[style].finishes.reduce((best, finish) =>
    distance(finish) < distance(best) ? finish : best,
  );
}
