import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { MM, type CardBox } from './business-layout.js';
import { fit, text } from './business-render-primitives.js';
import { drawCollectionQr, qrSizeForModuleMm } from './card-qr.js';
import {
  pageDimensions,
  parsePageSize,
  type CardSettings,
  type CardPresentation,
} from './card-settings.js';
import { graticule, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from './world-map.js';
import { WORLD_MAP_LAND } from './world-map-data.js';

export interface StudyBox extends CardBox {
  readonly captionTop: number;
  readonly captionWidth: number;
  readonly captionX: number;
}

export interface StudyLayout {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly header: number;
  readonly footer: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly compact: boolean;
  readonly cards: readonly StudyBox[];
  readonly qr?: { readonly x: number; readonly y: number; readonly size: number };
}

export type StudyTheme = 'cool' | 'warm' | 'noir';

const COLLECTION_QR_MODULE_MM = 0.3;

/** A collection is a single design proposal, never a stack of duplex print cards. */
export function collectionSheetLayout(
  settings: CardSettings,
  count: number,
  aspect: number,
  captionLines: number,
  payload?: string,
  minimumCaptionWidth = 0,
): StudyLayout {
  if (!Number.isInteger(count) || count < 1 || count > 16 || aspect <= 0 || captionLines < 1)
    throw new Error('Invalid design study layout.');
  const size = parsePageSize(settings.pageSize);
  if (
    settings.orientation !== undefined &&
    !['portrait', 'landscape'].includes(settings.orientation)
  )
    throw new Error('Orientation must be portrait or landscape.');
  const [width, height] = pageDimensions(size, settings.orientation);
  // Ordinary cards of the business size are separate cards and never come here. The compact
  // sheet exists for the QR card of one Shamir share, which is offered in every size.
  const compact = size === 'business';
  const large = size === 'a4';
  const margin = compact ? 3 : large ? 10 : 5;
  const header = compact ? 11 : large ? 33 : 23;
  const footer = compact ? 4.5 : large ? 13 : 9;
  const fontSize = compact ? 4.3 : large ? 8 : 6;
  const lineHeight = compact ? 2.1 : large ? 4 : 3;
  const gap = compact ? 1.5 : large ? 6 : 3;
  const qrSize = payload === undefined ? 0 : qrSizeForModuleMm(payload, 0, COLLECTION_QR_MODULE_MM);
  const qr =
    payload === undefined
      ? undefined
      : {
          x: width - margin - qrSize,
          y: margin,
          size: qrSize,
        };
  let availableWidth = width - margin * 2;
  let availableHeight = height - header - footer;
  let contentTop = header;
  if (qr) {
    if (qr.x < margin || qr.y + qr.size + lineHeight >= height - footer)
      throw new Error('The QR cannot fit on the design study; choose a larger page size.');
    if (compact && width >= height) {
      // A card-sized page is too low to place the cards below the QR code; they sit beside it.
      availableWidth -= qrSize + gap * 2;
    } else {
      // The cards start below the QR code, so they stay centred under the heading.
      contentTop = Math.max(header, qr.y + qrSize + lineHeight + gap);
      availableHeight = height - contentTop - footer;
    }
  }
  const captionHeight = captionLines * lineHeight + (compact ? 0.6 : 1.2);
  let best:
    | { columns: number; rows: number; cellWidth: number; imageHeight: number; area: number }
    | undefined;
  for (let columns = 1; columns <= Math.min(count, 6); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (availableWidth - (columns - 1) * gap) / columns;
    if (cellWidth < minimumCaptionWidth) continue;
    const imageHeight = Math.min(
      cellWidth / aspect,
      (availableHeight - (rows - 1) * gap) / rows - captionHeight,
    );
    const area = imageHeight * imageHeight * aspect;
    if (imageHeight > 2 && (!best || area > best.area))
      best = { columns, rows, cellWidth, imageHeight, area };
  }
  if (!best) throw new Error('The design study cannot fit legibly; choose a larger page size.');
  const { columns, rows, cellWidth, imageHeight } = best;
  const cellHeight = imageHeight + captionHeight;
  const top = contentTop + (availableHeight - rows * cellHeight - (rows - 1) * gap) / 2;
  const cards = Array.from({ length: count }, (_, index): StudyBox => {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    const captionX =
      margin +
      (availableWidth - rowCount * cellWidth - (rowCount - 1) * gap) / 2 +
      (index % columns) * (cellWidth + gap);
    const y = top + row * (cellHeight + gap);
    const cardWidth = imageHeight * aspect;
    return {
      index,
      x: captionX + (cellWidth - cardWidth) / 2,
      y,
      width: cardWidth,
      height: imageHeight,
      captionX,
      captionWidth: cellWidth,
      captionTop: y + imageHeight + (compact ? 0.5 : 1),
    };
  });
  return {
    width,
    height,
    margin,
    header: contentTop,
    footer,
    fontSize,
    lineHeight,
    compact,
    cards,
    ...(qr === undefined ? {} : { qr }),
  };
}

/** Colours of the sheet. The page and the map are the same for every theme; only the ink differs. */
const SHEET = {
  background: rgb(0.043, 0.047, 0.059),
  land: rgb(0.155, 0.165, 0.19),
  coast: rgb(0.22, 0.235, 0.265),
  grid: rgb(0.5, 0.53, 0.58),
  /** The grid is meant to be felt rather than seen. */
  gridOpacity: 0.07,
  plate: rgb(0.075, 0.082, 0.1),
  plateBorder: rgb(0.3, 0.33, 0.38),
} as const;
const GRATICULE_STEP_DEGREES = 30;
const GRATICULE = graticule(GRATICULE_STEP_DEGREES);

/** Draws the grey world map, as wide as the page allows and centred a little below the middle. */
function drawWorldMap(page: PDFPage, width: number, height: number, margin: number): void {
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
      borderColor: SHEET.grid,
      borderWidth: 0.35,
      borderOpacity: SHEET.gridOpacity,
    });
  for (const path of WORLD_MAP_LAND)
    page.drawSvgPath(path, {
      x,
      y,
      scale,
      color: SHEET.land,
      borderColor: SHEET.coast,
      borderWidth: 0.3,
    });
}

/** A restrained proposal frame surrounds the existing artwork without altering it. */
export function drawStudyFrame(
  page: PDFPage,
  font: PDFFont,
  layout: StudyLayout,
  presentation: CardPresentation,
  title: string,
  series: string,
  preparedFor: string,
  payload?: string,
  theme: StudyTheme = 'cool',
): void {
  const { width, height, margin, compact, fontSize } = layout;
  const warm = theme === 'warm';
  const frameInk = warm ? rgb(0.95, 0.91, 0.84) : rgb(0.93, 0.95, 0.97);
  const frameMuted = warm ? rgb(0.66, 0.6, 0.52) : rgb(0.56, 0.61, 0.67);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
    color: SHEET.background,
  });
  drawWorldMap(page, width, height, margin);

  // A QR code occupies the top right corner. On a sheet the heading stays centred on the page
  // and clear of the code on both sides; a card-sized page only has room beside the code.
  const reserved = layout.qr === undefined ? 0 : layout.qr.size + margin;
  const headingWidth = width - 2 * margin - (compact ? reserved : 2 * reserved);
  const headingCentre = compact ? margin + headingWidth / 2 : width / 2;
  // The label names the text in the error message when it does not fit.
  const centred = (
    label: string,
    value: string,
    top: number,
    preferred: number,
    color = frameMuted,
  ) => {
    const size = fit(font, value, preferred, compact ? 4 : 4.5, headingWidth * MM, label);
    const left = headingCentre - font.widthOfTextAtSize(value, size) / MM / 2;
    text(page, font, value, left, top, size, color);
  };
  // Heading positions are in millimetres from the top edge; an A4 sheet is laid out larger.
  const large = width > 200 || height > 200;
  const rows = compact
    ? { title: 1.8, kind: 5.4, subtitle: 7.5, rule: 0 }
    : large
      ? { title: 9, kind: 18.5, subtitle: 23.5, rule: 28 }
      : { title: 5.5, kind: 12, subtitle: 15.4, rule: 19.4 };
  centred('The studio name or title', title, rows.title, compact ? 8 : large ? 19 : 13, frameInk);
  centred(
    'Study heading',
    'DESIGN STUDY / FOR SELECTION',
    rows.kind,
    compact ? fontSize : fontSize * 0.95,
  );
  centred(
    'The line with the subtitle and the name',
    compact ? presentation.subtitle : `${presentation.subtitle}  Prepared for ${preparedFor}`,
    rows.subtitle,
    compact ? 4.3 : fontSize * 0.95,
  );
  if (!compact) {
    const ruleWidth = Math.min(40, headingWidth * 0.4);
    page.drawLine({
      start: { x: ((width - ruleWidth) / 2) * MM, y: (height - rows.rule) * MM },
      end: { x: ((width + ruleWidth) / 2) * MM, y: (height - rows.rule) * MM },
      color: frameMuted,
      thickness: 0.4,
      opacity: 0.55,
    });
  }
  // The slogan shares the footer line, where nothing crosses it.
  const footer = [compact ? '' : presentation.slogan, `Series ${series} / 01`, presentation.footer]
    .filter((part) => part !== '')
    .join('   |   ');
  const footerSize = fit(
    font,
    footer,
    // A card-sized page already uses the smallest legible size.
    compact ? fontSize : fontSize * 0.9,
    compact ? 4 : 4.5,
    (width - 2 * margin) * MM,
    'Study footer',
  );
  text(
    page,
    font,
    footer,
    (width - font.widthOfTextAtSize(footer, footerSize) / MM) / 2,
    height - (compact ? 3 : large ? 7.5 : 5.2),
    footerSize,
    frameMuted,
  );
  if (payload !== undefined) {
    if (!layout.qr) throw new Error('Missing design study QR area.');
    const { x, y, size } = layout.qr;
    page.drawRectangle({
      x: (x - 0.6) * MM,
      y: (height - y - size - 0.6) * MM,
      width: (size + 1.2) * MM,
      height: (size + 1.2) * MM,
      color: SHEET.plate,
      borderColor: SHEET.plateBorder,
      borderWidth: 0.4,
      opacity: 0.94,
      borderOpacity: 0.62,
    });
    drawCollectionQr(page, payload, x, y, size, COLLECTION_QR_MODULE_MM);
    const caption = 'COLLECTION QR';
    const fs = fit(font, caption, fontSize, 4, size * MM, 'QR caption');
    text(
      page,
      font,
      caption,
      x + (size - font.widthOfTextAtSize(caption, fs) / MM) / 2,
      y + size + 0.3,
      fs,
      frameMuted,
    );
  }
}

export function drawStudyShadow(page: PDFPage, box: CardBox, theme: StudyTheme = 'cool'): void {
  const noir = theme === 'noir';
  page.drawRectangle({
    x: (box.x + 0.45) * MM,
    y: page.getHeight() - (box.y + box.height + 0.7) * MM,
    width: box.width * MM,
    height: box.height * MM,
    color: rgb(0, 0, 0),
    opacity: noir ? 0.5 : 0.42,
  });
  page.drawRectangle({
    x: (box.x - 0.3) * MM,
    y: page.getHeight() - (box.y + box.height + 0.3) * MM,
    width: (box.width + 0.6) * MM,
    height: (box.height + 0.6) * MM,
    color: noir ? rgb(0.18, 0.22, 0.26) : rgb(0.24, 0.28, 0.31),
    opacity: 0.88,
  });
}

export function drawStudyCaption(
  page: PDFPage,
  font: PDFFont,
  layout: StudyLayout,
  box: StudyBox,
  lines: readonly string[],
  theme: StudyTheme = 'cool',
): void {
  const warm = theme === 'warm';
  for (const [i, value] of lines.entries()) {
    const fs = fit(font, value, layout.fontSize, 4, box.captionWidth * MM, 'Study reference');
    text(
      page,
      font,
      value,
      box.captionX + (box.captionWidth - font.widthOfTextAtSize(value, fs) / MM) / 2,
      box.captionTop + i * layout.lineHeight,
      fs,
      i === 0
        ? warm
          ? rgb(0.93, 0.88, 0.8)
          : rgb(0.88, 0.91, 0.94)
        : warm
          ? rgb(0.63, 0.55, 0.46)
          : rgb(0.55, 0.61, 0.67),
    );
  }
}

export function studyCaptionWidth(font: PDFFont, lines: readonly string[]): number {
  return Math.max(...lines.map((line) => font.widthOfTextAtSize(line, 4) / MM)) + 0.1;
}
