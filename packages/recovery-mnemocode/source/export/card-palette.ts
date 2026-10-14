// The colours of cards that print codes, such as the Unicode codes of a seed phrase or a share,
// whose colours only decorate the cards. Each distinct code takes its own colour, chosen as far as
// possible from the colours before it, and a code printed twice takes the same colour twice
// (owner, 2026-10-13). A rule that gave each code a colour of its own, whatever the set, made
// different codes of one set look alike.
//
// The colours are compared as the designs show them: in full, as the material samples and the
// frames do, and on the vivid and the muted business designs, which keep their photograph's light
// and take the colour's hue, a saturation in their range and its brightness (business-tint.ts).
// Two colours are as far apart as they are in the view where they are closest, so that no design
// shows two codes alike.
//
// Host-neutral: it reaches only color-math.ts and business-tint.ts.

import { ReferenceTint } from "./business-tint.js";
import { channelsHex, oklab, rgbChannels, rgbOfHsv } from "./color-math.js";

/** The candidate colours: a hue every HUE_STEP_DEGREES, each with these saturations and values. */
const HUE_STEP_DEGREES = 3;
const DEGREES = 360;
const CANDIDATE_SATURATIONS = Object.freeze([0.45, 0.72, 0.95]);
const CANDIDATE_VALUES = Object.freeze([0.5, 0.75, 1]);
/** The largest value of an eight-bit channel. */
const CHANNEL_MAX = 255;

type Lab = readonly [number, number, number];

/** One candidate colour, and how each design shows it, in OKLab. */
interface Candidate {
  readonly hex: string;
  readonly views: readonly Lab[];
}

/** OKLab of eight-bit channels. */
function labOfBytes(bytes: readonly [number, number, number]): Lab {
  const [red, green, blue] = bytes.map((byte) => byte / CHANNEL_MAX) as [number, number, number];
  return oklab(red, green, blue);
}

/** The colour `hex` as the designs show it: in full, on vivid and on muted business cards. */
function viewsOf(hex: string): Lab[] {
  const tint = new ReferenceTint(hex);
  return [
    oklab(...rgbChannels(hex)),
    labOfBytes(rgbOfHsv(...tint.typical("vivid"))),
    labOfBytes(rgbOfHsv(...tint.typical("muted"))),
  ];
}

/** Every candidate, in order of hue, then saturation, then value. */
function candidates(): Candidate[] {
  const all: Candidate[] = [];
  for (let degrees = 0; degrees < DEGREES; degrees += HUE_STEP_DEGREES)
    for (const saturation of CANDIDATE_SATURATIONS)
      for (const value of CANDIDATE_VALUES) {
        const bytes = rgbOfHsv(degrees / DEGREES, saturation, value);
        const hex = `#${channelsHex(bytes.map((byte) => byte / CHANNEL_MAX))}`;
        all.push({ hex, views: viewsOf(hex) });
      }
  return all;
}

/**
 * Distances are compared in whole millionths of OKLab units: the last bit of a cube root or a
 * power may differ between JavaScript engines, which must never change which colour a set takes.
 */
const DISTANCE_STEPS = 1_000_000;

/**
 * How far apart two candidates look, in millionths: their distance in the view where they are
 * closest. Square root rather than Math.hypot, which engines compute differently.
 */
function distance(left: Candidate, right: Candidate): number {
  return Math.min(
    ...left.views.map((view, index) => {
      const other = right.views[index]!;
      const [l, a, b] = [view[0] - other[0], view[1] - other[1], view[2] - other[2]];
      return Math.round(Math.sqrt(l * l + a * a + b * b) * DISTANCE_STEPS);
    }),
  );
}

/**
 * The colours in the order a set takes them: the middle candidate first, then each time the one
 * farthest from all before it, the first in the candidates' order on a tie. Each set takes the
 * first colours of this one order, so that a set of more codes keeps the colours of a smaller one.
 * A class, so that the order is worked out once, as far as a set has needed it.
 */
class FarthestColours {
  readonly #candidates = candidates();
  /** For each candidate, its distance to the nearest colour taken so far. */
  readonly #nearest: number[] = [];
  readonly #order: string[] = [];

  /** The first `count` colours of the order. */
  first(count: number): readonly string[] {
    if (count > this.#candidates.length)
      throw new Error(`Cards that print codes have at most ${this.#candidates.length} colours.`);
    while (this.#order.length < count) this.#take();
    return this.#order.slice(0, count);
  }

  #take(): void {
    const all = this.#candidates;
    let next = Math.floor(all.length / 2);
    if (this.#order.length > 0) {
      next = 0;
      for (let index = 1; index < all.length; index++)
        if (this.#nearest[index]! > this.#nearest[next]!) next = index;
    }
    const chosen = all[next]!;
    this.#order.push(chosen.hex);
    for (let index = 0; index < all.length; index++)
      this.#nearest[index] = Math.min(
        this.#nearest[index] ?? Number.POSITIVE_INFINITY,
        distance(all[index]!, chosen),
      );
  }
}

/** The one order, worked out when a set first needs it. */
let farthest: FarthestColours | undefined;

/**
 * The colour of the card of each code of `codes`, in their order: the distinct codes take the
 * colours of the one order (FarthestColours) in the order in which they first appear, and every
 * card of one code has its colour. The colours carry nothing of the codes.
 */
export function codeColors(codes: readonly string[]): string[] {
  const distinct = [...new Set(codes)];
  farthest ??= new FarthestColours();
  const colours = farthest.first(distinct.length);
  const colourOf = new Map(distinct.map((code, rank) => [code, colours[rank]!]));
  return codes.map((code) => colourOf.get(code)!);
}

/**
 * The smallest distance, in millionths of OKLab units, between two of `colours` in any view: how
 * alike the two most alike of them look on some design. The tests and the self-test of cards check
 * a set by it.
 */
export function closestPair(colours: readonly string[]): number {
  const looks = colours.map((hex) => ({ hex, views: viewsOf(hex) }));
  let closest = Number.POSITIVE_INFINITY;
  for (let left = 0; left < looks.length; left++)
    for (let right = left + 1; right < looks.length; right++)
      closest = Math.min(closest, distance(looks[left]!, looks[right]!));
  return closest;
}
