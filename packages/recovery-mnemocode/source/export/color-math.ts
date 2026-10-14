import { bytesOfHex, hexOfBytes } from "../core/bits.js";
import { defined } from "../core/defined.js";

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

/** The largest value of an eight-bit channel. */
const BYTE_MAX = 255;

/**
 * Hue, saturation and value of the pixel whose red, green and blue bytes start at `offset` of
 * `data`, as hsv takes them: each byte divided by BYTE_MAX. The artwork reads its photographs so.
 */
export function pixelHsv(data: ArrayLike<number>, offset: number): [number, number, number] {
  return hsv(
    defined(data[offset]) / BYTE_MAX,
    defined(data[offset + 1]) / BYTE_MAX,
    defined(data[offset + 2]) / BYTE_MAX,
  );
}

/**
 * The hue and saturation, each from 0 to 1, of a color written #RRGGBB or RRGGBB. Neither depends
 * on the scale of the channels, so they are worked out from the bytes as they are. The bytes are
 * kept, not rgbChannels: from channels from 0 to 1 the values differ in the last bit for many
 * colors, which could move pixels of the approved business artwork.
 */
export function hueAndSaturation(color: string): [number, number] {
  const [hue, saturation] = hsv(...rgbBytes(color));
  return [hue, saturation];
}

/** A channel from 0 to 1 as the nearest eight-bit value; the caller keeps it within that range. */
function toByte(channel: number): number {
  return Math.round(channel * BYTE_MAX);
}

/**
 * The red, green and blue bytes, 0 to 255, of a color written #RRGGBB or RRGGBB. Every card, its
 * artwork and the terminal's color cards read a color's channels through it.
 */
export function rgbBytes(color: string): [number, number, number] {
  const [red, green, blue] = bytesOfHex(color.startsWith("#") ? color.slice(1) : color);
  return [defined(red), defined(green), defined(blue)];
}

/** The same channels from 0 to 1, as PDF colors and the color spaces take them. */
export function rgbChannels(color: string): [number, number, number] {
  const [red, green, blue] = rgbBytes(color);
  return [red / BYTE_MAX, green / BYTE_MAX, blue / BYTE_MAX];
}

/**
 * Red, green and blue channels, each clamped to 0 to 1, as six upper-case hexadecimal digits
 * without "#": the inverse of rgbChannels, which reads them in either form.
 */
export function channelsHex(channels: readonly number[]): string {
  return hexOfBytes(
    channels.map((channel) => toByte(Math.min(1, Math.max(0, channel)))),
  ).toUpperCase();
}

/** Rec. 709 luma weights of red, green and blue (ITU-R BT.709). */
const REC709_LUMA = Object.freeze([0.2126, 0.7152, 0.0722] as const);

/**
 * The Rec. 709 luma of a color's bytes divided by its brightest channel (at least 1): how light
 * its hue is whatever its own brightness. The curves design keeps only the hue and saturation of a
 * reference, so it chooses the ink on that colour by this. Not the PDF blend luminosity of
 * material-artwork.ts, which is another rule.
 */
export function peakRelativeLuma(color: string): number {
  const channels = rgbBytes(color);
  const peak = Math.max(...channels, 1);
  const [red, green, blue] = REC709_LUMA;
  return (red * channels[0] + green * channels[1] + blue * channels[2]) / peak;
}

/**
 * Hue, saturation and value, each from 0 to 1, as rounded eight-bit red, green and blue: the hue
 * in six sectors of 60 degrees, the inverse of hsv. The artwork recolours its pixels with it.
 */
export function rgbOfHsv(hue: number, saturation: number, value: number): [number, number, number] {
  const sector = hue * 6;
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const lift = value - chroma;
  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  return [toByte(red + lift), toByte(green + lift), toByte(blue + lift)];
}

/** An sRGB channel from 0 to 1 as linear light (IEC 61966-2-1). */
function linearChannel(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * OKLab of sRGB channels from 0 to 1: lightness and two opponent axes, in which equal distances
 * look about equally different (Björn Ottosson, "A perceptual color space for image processing",
 * 2020, whose matrices these are). The colours of a set of cards are chosen apart in it
 * (card-palette.ts).
 */
export function oklab(red: number, green: number, blue: number): [number, number, number] {
  const [r, g, b] = [red, green, blue].map(linearChannel) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
