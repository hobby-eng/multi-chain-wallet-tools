import { materialSheetShape, renderMaterialCard } from "./material-cards.js";
import type { CardKind } from "../core/types.js";
import type { BusinessStyle } from "./card-settings.js";
import {
  assertSeparateCards,
  drawsSeparateCards,
  resolveTemplateId,
  TEMPLATE_CATALOG,
  type CardFamily,
  type CardStyle,
  type CatalogEntry,
} from "./template-catalog.js";
import { businessSheetShape, renderBusinessCards } from "./business-cards.js";
import {
  pageSizeLabel,
  SEPARATE_CARD_SIZE,
  SHEET_SIZES_TEXT,
  type CardPageSize,
} from "./card-settings.js";
import type { SheetShape } from "./collection-sheet.js";
import { capitalized } from "../core/prose.js";
import type { BusinessArtwork } from "./business-artwork.js";
import type { AssetSource, QrSource, RandomSource } from "./platform.js";
import type { CardContent } from "./backup-cards.js";
import type { ColorCards } from "./card-content.js";

// The kinds of cards are the core's (core/types.ts).
export type { CardKind };

/**
 * What the card renderers draw with: the host's platform, through the parts each family uses (its
 * bundled files, random choices and QR matrices), and the artwork prepared with it. A CardRenderer
 * (card-renderer.ts) is one; every render is given it, and each family asks only for the parts it
 * uses. The renderers pass `randomInt` on alone, so a host's own CardDrawing gives one that is
 * called detached (RandomSource).
 */
export interface CardDrawing extends AssetSource, RandomSource, QrSource {
  readonly businessArtwork: BusinessArtwork;
}

export interface CardTemplate {
  readonly id: string;
  readonly kind: CardKind;
  /**
   * How it draws (TEMPLATE_CATALOG); the employer on business cards follows it (sectorForStyle).
   * A design that a host makes itself may have none, and then suits any employer.
   */
  readonly style?: CardStyle;
  /** The family whose renderer draws it (TEMPLATE_CATALOG); none for a design a host made. */
  readonly family?: CardFamily;
  readonly name: string;
  readonly description: string;
  /** The same renderer is used for preview and ordinary export. */
  readonly render: (drawing: CardDrawing, content: CardContent) => Promise<Uint8Array>;
  readonly renderIndividual?: (
    drawing: CardDrawing,
    content: CardContent,
    index: number,
  ) => Promise<Uint8Array>;
  /**
   * The shape of its sheet of `pageSize` for `content`, from which the decoys after the codes are
   * planned (card-plan.ts). A design that a host makes may have none, and its cards get no decoys.
   */
  readonly sheetShape?: (
    drawing: CardDrawing,
    content: ColorCards,
    pageSize: CardPageSize,
  ) => Promise<SheetShape>;
}

const businessNames: Record<BusinessStyle, string> = {
  architect: "Architecture",
  it: "IT",
  estate: "Property consultant",
  diagonal: "Diagonal city",
  contact: "Light contact blocks",
  curves: "Signature curves",
  facets: "Light geometric",
  mixed: "Mixed design",
};

/**
 * Draws `content` in the design `entry` of the catalog with its family's renderer: the whole
 * document, or the separate card `fragment`, counted from 0, where the design has separate cards
 * (assertSeparateCards). `businessOffset` starts the mixed business style at another of its
 * designs, as the QR cards of shares do by member; the other families have no such choice. The
 * templates below and the share cards (sskr-render.ts) both draw through it, so that a design is
 * drawn the same way from either.
 */
export async function renderCatalogDesign(
  entry: CatalogEntry,
  drawing: CardDrawing,
  content: ColorCards,
  fragment?: number,
  businessOffset = 0,
): Promise<Uint8Array> {
  if (fragment !== undefined) assertSeparateCards(entry);
  switch (entry.family) {
    case "business":
      return renderBusinessCards(drawing, entry.style, content, fragment, businessOffset);
    case "material":
      return renderMaterialCard(drawing, entry.style, content);
  }
}

/** The shape of a sheet of `pageSize` for `content` in the design `entry`, by its family. */
export function catalogSheetShape(
  entry: CatalogEntry,
  drawing: CardDrawing,
  content: ColorCards,
  pageSize: CardPageSize,
): Promise<SheetShape> {
  switch (entry.family) {
    case "business":
      return businessSheetShape(drawing, content);
    case "material":
      return materialSheetShape(drawing, entry.style, content, pageSize);
  }
}

/** What the list of designs says of a design of the catalog, by its family. */
function wordsOf(entry: CatalogEntry): Pick<CardTemplate, "name" | "description"> {
  switch (entry.family) {
    case "business": {
      const { style } = entry;
      return {
        name: `${businessNames[style]} card collection`,
        description:
          style === "mixed"
            ? `One identity across all approved designs; ${SHEET_SIZES_TEXT} sheets or individual cards.`
            : `Editable contact details; ${SHEET_SIZES_TEXT} sheets or individual ${pageSizeLabel(SEPARATE_CARD_SIZE)} cards.`,
      };
    }
    case "material":
      return {
        name: `${capitalized(entry.style)} finish selection`,
        description: `Photographic material samples with finish names and exact references; optional collection QR. ${SHEET_SIZES_TEXT} sheets.`,
      };
  }
}

/** The template of a design of the catalog: its words, and its family's renderer. */
function templateOf(entry: CatalogEntry): CardTemplate {
  const { id, kind, style, family } = entry;
  return {
    id,
    kind,
    style,
    family,
    ...wordsOf(entry),
    render: (drawing, content) => renderCatalogDesign(entry, drawing, content),
    // Only a design with separate cards has them (drawsSeparateCards).
    ...(drawsSeparateCards(entry)
      ? {
          renderIndividual: (drawing: CardDrawing, content: CardContent, index: number) =>
            renderCatalogDesign(entry, drawing, content, index),
        }
      : {}),
    sheetShape: (drawing, content, pageSize) =>
      catalogSheetShape(entry, drawing, content, pageSize),
  };
}

/** Every installed design with its renderer, in the order of the catalog. */
export const cardTemplates: readonly CardTemplate[] = Object.freeze(
  TEMPLATE_CATALOG.map((entry) => Object.freeze(templateOf(entry))),
);

/** The installed designs that draw cards of `kind`, in the order of the catalog. */
export function templatesOfKind(kind: CardKind): readonly CardTemplate[] {
  return cardTemplates.filter((template) => template.kind === kind);
}

/** The number that names `template` among the designs of its kind, from 1 (findTemplate). */
export function templateNumber(template: CardTemplate): number {
  return templatesOfKind(template.kind).indexOf(template) + 1;
}

/** The design that `id`, its id or its number, names among those of `kind` (resolveTemplateId). */
export function selectTemplate(id?: string, kind?: CardKind): CardTemplate {
  const { id: found } = resolveTemplateId(id, kind);
  return cardTemplates.find((template) => template.id === found)!;
}
