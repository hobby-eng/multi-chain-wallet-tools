// How the business designs tint the coloured parts of their photographs with a card's colour: the
// hue, a saturation within the design's range, and a brightness that follows the colour. The
// artwork recolours every pixel with it (business-artwork.ts), the curves design chooses its ink by
// it (business-cards.ts), and the colours of cards that print codes are chosen by how it shows
// them (card-palette.ts), so that the three never disagree.
//
// Host-neutral: it reaches only color-math.ts and the type of a tint.

import type { BusinessTint } from "./business-designs.js";
import { hueAndSaturation, rgbBytes } from "./color-math.js";

/**
 * How strongly a design's coloured parts take the reference's colour: the factor of their
 * saturation, from the reference's saturation, and of their value. The muted designs keep a
 * quieter, darker tint. The ranges are wide enough that pale and deep colours of one set look
 * apart on the cards (owner, 2026-10-13); the approved artwork was drawn with these numbers.
 */
const TINTS: Readonly<
  Record<BusinessTint, { readonly saturation: (target: number) => number; readonly value: number }>
> = Object.freeze({
  vivid: { saturation: (target) => Math.max(0.4, target), value: 1 },
  muted: { saturation: (target) => Math.max(0.3, Math.min(0.75, target * 0.8)), value: 0.86 },
});
/**
 * The share of the artwork's own brightness that every reference keeps: the rest follows the
 * reference's brightest channel, so that a dark colour gives darker artwork than a light one of the
 * same hue and the cards of a set are told apart by brightness too (owner, 2026-10-13).
 */
const BRIGHTNESS_FLOOR = 0.35;
/** The largest value of an eight-bit channel. */
const CHANNEL_MAX = 255;
/**
 * A pixel of the artwork less saturated than this, or darker than NEUTRAL_PIXEL_VALUE, keeps its
 * colour: the black paper, the white lettering and icons, and the highlights stay neutral.
 */
const NEUTRAL_PIXEL_SATURATION = 0.2;
const NEUTRAL_PIXEL_VALUE = 0.08;
/** Below this saturation a reference counts as grey: the artwork turns grey and darker. */
const GREY_REFERENCE_SATURATION = 0.08;
/** The factor of the value of a grey reference's artwork. */
const GREY_VALUE = 0.6;
/**
 * The saturation and value of a typical coloured pixel of the photographs, measured on the
 * approved artwork: how a colour looks on a card, which the choice of a set's colours compares.
 */
const TYPICAL_PIXEL = Object.freeze({ saturation: 0.9, value: 0.85 });

/** Hue, saturation and value, each from 0 to 1. */
export type Hsv = readonly [hue: number, saturation: number, value: number];

/**
 * The factor of the artwork's brightness for the reference `hex`: BRIGHTNESS_FLOOR for black, 1
 * for a colour with a full channel.
 */
export function artworkBrightness(hex: string): number {
  const peak = Math.max(...rgbBytes(hex)) / CHANNEL_MAX;
  return BRIGHTNESS_FLOOR + (1 - BRIGHTNESS_FLOOR) * peak;
}

/**
 * The tint of one reference colour: settled once for a card, then applied to each pixel. A class,
 * so that the reference's hue, saturation and brightness are worked out once, not per pixel.
 */
export class ReferenceTint {
  readonly #hue: number;
  readonly #saturation: number;
  readonly #brightness: number;
  readonly #grey: boolean;

  /** The tint of `hex`, a #RRGGBB or RRGGBB colour. */
  constructor(hex: string) {
    const [hue, saturation] = hueAndSaturation(hex);
    this.#hue = hue;
    this.#saturation = saturation;
    this.#brightness = artworkBrightness(hex);
    this.#grey = saturation < GREY_REFERENCE_SATURATION;
  }

  /** Whether the pixel `hsv` keeps its own colour: neutral parts of the photograph. */
  static keeps([, saturation, value]: Hsv): boolean {
    return saturation < NEUTRAL_PIXEL_SATURATION || value < NEUTRAL_PIXEL_VALUE;
  }

  /**
   * The colour that a coloured pixel `hsv` of a design takes: its hue turned from the design's
   * `hueOrigin` to the reference's, its saturation and value scaled by the design's `tint` and the
   * reference's brightness.
   */
  pixel([hue, saturation, value]: Hsv, tint: BusinessTint, hueOrigin: number): Hsv {
    const turned = (((hue + this.#hue - hueOrigin) % 1) + 1) % 1;
    const tinted = this.#grey ? 0 : saturation * TINTS[tint].saturation(this.#saturation);
    const scale = this.#grey ? GREY_VALUE : TINTS[tint].value;
    return [turned, tinted, value * scale * this.#brightness];
  }

  /** How a typical coloured pixel of a design with `tint` looks with this reference. */
  typical(tint: BusinessTint): Hsv {
    return this.pixel([this.#hue, TYPICAL_PIXEL.saturation, TYPICAL_PIXEL.value], tint, this.#hue);
  }
}
