// The installed card designs: the styles of each family, and from them each design's id, the kind
// of cards it draws, its family and its style, in the order that the list of designs numbers them,
// with the one reader of a design named by its id or its number. It imports no code, so that the
// share cards, the card texts, the card session and a page resolve a design without reaching any
// drawing code; templates.ts adds the renderers, and the types of the styles come from here.
//
// Each design was approved before installation. Keep IDs and their order stable for recorded
// commands, which name a design by its id or its number (a test pins them).

import type { CardKind } from "../core/types.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.template-catalog", {
  "sheets-only": () => SHEETS_ONLY,
  "card-template-unknown-incompatible-list-available-preview-templates": () =>
    "The card template is unknown or incompatible. List the available preview templates and choose one of them.",
});

/** The business designs, in their order; "mixed" draws the others in turn. */
export const BUSINESS_STYLES = Object.freeze([
  "architect",
  "it",
  "estate",
  "diagonal",
  "contact",
  "curves",
  "facets",
  "mixed",
] as const);
/** A business card design style (BUSINESS_STYLES). */
export type BusinessStyle = (typeof BUSINESS_STYLES)[number];
/** The business designs that have artwork of their own: all but "mixed". */
export type PhysicalBusinessStyle = Exclude<BusinessStyle, "mixed">;

/** Approved photographic finishes, in their order (material-artwork.ts draws them). */
export const MATERIAL_STYLES = Object.freeze([
  "vehicle",
  "enclosure",
  "tile",
  "switch",
  "kitchen",
] as const);
/** A material design style (MATERIAL_STYLES). */
export type MaterialStyle = (typeof MATERIAL_STYLES)[number];

/** How a design draws: a business style or a material. */
export type CardStyle = BusinessStyle | MaterialStyle;
/** The families of designs, each drawn by its own renderer. */
export type CardFamily = CatalogEntry["family"];

/** One installed design, in the family whose renderer draws it. */
export type CatalogEntry = { readonly id: string; readonly kind: CardKind } & (
  | { readonly family: "business"; readonly style: BusinessStyle }
  | { readonly family: "material"; readonly style: MaterialStyle }
);

/** The designs, in the order that the list of designs shows and numbers them, from 1. */
export const TEMPLATE_CATALOG: readonly CatalogEntry[] = Object.freeze(
  [
    ...BUSINESS_STYLES.map((style): CatalogEntry => ({
      id: `business-${style}`,
      kind: "colors",
      family: "business",
      style,
    })),
    ...MATERIAL_STYLES.map((style): CatalogEntry => ({
      id: `material-${style}`,
      kind: "colors",
      family: "material",
      style,
    })),
  ].map((entry) => Object.freeze(entry)),
);

/**
 * Whether the designs of each family are drawn as separate cards as well as on sheets: a business
 * card is a thing of its own, while a material design is a collection of samples that only its
 * sheet shows, with its backdrop and its QR code (owner, 2026-10-13).
 */
const SEPARATE_CARDS: Readonly<Record<CardFamily, boolean>> = Object.freeze({
  business: true,
  material: false,
});

/** Whether `entry` is drawn as separate cards too, or on sheets only. */
export function drawsSeparateCards(entry: CatalogEntry): boolean {
  return SEPARATE_CARDS[entry.family];
}

/** Why `design`, a design named in a sentence, is not drawn as separate cards. */
export function sheetsOnly(design: string): string {
  return `${design} is printed on sheets only: separate cards are made in the business card designs.`;
}

/** Why a design is not drawn as separate cards. */
export const SHEETS_ONLY = sheetsOnly("This design");

/** Refuses separate cards of `entry` where it is drawn on sheets only (SHEETS_ONLY). */
export function assertSeparateCards(entry: CatalogEntry): void {
  if (!drawsSeparateCards(entry)) throw ERRORS.create("sheets-only", []);
}

/** The design of colour cards when none is named: the first. */
export const DEFAULT_TEMPLATE_ID = defined(TEMPLATE_CATALOG[0]).id;
/** The design of share cards when none is named, chosen for shares on its own. */
export const DEFAULT_SHARE_TEMPLATE_ID = "business-it";

/** A design's number in a list of designs: a whole number from 1, without leading zeros. */
const TEMPLATE_NUMBER = /^[1-9][0-9]*$/u;

/**
 * The design that `idOrNumber` names among those of `kind` (all when undefined): by its id, or by
 * its number in that list, from 1; the first when none is named. Undefined when none fits.
 */
export function findTemplate(idOrNumber?: string, kind?: CardKind): CatalogEntry | undefined {
  const available = TEMPLATE_CATALOG.filter((entry) => kind === undefined || entry.kind === kind);
  if (idOrNumber === undefined) return available[0];
  if (typeof idOrNumber !== "string") return undefined;
  return (
    available.find((entry) => entry.id === idOrNumber) ??
    (TEMPLATE_NUMBER.test(idOrNumber) ? available[Number(idOrNumber) - 1] : undefined)
  );
}

/** How a refusal names each kind of card. */
const CARD_KIND_NAMES: Readonly<Record<CardKind, string>> = Object.freeze({
  colors: "color",
});

/** The code of the refusal of cards that no installed design draws, the catalog's own error. */
export type TemplateCatalogErrorCode = "no-card-template";

/**
 * Cards of `kind` that no installed design draws. The message names the kind only: a front end
 * adds how its person chooses another kind, such as the command line's form numbers.
 */
export class NoCardTemplateError extends Error {
  readonly code: TemplateCatalogErrorCode = "no-card-template";
  readonly kind: CardKind | undefined;

  constructor(kind: CardKind | undefined) {
    super(
      kind === undefined
        ? "No card template is installed."
        : `No installed card template supports ${CARD_KIND_NAMES[kind]} cards yet.`,
    );
    this.name = "NoCardTemplateError";
    this.kind = kind;
  }
}

/** The design that `idOrNumber` names (findTemplate); refuses a kind without designs, or no fit. */
export function resolveTemplateId(idOrNumber?: string, kind?: CardKind): CatalogEntry {
  if (findTemplate(undefined, kind) === undefined) throw new NoCardTemplateError(kind);
  const found = findTemplate(idOrNumber, kind);
  if (found === undefined)
    throw ERRORS.create("card-template-unknown-incompatible-list-available-preview-templates", []);
  return found;
}

/** The design drawn in `style`, or undefined for a text that names no style. */
export function designOfStyle(style: string): CatalogEntry | undefined {
  return TEMPLATE_CATALOG.find((entry) => entry.style === style);
}
