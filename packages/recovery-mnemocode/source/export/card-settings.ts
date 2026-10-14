import type { BusinessStyle, MaterialStyle } from "./template-catalog.js";
import { listInWords } from "../core/places.js";
import { capitalized } from "../core/prose.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-settings", {
  "page-size": (value0: string) => `Page size must be ${value0}.`,
  "separate-cards-business-size-choose-business-size-leave": () =>
    "Separate cards have the business size. Choose the business size, or leave the size out.",
  "qr-code-printed-on-sheet-only-choose-size": (value0: string) =>
    `A QR code is printed on a sheet only. Choose the ${value0} size for a QR code; separate cards never carry one.`,
  orientation: (value0: string) => `Orientation must be ${value0}.`,
  "card-non-empty-text-on-one-line": (value0: string, value1: string) =>
    `Card ${value0} must be non-empty text on one line${value1}`,
  "card-too-long-maximum-characters": (value0: string, value1: string) =>
    `Card ${value0} is too long (maximum ${value1} characters).`,
  "card-name-use-latin-letters-only-spaces-apostrophes": () =>
    "Card name must use Latin letters only (spaces, apostrophes and hyphens are allowed).",
});

/** Print layout is independent of the visual template and the encoded format. */
export const CARD_PAGE_SIZES = Object.freeze(["a6", "a5", "a4", "business"] as const);
/**
 * A page size of cards: a sheet size, or the business size of a separate card (CARD_PAGE_SIZES).
 */
export type CardPageSize = (typeof CARD_PAGE_SIZES)[number];
/** The orientations of a sheet of cards. */
export const CARD_ORIENTATIONS = Object.freeze(["portrait", "landscape"] as const);
/** An orientation of a sheet of cards (CARD_ORIENTATIONS). */
export type CardOrientation = (typeof CARD_ORIENTATIONS)[number];
/** The details of the person on the cards, in the order a host asks for them. */
export const profileFields = [
  "name",
  "role",
  "company",
  "email",
  "phone",
  "website",
  "location",
] as const;
/** A detail of the person on the cards (profileFields). */
export type ProfileField = (typeof profileFields)[number];
/** How a detail of the person is named to the person and in a refusal: its field, capitalized. */
export function profileFieldLabel(field: ProfileField): string {
  return capitalized(field);
}
/** The details of the person on the cards, each optional. */
export type CardProfile = Readonly<Partial<Record<ProfileField, string>>>;

/**
 * The texts of a card design besides the person's details, in the order a host asks for them and
 * in which the missing ones are chosen at random (resolveCardPresentation).
 */
export const COPY_FIELDS = Object.freeze([
  "studioName",
  "slogan",
  "subtitle",
  "footer",
  "referenceLabel",
] as const);
/** A text of a card design besides the person's details (COPY_FIELDS). */
export type CopyField = (typeof COPY_FIELDS)[number];
/** Every text of a card design besides the person's details. */
export type CardPresentation = Readonly<Record<CopyField, string>>;
/**
 * How cards are printed: the page size and orientation, the person's details, the texts of the
 * design, and whether a sheet carries its QR code. A size or orientation left undefined is chosen
 * by the plan.
 */
export interface CardSettings {
  readonly pageSize?: CardPageSize | undefined;
  readonly orientation?: CardOrientation | undefined;
  readonly profile?: CardProfile;
  readonly presentation?: CardPresentation;
  readonly cardQr?: boolean;
}
// The styles of the designs are the catalog's, which lists them once (template-catalog.ts).
export type { BusinessStyle, MaterialStyle };

/** The size of a sheet of cards when none is given. */
export const SHEET_PAGE_SIZE = "a6" satisfies CardPageSize;
/** The size of a separate card: that of a real business card. */
export const SEPARATE_CARD_SIZE = "business" satisfies CardPageSize;
/** A size of a sheet that holds the whole collection: every size but a separate card's. */
export type SheetPageSize = Exclude<CardPageSize, typeof SEPARATE_CARD_SIZE>;
/** The sheet sizes, in the order of CARD_PAGE_SIZES. */
export const SHEET_PAGE_SIZES: readonly SheetPageSize[] = Object.freeze(
  CARD_PAGE_SIZES.filter((size): size is SheetPageSize => size !== SEPARATE_CARD_SIZE),
);
/** The sheet sizes as messages name them: "A6, A5 or A4". */
export const SHEET_SIZES_TEXT = listInWords(
  SHEET_PAGE_SIZES.map((size) => size.toUpperCase()),
  "or",
);

/**
 * The size that `value` names; a sheet's when none is given (SHEET_PAGE_SIZE). Every export reads
 * a size through it.
 */
export function parsePageSize(value: string | undefined): CardPageSize {
  if (value === undefined) return SHEET_PAGE_SIZE;
  const size = CARD_PAGE_SIZES.find((known) => known === value);
  if (size === undefined)
    throw ERRORS.create("page-size", [`${listInWords(CARD_PAGE_SIZES, "or")}`]);
  return size;
}

/**
 * A business card in millimetres: the separate cards, and the box that their designs are drawn in,
 * which the paper of the business size follows, never the other way.
 */
export const BUSINESS_CARD_MM = Object.freeze({ width: 90, height: 50 } as const);

/** Width and height in millimetres, in the natural orientation of each size (ISO 216 for A). */
const PAGE_DIMENSIONS: Readonly<Record<CardPageSize, readonly [number, number]>> = {
  a4: [210, 297],
  a5: [148, 210],
  a6: [148, 105],
  business: [BUSINESS_CARD_MM.width, BUSINESS_CARD_MM.height],
};

/** A size in the words of the menu and the help, such as "148 x 105 mm", as it is printed. */
export function pageSizeLabel(size: CardPageSize): string {
  const [width, height] = PAGE_DIMENSIONS[size];
  return `${width} x ${height} mm`;
}

/**
 * The width and height of a page of `size` in `orientation`, in millimetres, both checked by
 * their parsers (parsePageSize, parseOrientation): every card family lays its pages out with it,
 * so that none takes a size or an orientation that another refuses (AUD-012-FUN006).
 */
export function pageDimensions(size: string, orientation?: string): [number, number] {
  const [width, height] = PAGE_DIMENSIONS[parsePageSize(size)];
  const turned = parseOrientation(orientation);
  const turn =
    (turned === "portrait" && width > height) || (turned === "landscape" && width < height);
  return turn ? [height, width] : [width, height];
}

/**
 * Refuses a page size or an orientation that no card family prints, before any template draws:
 * the families check them again where they lay their pages out (pageDimensions).
 */
export function assertPageSettings(settings: Pick<CardSettings, "pageSize" | "orientation">): void {
  if (settings.pageSize !== undefined) parsePageSize(settings.pageSize);
  parseOrientation(settings.orientation);
}

/**
 * The business size is the size of a real card, so every card becomes its own numbered
 * page. The sheet sizes hold the whole collection on one page (SHEET_PAGE_SIZES).
 */
export function isCardPageSize(size: CardPageSize | undefined): size is typeof SEPARATE_CARD_SIZE {
  return size === SEPARATE_CARD_SIZE;
}

/** The size that `value` names, or without one the size of a `separate` card or of a sheet. */
export function resolvePageSize(value: string | undefined, separate: boolean): CardPageSize {
  if (value === undefined) return separate ? SEPARATE_CARD_SIZE : SHEET_PAGE_SIZE;
  return parsePageSize(value);
}

/** Refuses a size given for separate cards other than theirs: they have the business size. */
export function assertSeparateCardSize(size: CardPageSize | undefined): void {
  if (size !== undefined && !isCardPageSize(size))
    throw ERRORS.create("separate-cards-business-size-choose-business-size-leave", []);
}

/**
 * What the QR code of a sheet holds, as the menu and the help name it: the backup alone, never the
 * cards that end a set and belong to nothing (card-plan.ts).
 */
export const SHEET_QR_HOLDS = "the codes of the backup, without the extra cards";

/**
 * Refuses a QR code on colour cards of the business size, which are separate cards: a QR code is
 * printed on a sheet only. Share cards have their own rule (sskr-content.ts). Fast, it draws
 * nothing: the renderers check it, and a host before it asks for a secret.
 */
export function assertSheetQr(card: { readonly kind: string } & CardSettings): void {
  if (card.kind === "colors" && isCardPageSize(card.pageSize) && card.cardQr === true)
    throw ERRORS.create("qr-code-printed-on-sheet-only-choose-size", [`${SHEET_SIZES_TEXT}`]);
}

/** The orientation that `value` names, or none; every export reads an orientation through it. */
export function parseOrientation(value: string | undefined): CardOrientation | undefined {
  if (value === undefined) return undefined;
  const orientation = CARD_ORIENTATIONS.find((known) => known === value);
  if (orientation === undefined)
    throw ERRORS.create("orientation", [`${listInWords(CARD_ORIENTATIONS, "or")}`]);
  return orientation;
}

/** The most characters (code points) that one line of text on a card holds. */
export const MAX_CARD_TEXT_LENGTH = 100;

/**
 * A text of a card, trimmed and in NFC: refused unless it is text on one line without control
 * characters, and no longer than MAX_CARD_TEXT_LENGTH. The refusal of a blank one says "Card
 * <label> must be non-empty text on one line" and then `blankEnding`, the caller's own rule.
 */
export function cardText(text: unknown, label: string, blankEnding: string): string {
  if (typeof text !== "string" || !text.trim() || /[\p{Cc}\p{Cf}]/u.test(text))
    throw ERRORS.create("card-non-empty-text-on-one-line", [`${label}`, `${blankEnding}`]);
  if (Array.from(text).length > MAX_CARD_TEXT_LENGTH)
    throw ERRORS.create("card-too-long-maximum-characters", [
      `${label}`,
      `${MAX_CARD_TEXT_LENGTH}`,
    ]);
  return text.trim().normalize("NFC");
}

/**
 * The details of the person, each trimmed and in NFC; refuses a detail that is empty, on more than
 * one line, too long or holds a control character, and a name not in Latin letters.
 */
export function validateProfile(profile: CardProfile = {}): CardProfile {
  const result: Record<string, string> = {};
  for (const field of profileFields) {
    const text = profile[field];
    if (text === undefined) continue;
    const normalized = cardText(text, field, ", without control characters.");
    if (
      field === "name" &&
      (!/\p{Script=Latin}/u.test(normalized) ||
        !/^[\p{Script=Latin}\p{M} .’'‐-]+$/u.test(normalized))
    ) {
      throw ERRORS.create("card-name-use-latin-letters-only-spaces-apostrophes", []);
    }
    result[field] = normalized;
  }
  return result;
}
