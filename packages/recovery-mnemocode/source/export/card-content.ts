// What the cards of a backup print and what their QR code holds must be the same backup. Every
// family of cards checks its content here before it draws, and the palette export checks its QR
// code with the same rule.

import { assertPhraseIndexes } from "../core/bip39-sizes.js";
import { colorsToIndexes, isRgbReference, unicodeToColors } from "../core/colors.js";
import { EncodedForm } from "../core/encoded-form.js";
import { assertShareQr } from "../sskr/transport.js";
import { ownCards } from "./card-decoys.js";
// Types only, which leave no import behind: the card families import this module.
import type { SskrCardContent } from "./sskr-content.js";
import type { CardContent } from "./backup-cards.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-content", {
  "cards-draw-color-references": () => "These cards draw color references.",
  "cards-print-codes-print-one-code-each-color": () =>
    "Cards that print codes print one code for each color, in order.",
  "collection-qr-does-not-match-printed-references": () =>
    "Collection QR does not match the printed references.",
});

/** The refusal of cards without any reference, which every family that checks gives. */
export const EMPTY_CARD_COLLECTION = "The card collection is empty.";

/** The content that colour cards draw: the colours of a seed phrase, or a share's. */
export type ColorCards = CardContent | SskrCardContent;

/**
 * Refuses content that colour cards cannot draw: content of another kind, which a JavaScript host
 * may pass, or colours that the QR code does not hold (assertColorCardContent). Every family of
 * colour cards checks so.
 */
export function assertColorCards(
  content: CardContent | SskrCardContent,
): asserts content is ColorCards {
  if (content.kind !== "colors" && content.kind !== "sskr")
    throw ERRORS.create("cards-draw-color-references", []);
  assertColorCardContent(content);
}

/**
 * Whether `payload`, the text of a QR code, holds `colors`: written as the colors themselves, or as
 * Color Unicode codes that decode to them. Other colors are other references, not Color Unicode
 * to be refused as such; any other text is read as Color Unicode, which refuses what it is not.
 */
export function payloadHoldsColors(colors: readonly string[], payload: string): boolean {
  const written = colors.join(" ");
  if (payload === written) return true;
  if (payload.trim().split(/\s+/u).every(isRgbReference)) return false;
  return unicodeToColors(payload).join(" ") === written;
}

/**
 * The content of color cards: the colors of a seed phrase, or a share's, or the Unicode codes of
 * either printed on cards whose colors decorate them; and how many of the last cards are decoys.
 */
export interface ColorCardContent {
  readonly kind: "colors" | "sskr";
  readonly colors: readonly string[];
  readonly payload: string;
  readonly labels?: readonly string[] | undefined;
  readonly decoys?: number | undefined;
}

/**
 * Refuses labels that the cards cannot print one by one (PrintedCodes): one code per color, in
 * order, so that the cards together hold every code and nothing else (AUD-012-FUN004).
 */
function assertLabelsPerColor(content: ColorCardContent): void {
  const { labels } = content;
  if (labels === undefined) return;
  const owned = Array.from(labels);
  if (
    owned.length !== content.colors.length ||
    !owned.every((label) => typeof label === "string" && label.trim() !== "")
  )
    throw ERRORS.create("cards-print-codes-print-one-code-each-color", []);
}

/** The form whose codes a seed phrase's cards print in place of its colors. */
const PRINTED_PHRASE_FORM = EncodedForm.of("unicode");

/**
 * Refuses Unicode codes of a seed phrase that are not the phrase its QR code holds: codes of the
 * words of a whole phrase, and the same codes in `payload`.
 */
function assertPhraseCodes(codes: readonly string[], payload: string): void {
  const indexes = PRINTED_PHRASE_FORM.read(codes.join(" "));
  assertPhraseIndexes(indexes);
  if (PRINTED_PHRASE_FORM.read(payload).join(" ") !== indexes.join(" "))
    throw ERRORS.create("collection-qr-does-not-match-printed-references", []);
}

/**
 * Refuses content whose QR code holds another backup than the cards print before their decoys:
 * for a share, the share of its colors or codes (assertShareQr); for a seed phrase, colors that are
 * a phrase's, or the Unicode codes of a phrase, held by the QR code (payloadHoldsColors,
 * assertPhraseCodes). The decoys after them are refused only for their count (assertDecoys).
 */
export function assertColorCardContent(content: ColorCardContent): void {
  assertLabelsPerColor(content);
  const own = ownCards(content);
  const colors = content.colors.slice(0, own);
  const labels = content.labels?.slice(0, own);
  if (content.kind === "sskr") {
    assertShareQr(colors, content.payload, labels);
    return;
  }
  if (labels !== undefined) {
    assertPhraseCodes(labels, content.payload);
    return;
  }
  colorsToIndexes(colors);
  if (!payloadHoldsColors(colors, content.payload))
    throw ERRORS.create("collection-qr-does-not-match-printed-references", []);
}
