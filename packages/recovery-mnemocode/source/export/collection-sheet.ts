// Draws a collection sheet where collection-layout.ts lays it out: the frame of a design study
// with its heading, footer and QR code, the backdrop, and each card's shadow and caption.

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { MM, type MmRect } from "./business-layout.js";
import { centredText, pdfPoint, pdfRect } from "./business-render-primitives.js";
import { assertCardIndex } from "./card-codes.js";
import { drawCollectionQr } from "./card-qr.js";
import type { QrModules, QrSource } from "./platform.js";
import { type CardSettings, type CardPresentation } from "./card-settings.js";
import { graticule, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "./world-map.js";
import { WORLD_MAP_LAND } from "./world-map-data.js";
import { drawMaterialBackdrop, type MaterialBackdrop } from "./study-backdrops.js";
import { defined } from "../core/defined.js";
import {
  COLLECTION_QR_MODULE_MM,
  collectionSheetLayout,
  MINIMUM_FONT,
  QR_PLATE_MARGIN,
  type StudyBox,
  StudyCaptions,
  type StudyLayout,
  type StudyTheme,
} from "./collection-layout.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.collection-sheet", {
  "missing-design-study-qr-area": () => "Missing design study QR area.",
});

type Color = ReturnType<typeof rgb>;

/** Colours of one sheet. */
interface SheetPalette {
  readonly background: Color;
  /** The grey world map behind the cards, or the backdrop of a material. */
  readonly backdrop: { readonly land: Color; readonly coast: Color } | MaterialBackdrop;
  /** The plate behind the QR code and its border. */
  readonly plate: Color;
  readonly plateBorder: Color;
  /** The heading, and the quieter lines around it. */
  readonly ink: Color;
  readonly muted: Color;
  /** The first line under a card, and the lines below it. */
  readonly caption: Color;
  readonly captionMuted: Color;
  /** The thin edge around a card and the darkness of its shadow. */
  readonly cardEdge: Color;
  readonly shadowOpacity: number;
}

const GRID = {
  color: rgb(0.5, 0.53, 0.58),
  /** The grid is meant to be felt rather than seen. */
  opacity: 0.07,
} as const;

/** The dark page with the grey map, shared by the dark themes; only their ink differs. */
const DARK_PAGE = {
  background: rgb(0.043, 0.047, 0.059),
  backdrop: { land: rgb(0.155, 0.165, 0.19), coast: rgb(0.22, 0.235, 0.265) },
  plate: rgb(0.075, 0.082, 0.1),
  plateBorder: rgb(0.3, 0.33, 0.38),
} as const;

const COOL: SheetPalette = {
  ...DARK_PAGE,
  ink: rgb(0.93, 0.95, 0.97),
  muted: rgb(0.56, 0.61, 0.67),
  caption: rgb(0.88, 0.91, 0.94),
  captionMuted: rgb(0.55, 0.61, 0.67),
  cardEdge: rgb(0.24, 0.28, 0.31),
  shadowOpacity: 0.42,
};

const PALETTES: Readonly<Record<StudyTheme, SheetPalette>> = {
  cool: COOL,
  warm: {
    ...COOL,
    ink: rgb(0.95, 0.91, 0.84),
    muted: rgb(0.66, 0.6, 0.52),
    caption: rgb(0.93, 0.88, 0.8),
    captionMuted: rgb(0.63, 0.55, 0.46),
  },
  noir: { ...COOL, cardEdge: rgb(0.18, 0.22, 0.26), shadowOpacity: 0.5 },
  // The light material pages carry dark ink; their own backdrop covers the background.
  studio: {
    background: rgb(0.86, 0.87, 0.88),
    backdrop: "studio",
    plate: rgb(0.96, 0.965, 0.97),
    plateBorder: rgb(0.5, 0.53, 0.57),
    ink: rgb(0.11, 0.12, 0.14),
    muted: rgb(0.33, 0.36, 0.4),
    caption: rgb(0.11, 0.12, 0.14),
    captionMuted: rgb(0.33, 0.36, 0.4),
    cardEdge: rgb(0.6, 0.63, 0.67),
    shadowOpacity: 0.24,
  },
  concrete: {
    background: rgb(0.8, 0.79, 0.765),
    backdrop: "concrete",
    plate: rgb(0.95, 0.945, 0.93),
    plateBorder: rgb(0.5, 0.49, 0.47),
    ink: rgb(0.13, 0.13, 0.13),
    muted: rgb(0.33, 0.32, 0.3),
    caption: rgb(0.13, 0.13, 0.13),
    captionMuted: rgb(0.31, 0.3, 0.28),
    cardEdge: rgb(0.58, 0.57, 0.55),
    shadowOpacity: 0.26,
  },
  tiled: {
    background: rgb(0.93, 0.92, 0.9),
    backdrop: "tiled",
    plate: rgb(0.97, 0.965, 0.955),
    plateBorder: rgb(0.52, 0.5, 0.47),
    ink: rgb(0.14, 0.15, 0.16),
    muted: rgb(0.35, 0.35, 0.34),
    caption: rgb(0.14, 0.15, 0.16),
    captionMuted: rgb(0.33, 0.33, 0.32),
    cardEdge: rgb(0.55, 0.53, 0.5),
    shadowOpacity: 0.28,
  },
  parquet: {
    background: rgb(0.86, 0.8, 0.71),
    backdrop: "parquet",
    plate: rgb(0.97, 0.95, 0.91),
    plateBorder: rgb(0.52, 0.45, 0.36),
    ink: rgb(0.17, 0.13, 0.1),
    muted: rgb(0.36, 0.29, 0.22),
    caption: rgb(0.17, 0.13, 0.1),
    captionMuted: rgb(0.34, 0.27, 0.2),
    cardEdge: rgb(0.6, 0.53, 0.43),
    shadowOpacity: 0.26,
  },
};

const GRATICULE_STEP_DEGREES = 30;

const GRATICULE = graticule(GRATICULE_STEP_DEGREES);

/** Draws the grey world map, as wide as the page allows and centred a little below the middle. */
function drawWorldMap(
  page: PDFPage,
  colours: { readonly land: Color; readonly coast: Color },
  width: number,
  height: number,
  margin: number,
): void {
  const mapWidth = (width - margin) * MM;
  const scale = mapWidth / WORLD_MAP_WIDTH;
  const mapHeight = WORLD_MAP_HEIGHT * scale;
  const x = (page.getWidth() - mapWidth) / 2;
  // pdf-lib places the top left corner of an SVG path here and draws downwards from it.
  const y = page.getHeight() / 2 + mapHeight / 2 - height * 0.045 * MM;
  for (const path of GRATICULE)
    page.drawSvgPath(path, {
      x,
      y,
      scale,
      borderColor: GRID.color,
      borderWidth: 0.35,
      borderOpacity: GRID.opacity,
    });
  for (const path of WORLD_MAP_LAND)
    page.drawSvgPath(path, {
      x,
      y,
      scale,
      color: colours.land,
      borderColor: colours.coast,
      borderWidth: 0.3,
    });
}

/** A restrained proposal frame surrounds the existing artwork without altering it. */
function drawStudyFrame(
  page: PDFPage,
  font: PDFFont,
  layout: StudyLayout,
  presentation: CardPresentation,
  title: string,
  series: string,
  preparedFor: string,
  code?: QrModules,
  theme: StudyTheme = "cool",
): void {
  const { width, height, compact, metrics } = layout;
  const { margin, fontSize, rows } = metrics;
  const palette = PALETTES[theme];
  const frameInk = palette.ink;
  const frameMuted = palette.muted;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
    color: palette.background,
  });
  if (typeof palette.backdrop === "string")
    drawMaterialBackdrop(page, palette.backdrop, width, height, layout.grid);
  else drawWorldMap(page, palette.backdrop, width, height, margin);

  // A QR code occupies the top right corner. On a sheet the heading stays centred on the page
  // and clear of the code on both sides; a card-sized page only has room beside the code.
  const reserved = layout.qr === undefined ? 0 : layout.qr.size + margin;
  const headingWidth = width - 2 * margin - (compact ? reserved : 2 * reserved);
  const headingLeft = compact ? margin : (width - headingWidth) / 2;
  // The label names the text in the error message when it does not fit.
  const centred = (
    label: string,
    value: string,
    top: number,
    preferred: number,
    color = frameMuted,
  ) =>
    centredText(
      page,
      font,
      value,
      { left: headingLeft, top, width: headingWidth },
      preferred,
      metrics.frameMinimumFont,
      label,
      color,
    );
  // Heading positions are in millimetres from the top edge.
  centred("The studio name or title", title, rows.title, metrics.titleSize, frameInk);
  centred(
    "Study heading",
    "DESIGN STUDY / FOR SELECTION",
    rows.kind,
    fontSize * metrics.headingScale,
  );
  centred(
    "The line with the subtitle and the name",
    compact ? presentation.subtitle : `${presentation.subtitle}  ${preparedForLine(preparedFor)}`,
    rows.subtitle,
    fontSize * metrics.headingScale,
  );
  if (rows.rule !== undefined) {
    const ruleWidth = Math.min(40, headingWidth * 0.4);
    page.drawLine({
      start: pdfPoint(page, (width - ruleWidth) / 2, rows.rule),
      end: pdfPoint(page, (width + ruleWidth) / 2, rows.rule),
      color: frameMuted,
      thickness: 0.4,
      opacity: 0.55,
    });
  }
  // The slogan shares the footer line, where nothing crosses it.
  const footer = [compact ? "" : presentation.slogan, `Series ${series} / 01`, presentation.footer]
    .filter((part) => part !== "")
    .join("   |   ");
  centredText(
    page,
    font,
    footer,
    { left: margin, top: height - metrics.footerBaseline, width: width - 2 * margin },
    fontSize * metrics.footerScale,
    metrics.frameMinimumFont,
    "Study footer",
    frameMuted,
  );
  if (code !== undefined) drawSheetQr(page, font, layout, code, palette);
}

/** The sheet's QR code `code` on its plate in the corner that `layout` keeps, with its caption. */
function drawSheetQr(
  page: PDFPage,
  font: PDFFont,
  layout: StudyLayout,
  code: QrModules,
  palette: SheetPalette,
): void {
  if (!layout.qr) throw ERRORS.create("missing-design-study-qr-area", []);
  const { x, y, size } = layout.qr;
  page.drawRectangle({
    ...pdfRect(page, {
      x: x - QR_PLATE_MARGIN,
      y: y - QR_PLATE_MARGIN,
      width: size + 2 * QR_PLATE_MARGIN,
      height: size + 2 * QR_PLATE_MARGIN,
    }),
    color: palette.plate,
    borderColor: palette.plateBorder,
    borderWidth: 0.4,
    opacity: 0.94,
    borderOpacity: 0.62,
  });
  drawCollectionQr(page, code, x, y, size, COLLECTION_QR_MODULE_MM);
  centredText(
    page,
    font,
    "COLLECTION QR",
    { left: x, top: y + size + 0.3, width: size },
    layout.metrics.fontSize,
    MINIMUM_FONT,
    "QR caption",
    palette.muted,
  );
}

/** The shadow and the thin edge round a card's picture in `box` on a sheet. */
function drawStudyShadow(page: PDFPage, box: MmRect, theme: StudyTheme): void {
  const palette = PALETTES[theme];
  // The shadow falls to the lower right; the edge shows round the card.
  page.drawRectangle({
    ...pdfRect(page, { ...box, x: box.x + 0.45, y: box.y + 0.7 }),
    color: rgb(0, 0, 0),
    opacity: palette.shadowOpacity,
  });
  page.drawRectangle({
    ...pdfRect(page, {
      x: box.x - 0.3,
      y: box.y - 0.3,
      width: box.width + 0.6,
      height: box.height + 0.6,
    }),
    color: palette.cardEdge,
    opacity: 0.88,
  });
}

/**
 * Draws the caption `lines` of the card in `box` of `layout` on `page`, in the colors of `theme`.
 */
export function drawStudyCaption(
  page: PDFPage,
  font: PDFFont,
  layout: StudyLayout,
  box: StudyBox,
  lines: readonly string[],
  theme: StudyTheme = "cool",
): void {
  const palette = PALETTES[theme];
  for (const [i, value] of lines.entries())
    centredText(
      page,
      font,
      value,
      {
        left: box.captionX,
        top: box.captionTop + i * layout.metrics.lineHeight,
        width: box.captionWidth,
      },
      layout.metrics.fontSize,
      MINIMUM_FONT,
      "Study reference",
      i === 0 ? palette.caption : palette.captionMuted,
    );
}

/** What a collection sheet of color cards is made from: a seed phrase's colors, or a share's. */
export interface CollectionContent {
  readonly kind: "colors" | "sskr";
  readonly payload: string;
  readonly title?: string | undefined;
  readonly cardQr?: boolean | undefined;
  /** A share's: the reference of its set, which the sheet names as its series. */
  readonly collectionReference?: string;
  /** A share's: a QR code of the whole share on its sheet. */
  readonly qrCard?: boolean | undefined;
}

/**
 * The series of the cards and sheets of a seed phrase's colors, which has no set to name: every
 * family prints it alike (owner, 2026-10-09).
 */
const PHRASE_SERIES = "01";

/** The series that a card or sheet of `content` names: a share's set, or a seed phrase's one. */
export function collectionSeries(
  content: Pick<CollectionContent, "kind" | "collectionReference">,
): string {
  return content.kind === "sskr" ? defined(content.collectionReference) : PHRASE_SERIES;
}

/** The line that names the person a set of cards is prepared for. */
export function preparedForLine(name: string): string {
  return `Prepared for ${name}`;
}

/**
 * The title and the series that the frame of a collection sheet names: the content's title or
 * the studio's name, and a share's set or the one series of a seed phrase. Every family's sheet
 * is framed with them, through addCollectionPage.
 */
function collectionFrame(
  content: CollectionContent,
  presentation: Pick<CardPresentation, "studioName">,
): { readonly title: string; readonly series: string } {
  return {
    title: content.title ?? presentation.studioName,
    series: collectionSeries(content),
  };
}

/** Whether the sheet holds a share's whole-share QR code, which only `qrCard: true` asks for. */
function wholeShareQr(content: CollectionContent): boolean {
  return content.kind === "sskr" && content.qrCard === true;
}

/**
 * The text of the collection's QR code where the cards ask for one: with `cardQr: true`, or a
 * share's whole-share QR code; undefined otherwise. Only true asks: any other value leaves it out.
 */
export function collectionPayload(content: CollectionContent): string | undefined {
  return content.cardQr === true || wholeShareQr(content) ? content.payload : undefined;
}

/**
 * The separate card that a renderer is asked for: `index`, or undefined, a sheet, where the content
 * asks for a share's whole-share QR code, which only a sheet prints. Every family of cards decides
 * with it whether it draws a separate card or a sheet. An index that is not one of the `count`
 * cards is refused first, also where the sheet is drawn, so that every family answers it alike.
 */
export function separateCardIndex(
  content: CollectionContent,
  index: number | undefined,
  count: number,
): number | undefined {
  if (index !== undefined) assertCardIndex(index, count);
  return wholeShareQr(content) ? undefined : index;
}

/** What drawCollectionStudy draws a family's collection sheet from. */
export interface CollectionStudy {
  readonly doc: PDFDocument;
  readonly font: PDFFont;
  /** The host's QR matrices (CardDrawing), for the code of the sheet where it prints one. */
  readonly qr: QrSource;
  /** The page size and the orientation of the sheet. */
  readonly settings: CardSettings;
  readonly content: CollectionContent;
  readonly presentation: CardPresentation;
  /** The name of the person the sheet is prepared for. */
  readonly preparedFor: string;
  readonly theme: StudyTheme;
  /** The shape of a card's box, width over height. */
  readonly aspect: number;
  /** The lines under each card, in the order of the cards. */
  readonly captions: readonly (readonly string[])[];
  /** Draws card `box.index` in its box, after its shadow and before its caption. */
  readonly paint: (page: PDFPage, box: StudyBox) => void | Promise<void>;
  /** Where the picture of a card lies in its box, which the shadow follows; the box by default. */
  readonly pictureArea?: (box: StudyBox) => MmRect;
}

/**
 * Draws the collection sheet of `study` on a new page: the frame (addCollectionPage), then for each
 * card its shadow, the family's painting and its caption. Every family of cards draws its sheet
 * with it; it returns the layout it drew.
 */
export async function drawCollectionStudy(study: CollectionStudy): Promise<StudyLayout> {
  const { doc, font, content, captions, theme } = study;
  const payload = collectionPayload(content);
  // One matrix for the room that the layout keeps and for the code drawn in it.
  const code = payload === undefined ? undefined : study.qr.qrModules(payload);
  // The captions decide how narrow a column may be, and how many lines they take in it.
  const room = new StudyCaptions(font, captions);
  const layout = collectionSheetLayout(
    study.settings,
    captions.length,
    study.aspect,
    (width, size) => room.lines(width, size),
    code,
    room.minimumWidth,
  );
  const page = addCollectionPage(
    doc,
    font,
    layout,
    content,
    study.presentation,
    study.preparedFor,
    code,
    theme,
  );
  for (const box of layout.cards) {
    drawStudyShadow(page, study.pictureArea?.(box) ?? box, theme);
    await study.paint(page, box);
    const lines = room.wrapped(box.index, box.captionWidth, layout.metrics.fontSize);
    drawStudyCaption(page, font, layout, box, lines, theme);
  }
  return layout;
}

/**
 * A new page of `doc` for the collection sheet of `content`, laid out by `layout`, with its frame
 * drawn: the title and series of collectionFrame, the person it is prepared for, and the QR code
 * `code` where there is one.
 */
function addCollectionPage(
  doc: PDFDocument,
  font: PDFFont,
  layout: StudyLayout,
  content: CollectionContent,
  presentation: CardPresentation,
  preparedFor: string,
  code: QrModules | undefined,
  theme: StudyTheme,
): PDFPage {
  const page = doc.addPage([layout.width * MM, layout.height * MM]);
  const { title, series } = collectionFrame(content, presentation);
  drawStudyFrame(page, font, layout, presentation, title, series, preparedFor, code, theme);
  return page;
}
