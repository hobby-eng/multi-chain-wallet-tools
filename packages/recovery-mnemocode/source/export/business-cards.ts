import { ExportDetails } from "./export-details.js";
import { fit, text, ink, drawClippedArtwork } from "./business-render-primitives.js";
import {
  businessDesigns,
  businessFields,
  physicalStyle,
  REFERENCE_MARGIN,
  studyThemeOf,
  type PhysicalBusinessStyle,
  type ReferenceLine,
} from "./business-designs.js";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { clearDocumentMetadata } from "./document-metadata.js";
import type { CardContent } from "./backup-cards.js";
import type { CardDrawing } from "./templates.js";
import type { SskrCardContent } from "./sskr-content.js";
import { MM, separateCardPage, type CardBox } from "./business-layout.js";
import { drawCollectionStudy, separateCardIndex } from "./collection-sheet.js";
import { type SheetShape } from "./collection-layout.js";
import {
  parsePageSize,
  type BusinessStyle,
  type CardProfile,
  type CardPresentation,
  BUSINESS_CARD_MM,
} from "./card-settings.js";
import { numberedCode } from "./card-codes.js";
import { assertColorCards, type ColorCards } from "./card-content.js";
import { peakRelativeLuma } from "./color-math.js";
import { artworkBrightness } from "./business-tint.js";
import { documentWithFont } from "./pdf-documents.js";
import { defined } from "../core/defined.js";

/** The top of the reference line's box on a separate card, in millimetres. */
const REFERENCE_TOP = 46;
/** The least size of the reference line, in points. */
const REFERENCE_MINIMUM_SIZE = 4.2;
/**
 * Above this lightness of the artwork a reference's colour is light enough for the dark ink; below
 * it the curves design writes white on it. The lightness is the hue's (peakRelativeLuma) at the
 * brightness the artwork takes from the reference (artworkBrightness).
 */
const LIGHT_REFERENCE_LUMA = 0.48;

const white = rgb(1, 1, 1);
/** The colours of the reference line's tones. */
const REFERENCE_INKS: Readonly<Record<ReferenceLine["tone"], ReturnType<typeof rgb>>> = {
  dark: ink,
  light: rgb(0.84, 0.86, 0.88),
};

const CARD = BUSINESS_CARD_MM;
type FittedField = ReturnType<typeof businessFields>[number] & { size: number };
/** What the business cards draw with (CardDrawing): their artwork, font, QR codes and choices. */
type BusinessDrawing = Pick<
  CardDrawing,
  "businessArtwork" | "readAsset" | "qrModules" | "randomInt"
>;

interface RenderContext {
  /** The QR matrices of the host, for the sheet's code. */
  qr: BusinessDrawing;
  doc: PDFDocument;
  font: PDFFont;
  content: ColorCards;
  style: BusinessStyle;
  /** The design that card `index` shows, which the mixed style takes in turn. */
  designOf: (index: number) => PhysicalBusinessStyle;
  artwork: (index: number, code: string) => Promise<PDFImage>;
  profile: Required<CardProfile>;
  presentation: CardPresentation;
  fieldsFor: (index: number) => FittedField[];
  fieldColor: (dark: boolean | undefined, index: number) => ReturnType<typeof rgb>;
}

/**
 * Draws the business cards of `content` in `style` as a PDF: the sheet of the whole collection, or
 * with `individualIndex` that one separate card; `styleOffset` turns the mixed design's styles
 * further for each card. Refuses content that is not color cards and a page size that does not
 * exist.
 */
export async function renderBusinessCards(
  drawing: BusinessDrawing,
  style: BusinessStyle,
  content: CardContent | SskrCardContent,
  individualIndex?: number,
  styleOffset = 0,
): Promise<Uint8Array> {
  assertColorCards(content);
  parsePageSize(content.pageSize);
  const separate = separateCardIndex(content, individualIndex, content.colors.length);
  // Through an export the content carries the details settled for it, which come back unchanged.
  const { profile, presentation } = ExportDetails.ofPersonFirst(drawing.randomInt, content, style);
  const { doc, font } = await documentWithFont(drawing);
  clearDocumentMetadata(doc);
  const designOf = (index: number) => physicalStyle(style, index + styleOffset);
  const fieldColor = (dark: boolean | undefined, index: number) => {
    if (!dark) return white;
    if (businessDesigns[designOf(index)].darkFieldInk === "fixed") return ink;
    const color = defined(content.colors[index]);
    const lightness = peakRelativeLuma(color) * artworkBrightness(color);
    return lightness > LIGHT_REFERENCE_LUMA ? ink : white;
  };
  const fieldsFor = (index: number) => buildFields(designOf(index), profile, font);
  // Scoped to one PDF: shared images never retain user data across exports.
  const artworkCache = new Map<string, Promise<PDFImage>>();
  const artwork = (index: number, code: string): Promise<PDFImage> => {
    const design = designOf(index);
    const key = `${design}:${code}`;
    let pending = artworkCache.get(key);
    if (!pending) {
      pending = drawing.businessArtwork
        .recoloured(design, code)
        .then((bytes) => doc.embedPng(bytes));
      artworkCache.set(key, pending);
    }
    return pending;
  };
  const context: RenderContext = {
    qr: drawing,
    artwork,
    doc,
    font,
    content,
    style,
    designOf,
    profile,
    presentation,
    fieldsFor,
    fieldColor,
  };
  if (separate !== undefined) await renderSingle(context, separate);
  else await renderCollection(context);
  return doc.save();
}

function buildFields(
  design: PhysicalBusinessStyle,
  profile: Required<CardProfile>,
  font: PDFFont,
): FittedField[] {
  return businessFields(design, profile).map((field) => ({
    ...field,
    size: fit(
      font,
      field.value,
      field.preferred,
      field.minimum,
      CARD.width * MM * field.width,
      field.label,
    ),
  }));
}

async function renderSingle(context: RenderContext, individualIndex: number): Promise<void> {
  const { doc, font, content, designOf, presentation } = context;
  const share = content.kind === "sskr";
  // This document contains only this reference: no collection QR or hidden full payload.
  const page = doc.addPage([CARD.width * MM, CARD.height * MM]);
  await drawCardFace(context, page, {
    x: 0,
    y: 0,
    width: CARD.width,
    height: CARD.height,
    index: individualIndex,
  });
  // Every separate card shows its number; a share's also the share it belongs to.
  const reference = share
    ? `${numberedCode(content, individualIndex)}  |  ${content.collectionReference}`
    : numberedCode(content, individualIndex);
  const referenceText = `${presentation.referenceLabel} ${reference}`.trim();
  const design = designOf(individualIndex);
  const placement = referencePlacement(font, referenceText, design);
  text(
    page,
    font,
    referenceText,
    placement.x,
    REFERENCE_TOP,
    placement.size,
    REFERENCE_INKS[businessDesigns[design].reference.tone],
  );
  resizeSinglePage(page, content);
}

/**
 * Where the reference line of a separate card of `design` starts, in millimetres, and its size in
 * points (businessDesigns reference). A line that ends early, as the IT design's does clear of its
 * artwork, shrinks to the room between the margin and that end instead of running off the card.
 */
export function referencePlacement(
  font: PDFFont,
  line: string,
  design: PhysicalBusinessStyle,
): { readonly x: number; readonly size: number } {
  const { end, align, preferredSize } = businessDesigns[design].reference;
  const size = fit(
    font,
    line,
    preferredSize,
    REFERENCE_MINIMUM_SIZE,
    (end - REFERENCE_MARGIN) * MM,
    "Reference",
  );
  const x = align === "end" ? end - font.widthOfTextAtSize(line, size) / MM : REFERENCE_MARGIN;
  return { x, size };
}

/** The lines under the first `count` cards of a sheet: each card's number and code. */
function studyCaptions(content: ColorCards, count: number): string[][] {
  return Array.from({ length: count }, (_, index) => [numberedCode(content, index)]);
}

/**
 * The shape of a sheet of business cards of `content`, which a plan of its decoys lays out
 * (planCollectionSheet): the shape of a card, and the captions that its sheet prints.
 */
export async function businessSheetShape(
  drawing: Pick<CardDrawing, "readAsset">,
  content: ColorCards,
): Promise<SheetShape> {
  const { font } = await documentWithFont(drawing);
  return {
    font,
    aspect: CARD.width / CARD.height,
    captions: (count) => studyCaptions(content, count),
  };
}

async function renderCollection(context: RenderContext): Promise<void> {
  const { qr, doc, font, content, profile, presentation, style } = context;
  await drawCollectionStudy({
    doc,
    font,
    qr,
    settings: content,
    content,
    presentation,
    preparedFor: profile.name,
    theme: studyThemeOf(style),
    aspect: CARD.width / CARD.height,
    captions: studyCaptions(content, content.colors.length),
    paint: (page, box) => drawCardFace(context, page, box),
  });
}

/**
 * The face of card `box.index` in `box`: its artwork clipped to the card and the person's details,
 * sized to the box. A separate card and a sheet draw it alike; a sheet adds the shadow and the
 * caption, a separate card its reference line.
 */
async function drawCardFace(context: RenderContext, page: PDFPage, box: CardBox): Promise<void> {
  const { font, content, fieldsFor, fieldColor } = context;
  const code = defined(content.colors[box.index]).toUpperCase();
  drawClippedArtwork(page, await context.artwork(box.index, code), box);
  const scale = box.width / CARD.width;
  for (const field of fieldsFor(box.index))
    text(
      page,
      font,
      field.value,
      box.x + field.x * box.width,
      box.y + field.y * box.height,
      field.size * scale,
      fieldColor(field.dark, box.index),
    );
}

function resizeSinglePage(page: PDFPage, content: ColorCards): void {
  if (content.pageSize !== undefined || content.orientation !== undefined) {
    const { width, height, x, top, scale } = separateCardPage(content, CARD.width, CARD.height);
    page.scaleContent(scale, scale);
    // The card is centred, so its distance from the bottom edge equals `top`.
    page.translateContent(x * MM, top * MM);
    page.setSize(width * MM, height * MM);
  }
}
