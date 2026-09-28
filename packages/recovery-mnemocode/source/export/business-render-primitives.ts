import {
  rgb,
  type PDFFont,
  type PDFPage,
  pushGraphicsState,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
} from 'pdf-lib';
import { MM, type CardBox } from './business-layout.js';
const ink = rgb(0.12, 0.13, 0.14);
const CORNER_RADIUS_HEIGHT_RATIO = 0.055;
// A cubic Bezier approximation of one quarter of a circle: 4 * (sqrt(2) - 1) / 3.
// Keep the historical rounded coefficient to preserve the approved clipping boundary.
const QUARTER_CIRCLE_CONTROL = 0.55228475;
export function fit(
  font: PDFFont,
  text: string,
  preferred: number,
  minimum: number,
  width: number,
  label: string,
): number {
  const unsupported = [...text].find((c) => !font.getCharacterSet().includes(c.codePointAt(0)!));
  if (unsupported !== undefined)
    throw new Error(`${label} contains a character not supported by the card font: ${unsupported}`);
  const size = Math.min(preferred, width / Math.max(font.widthOfTextAtSize(text, 1), 0.001));
  if (size < minimum)
    throw new Error(`${label} is too long to fit legibly on the card; shorten it.`);
  return size;
}

export function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  top: number,
  size: number,
  color = ink,
) {
  // PDF text uses a baseline measured from the bottom. Our layout uses a top
  // offset and one font-size line box; preserving top - size keeps existing
  // typography stable rather than switching to font-dependent ascent metrics.
  page.drawText(value, {
    x: x * MM,
    y: page.getHeight() - top * MM - size,
    size,
    font,
    color,
  });
}

export function clipCard(page: PDFPage, box: CardBox) {
  const x = box.x * MM;
  const y = page.getHeight() - (box.y + box.height) * MM;
  const w = box.width * MM;
  const h = box.height * MM;
  const r = h * CORNER_RADIUS_HEIGHT_RATIO;
  const k = QUARTER_CIRCLE_CONTROL;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + r * k, y, x + w, y + r - r * k, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + r * k, x + w - r + r * k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - r * k, y + h, x, y + h - r + r * k, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - r * k, x + r - r * k, y, x + r, y),
    closePath(),
    clip(),
    endPath(),
  );
}
