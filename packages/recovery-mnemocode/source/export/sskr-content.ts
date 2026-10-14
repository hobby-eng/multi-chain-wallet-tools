import {
  SHEET_SIZES_TEXT,
  isCardPageSize,
  type CardPageSize,
  type CardSettings,
  assertSeparateCardSize,
} from "./card-settings.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.sskr-content", {
  "card-layout-one": (value0: string) => `The card layout must be one of: ${value0}.`,
  "business-page-size-gives-separate-cards-choose-size": (value0: string) =>
    `The business page size gives separate cards. Choose the ${value0} size for a collection sheet.`,
});

/** The layouts of share cards that a caller may ask for. */
export const SSKR_CARD_LAYOUTS = Object.freeze(["qr", "collection", "individual"] as const);
/** A layout of share cards (SSKR_CARD_LAYOUTS). */
export type SskrCardLayout = (typeof SSKR_CARD_LAYOUTS)[number];

/** `value` as a layout of share cards; undefined stays undefined, for the page size to decide. */
export function parseSskrLayout(value: string | undefined): SskrCardLayout | undefined {
  if (value === undefined) return undefined;
  if (!(SSKR_CARD_LAYOUTS as readonly string[]).includes(value))
    throw ERRORS.create("card-layout-one", [`${SSKR_CARD_LAYOUTS.join(", ")}`]);
  return value as SskrCardLayout;
}
/**
 * The page size decides the layout, as for ordinary cards: a sheet size gives one
 * collection sheet per share, a card size gives separate numbered cards. A QR card
 * holds one whole share and is available in every size.
 */
export function resolveSskrLayout(
  requested: SskrCardLayout | undefined,
  pageSize: CardPageSize | undefined,
): SskrCardLayout {
  if (requested === "qr") return "qr";
  const cards = isCardPageSize(pageSize);
  if (requested === "collection" && cards)
    throw ERRORS.create("business-page-size-gives-separate-cards-choose-size", [
      `${SHEET_SIZES_TEXT}`,
    ]);
  if (requested === "individual") assertSeparateCardSize(pageSize);
  return requested ?? (cards ? "individual" : "collection");
}

/**
 * The content of the cards of one share: its colors, the codes that the cards print where they are
 * not its colors, the share as its QR code holds it, and the card settings.
 */
export interface SskrCardContent extends CardSettings {
  readonly kind: "sskr";
  /**
   * The colors of the cards: the share itself in the color forms; otherwise one for each distinct
   * code (codeColors, card-palette.ts), to decorate the cards that print `labels`.
   */
  readonly colors: readonly string[];
  /**
   * The share's Unicode codes, one to each card, for a share written in them: the cards print them
   * in place of the colors' hex codes.
   */
  readonly labels?: readonly string[];
  readonly payload: string;
  /** How many of the last cards are decoys (card-decoys.ts). */
  readonly decoys?: number;
  readonly collectionReference: string;
  readonly qrCard?: boolean;
  readonly title?: string;
}
