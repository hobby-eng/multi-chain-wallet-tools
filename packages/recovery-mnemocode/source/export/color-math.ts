/**
 * Converts RGB channels from 0 to 1 into hue, saturation and value, each from 0 to 1.
 * The artwork modules recolour photographs in this space.
 */
export function hsv(red: number, green: number, blue: number): [number, number, number] {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const range = max - min;
  const hue =
    range === 0
      ? 0
      : max === red
        ? ((green - blue) / range + 6) % 6
        : max === green
          ? (blue - red) / range + 2
          : (red - green) / range + 4;
  return [hue / 6, max === 0 ? 0 : range / max, max];
}
