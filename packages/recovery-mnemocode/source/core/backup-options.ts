// What a backup can be made of, and what each choice allows: the rules that the start menu of the
// command line asks by (src/cli/menu.ts) and that a page such as the Deriver's Encode tab shows as
// its fields. They are: the usual Shamir share sets and how a set of one's own is checked
// (ShareSetChoice), which share form goes with each form of the seed phrase, which forms are
// always masked and why an unmasked copy of the others is weak, and what each transformation mode
// allows (capabilities, from core/masking.ts).
//
// Needs from the host: nothing.
// Does not: ask, encode, split or save anything. The commands check every option again
// (sskr/split.ts for a share set, core/backup-check.ts for a check of what was written down), so
// these rules only keep a person from choosing what would be refused later.

import { MAX_SHARES, MIN_THRESHOLD, ShareSplit } from "../sskr/split.js";
import type { ShareFormat } from "../sskr/transport.js";
import { Masking, type MaskingCapabilities } from "./masking.js";
import { typedWholeNumber, type WholeRange } from "./typed-number.js";
import { type CardKind, type MaskingMode, type EncodedFormat } from "./types.js";
import { shareFormatMirroring } from "../sskr/transport.js";
import { EncodedForm } from "./encoded-form.js";

/** What a backup made in `mode` allows; refuses a name that is no transformation mode. */
export function capabilities(mode: MaskingMode): MaskingCapabilities {
  return Masking.of(mode).capabilities;
}

/**
 * The form in which the shares of a seed phrase in `form` are written, unless one is chosen: the
 * one that looks like it (shareFormatMirroring, transport.ts).
 */
export function shareFormatOf(form: EncodedFormat): ShareFormat {
  // A value that names no form is refused by the form's own refusal (EncodedForm.of).
  return shareFormatMirroring(EncodedForm.of(form).format);
}

// The kinds of cards are named in types.ts, which the card exports read without this module.
export type { CardKind };

/** How a seed phrase in `form` prints on cards, or undefined when it has none (EncodedForm). */
export function cardKindOf(form: EncodedFormat): CardKind | undefined {
  return EncodedForm.of(form).cardKind;
}

/** Whether `form` is written in colors: its cards print colors, and the terminal colour cards. */
export function writtenInColors(form: EncodedFormat): boolean {
  return EncodedForm.of(form).writtenInColors;
}

/**
 * Whether a seed phrase in `form` is always masked with Seedshift: the menu always masks it, and
 * a page that offers it unmasked warns (UNMASKED_NOTE). The reason is the form's (EncodedForm).
 */
export function alwaysMasked(form: EncodedFormat): boolean {
  return EncodedForm.of(form).alwaysMasked;
}

/** Why a form that is always masked has no choice of not masking it. */
export const ALWAYS_MASKED_NOTE =
  "Always masked: unmasked, this form shows the seed phrase itself.";

/** What a copy of the other forms is worth without Seedshift (the note of the answer No). */
export const UNMASKED_NOTE = "weak: only disguised, anyone with MnemoCode reads it";

/** The fewest shares, and the fewest that restore the phrase, that a split makes (ShareSplit). */
const MIN_SHARES = MIN_THRESHOLD;

/**
 * How many Shamir shares to make, and how many of them restore the seed phrase. A value object, so
 * that a set that SSKR would refuse cannot exist: the menu and a page offer the usual sets
 * (PRESETS) and build one of the person's own from two typed numbers, each refused with a line that
 * says what fits.
 */
export class ShareSetChoice {
  /** The fewest shares in all, and the fewest that may restore the phrase. */
  static readonly MIN_SHARES = MIN_SHARES;
  /** The most shares in all (SSKR's limit for one group). */
  static readonly MAX_SHARES = MAX_SHARES;
  /** The numbers that a share count or a threshold may be, each on its own (of checks both). */
  static readonly RANGE: WholeRange = Object.freeze({ min: MIN_SHARES, max: MAX_SHARES });

  readonly #threshold: number;
  readonly #count: number;

  private constructor(threshold: number, count: number) {
    ShareSplit.validateThreshold(threshold, count);
    this.#threshold = threshold;
    this.#count = count;
  }

  /** `count` shares of which `threshold` restore the phrase; refused as SSKR refuses it. */
  static of(threshold: number, count: number): ShareSetChoice {
    return new ShareSetChoice(threshold, count);
  }

  /** The usual sets, offered first; Other takes any that SSKR allows. */
  static readonly PRESETS: readonly ShareSetChoice[] = Object.freeze(
    (
      [
        [2, 3],
        [2, 4],
        [3, 4],
        [3, 5],
        [4, 6],
        [5, 7],
      ] as const
    ).map(([threshold, count]) => new ShareSetChoice(threshold, count)),
  );

  /** What the answer Other says about the sets one may type. */
  static readonly OTHER_NOTE = `type the numbers, up to ${MAX_SHARES} shares`;

  /** The number of shares in all, as typed; refused unless it is a number SSKR allows. */
  static typedCount(answer: string): number {
    return typedWholeNumber(
      answer,
      ShareSetChoice.RANGE,
      `Choose ${MIN_SHARES} to ${MAX_SHARES} shares.`,
    );
  }

  /** How many of `count` shares restore the phrase, as typed; refused unless it fits `count`. */
  static typedThreshold(answer: string, count: number): number {
    return typedWholeNumber(
      answer,
      { min: MIN_SHARES, max: count },
      `Type a number from ${MIN_SHARES} to ${count}, the number of shares.`,
    );
  }

  get threshold(): number {
    return this.#threshold;
  }

  get count(): number {
    return this.#count;
  }

  /** The set in a few words, such as "2 of 3". */
  get label(): string {
    return `${this.#threshold} of ${this.#count}`;
  }

  /** What the set means, such as "3 shares, any 2 restore it". */
  get note(): string {
    return `${this.#count} shares, any ${this.#threshold} restore it`;
  }
}
