// Decoys: random codes after a backup's own codes on its cards (owner, 2026-10-13). A sheet of
// cards ends in full rows, which a backup's own codes seldom fill, and with a few more codes its
// cards may be larger: a set of cards has at least one decoy, then as many as give the largest
// cards in full rows on one sheet (planCollectionSheet, collection-sheet.ts). Separate cards have
// as many as the sheet of their design. A decoy looks like the backup's codes: the Unicode code of
// a random word, a colour of a random phrase of the same length, or a random colour beside the
// colours of a share. The QR code of the cards holds the backup alone; the sheet for heirs says how
// many codes the backup has, and a restore reads that many from the start.
//
// Host-neutral: it reaches only the core's codes and colours, card-palette.ts and platform.ts for
// the checked random choice.

import { BIP39_DICTIONARY_SIZE, BIP39_WORD_COUNTS } from "../core/bip39-sizes.js";
import { indexesToColors, RGB_MAX_VALUE, RGB_REFERENCE_COUNTS, rgbHex } from "../core/colors.js";
import { unicodeCodesOfIndexes } from "../core/words.js";
import { codeColors } from "./card-palette.js";
import { checkedChoice, type UniformChoice } from "./platform.js";

/** The most decoys that a set of cards takes: more than any sheet needs to fill its last row. */
export const MAX_DECOYS = 16;

/** How many colour codes there are: 2^24, six hexadecimal digits. */
const COLOR_CODES = RGB_MAX_VALUE + 1;

/** Why a random source is refused that gave a number out of range. */
const RANDOM_REFUSAL = "The random source of the decoy cards gave a number out of range.";

/** The cards that decoys are added to: colours, the codes printed in their place, and the decoys. */
export interface DecoyCards {
  /** A seed phrase's cards ("colors") or a share's ("sskr"). */
  readonly kind: "colors" | "sskr";
  readonly colors: readonly string[];
  /** The codes printed in place of the colours, one per card, where the colours only decorate. */
  readonly labels?: readonly string[] | undefined;
  /** How many of the last cards are decoys; none when undefined. */
  readonly decoys?: number | undefined;
}

/** Cards whose decoys are counted. */
export type WithDecoys<T extends DecoyCards> = T & { readonly decoys: number };

/** Refuses a count of decoys that is no whole number from 0 to below the number of cards. */
export function assertDecoys(cards: DecoyCards): void {
  const { decoys } = cards;
  if (decoys === undefined) return;
  if (!Number.isSafeInteger(decoys) || decoys < 0 || decoys >= cards.colors.length)
    throw new Error("The decoy cards must be a whole number, fewer than the cards.");
}

/** How many of the cards print the backup's own codes: all but the decoys after them. */
export function ownCards(cards: DecoyCards): number {
  assertDecoys(cards);
  return cards.colors.length - (cards.decoys ?? 0);
}

/** The Unicode code of a random word: a decoy beside the Unicode codes of a phrase or a share. */
function wordCode(random: UniformChoice): string {
  return unicodeCodesOfIndexes([checkedChoice(random, BIP39_DICTIONARY_SIZE, RANDOM_REFUSAL)])[0]!;
}

/**
 * A colour of a random seed phrase of as many colours as `colorCount`: a decoy beside a phrase's
 * colours, with an order tag and word positions like theirs.
 */
function phraseColor(random: UniformChoice, colorCount: number): string {
  const words = BIP39_WORD_COUNTS[RGB_REFERENCE_COUNTS.indexOf(colorCount)];
  if (words === undefined) throw new Error("Decoys are added to the colors of a whole phrase.");
  const colors = indexesToColors(
    Array.from({ length: words }, () =>
      checkedChoice(random, BIP39_DICTIONARY_SIZE, RANDOM_REFUSAL),
    ),
  );
  return colors[checkedChoice(random, colors.length, RANDOM_REFUSAL)]!;
}

/** A random colour: a decoy beside a share's colours, which look random themselves. */
function anyColor(random: UniformChoice): string {
  return rgbHex(checkedChoice(random, COLOR_CODES, RANDOM_REFUSAL));
}

/**
 * `cards` with MAX_DECOYS decoys after its own codes, drawn with `random`, of which a plan keeps
 * the first few (keptCards). Cards that print codes take their colours again for every code
 * (codeColors), which keeps the colours of their own codes.
 */
export function withDecoyPool<T extends DecoyCards>(
  cards: T,
  random: UniformChoice,
): WithDecoys<T> {
  if ((cards.decoys ?? 0) !== 0) throw new Error("These cards have their decoys already.");
  const own = cards.colors.length;
  const decoys = Array.from({ length: MAX_DECOYS }, () =>
    cards.labels !== undefined
      ? wordCode(random)
      : cards.kind === "sskr"
        ? anyColor(random)
        : phraseColor(random, own),
  );
  if (cards.labels === undefined)
    return { ...cards, colors: [...cards.colors, ...decoys], decoys: MAX_DECOYS };
  const labels = [...cards.labels, ...decoys];
  return { ...cards, labels, colors: codeColors(labels), decoys: MAX_DECOYS };
}

/** `cards` with only their first `count` cards: their own codes and the decoys that fit. */
export function keptCards<T extends DecoyCards>(cards: T, count: number): WithDecoys<T> {
  const own = ownCards(cards);
  if (!Number.isSafeInteger(count) || count < own || count > cards.colors.length)
    throw new Error("The cards kept must hold every code of the backup.");
  return {
    ...cards,
    colors: cards.colors.slice(0, count),
    ...(cards.labels === undefined ? {} : { labels: cards.labels.slice(0, count) }),
    decoys: count - own,
  };
}
