import {
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
  popGraphicsState,
  pushGraphicsState,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
} from "pdf-lib";
import { MM, type MmRect } from "./business-layout.js";
import { rgbChannels } from "./color-math.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.business-render-primitives", {
  "contains-character-not-supported-by-card-font": (value0: string, value1: string) =>
    `${value0} contains a character not supported by the card font: ${value1}`,
  "too-long-fit-legibly-on-card-shorten": (value0: string) =>
    `${value0} is too long to fit legibly on the card; shorten it.`,
});

/** The dark ink of the business designs' text. */
export const ink = rgb(0.12, 0.13, 0.14);
const CORNER_RADIUS_HEIGHT_RATIO = 0.055;
// A cubic Bezier approximation of one quarter of a circle: 4 * (sqrt(2) - 1) / 3.
// Keep the historical rounded coefficient to preserve the approved clipping boundary.
const QUARTER_CIRCLE_CONTROL = 0.55228475;
/** The least width a text is measured at, so that an empty one never divides by zero. */
const MIN_MEASURED_WIDTH = 0.001;

/**
 * The size, at most `preferred`, at which `text` fits `width` points; refused, naming `label`, when
 * the font lacks one of its characters or it would be smaller than `minimum`. Every family of
 * cards sizes its text through it, each with its own sizes and scale.
 */
export function fit(
  font: PDFFont,
  text: string,
  preferred: number,
  minimum: number,
  width: number,
  label: string,
): number {
  const unsupported = Array.from(text).find(
    (c) => !font.getCharacterSet().includes(defined(c.codePointAt(0))),
  );
  if (unsupported !== undefined)
    throw ERRORS.create("contains-character-not-supported-by-card-font", [
      `${label}`,
      `${unsupported}`,
    ]);
  const size = Math.min(
    preferred,
    width / Math.max(font.widthOfTextAtSize(text, 1), MIN_MEASURED_WIDTH),
  );
  if (size < minimum) throw ERRORS.create("too-long-fit-legibly-on-card-shorten", [`${label}`]);
  return size;
}

/**
 * The PDF baseline of text of `size` points whose line box starts `top` millimetres below the top
 * of `page`. PDF measures from the bottom, the layouts from the top with a line box of one font
 * size; keeping top + size keeps the approved typography rather than switching to the font's
 * ascent. Every family of cards places its text through it.
 */
export function baselineOf(page: PDFPage, top: number, size: number): number {
  return pdfPoint(page, 0, top).y - size;
}

/**
 * `rect`, given in millimetres from the top left of `page`, in PDF points from its bottom left.
 * Every family of cards places its rectangles and images through it.
 */
export function pdfRect(page: PDFPage, rect: MmRect) {
  // PDF places a rectangle by its bottom left corner.
  const { x, y } = pdfPoint(page, rect.x, rect.y + rect.height);
  return { x, y, width: rect.width * MM, height: rect.height * MM };
}

/**
 * The point `x` millimetres from the left and `top` below the top of `page`, in PDF points: the
 * one place that turns the layouts' top-down millimetres into PDF's bottom-up points.
 */
export function pdfPoint(page: PDFPage, x: number, top: number): { x: number; y: number } {
  return { x: x * MM, y: page.getHeight() - top * MM };
}

/** A color #RRGGBB or RRGGBB as pdf-lib draws it. */
export function pdfColor(color: string): RGB {
  return rgb(...rgbChannels(color));
}

/**
 * Draws `value` on `page` in `font` at `size` points, `x` millimetres from the left edge and with
 * its top `top` millimetres from the top, in `color`.
 */
export function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  top: number,
  size: number,
  color = ink,
) {
  page.drawText(value, {
    x: x * MM,
    y: baselineOf(page, top, size),
    size,
    font,
    color,
  });
}

/**
 * `value` centred in `box`, `box.width` millimetres wide from `box.left`, its line box `box.top`
 * below the top of the page, at the size from `preferred` down to `minimum` at which it fits the
 * box (fit, which names `label` when it refuses).
 */
export function centredText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  box: { readonly left: number; readonly top: number; readonly width: number },
  preferred: number,
  minimum: number,
  label: string,
  color = ink,
): void {
  const size = fit(font, value, preferred, minimum, box.width * MM, label);
  const left = box.left + (box.width - font.widthOfTextAtSize(value, size) / MM) / 2;
  text(page, font, value, left, box.top, size, color);
}

/** Starts clipping to the rounded corners of the card in `box`; popGraphicsState ends it. */
function clipCard(page: PDFPage, box: MmRect) {
  const { x, y, width: w, height: h } = pdfRect(page, box);
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

/** The photograph `image` of the card in `box`, clipped to the card's rounded corners. */
export function drawClippedArtwork(page: PDFPage, image: PDFImage, box: MmRect): void {
  clipCard(page, box);
  page.drawImage(image, pdfRect(page, box));
  page.pushOperators(popGraphicsState());
}
