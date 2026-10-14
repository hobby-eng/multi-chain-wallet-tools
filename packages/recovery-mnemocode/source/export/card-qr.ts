// The QR codes of the cards, drawn from the matrix that the host's platform made (QrSource).
import type { QrModules } from "./platform.js";
import { rgb, type PDFPage } from "pdf-lib";
import { MM } from "./business-layout.js";
import { pdfRect } from "./business-render-primitives.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-qr", {
  "qr-module-size-positive-physical-measurement": () =>
    "The QR module size must be a positive physical measurement.",
  "qr-too-small-payload-use-larger-page": () =>
    "The QR is too small for this payload; use a larger page.",
  "qr-does-not-fit-on-page": () => "The QR does not fit on this page.",
});

const QUIET_MODULES = 4;
const MIN_MODULE_MM = 0.4;

/** Physical size of the code `qr` includes a white quiet zone on all four sides. */
export function qrSizeMm(qr: QrModules, minimum = 28): number {
  return qrSizeForModuleMm(qr, minimum, MIN_MODULE_MM);
}

/**
 * The side of the QR code `qr`, quiet zone included, in millimetres for modules `moduleMm` wide,
 * and at least `minimum`; refuses a module size that is not a positive measurement.
 */
export function qrSizeForModuleMm(qr: QrModules, minimum: number, moduleMm: number): number {
  if (!Number.isFinite(moduleMm) || moduleMm <= 0)
    throw ERRORS.create("qr-module-size-positive-physical-measurement", []);
  return Math.max(minimum, (qr.size + QUIET_MODULES * 2) * moduleMm);
}

/** Draw exact data, the code `qr`, as vector modules, never as part of a decorative bitmap. */
export function drawCollectionQr(
  page: PDFPage,
  qr: QrModules,
  x: number,
  top: number,
  size: number,
  minimumModuleMm = MIN_MODULE_MM,
): void {
  const totalModules = qr.size + QUIET_MODULES * 2;
  if (size / totalModules < minimumModuleMm - 1e-8)
    throw ERRORS.create("qr-too-small-payload-use-larger-page", []);
  if (
    x < 0 ||
    top < 0 ||
    (x + size) * MM > page.getWidth() + 0.01 ||
    (top + size) * MM > page.getHeight() + 0.01
  )
    throw ERRORS.create("qr-does-not-fit-on-page", []);
  const pitch = (size * MM) / totalModules;
  const plate = pdfRect(page, { x, y: top, width: size, height: size });
  page.drawRectangle({ ...plate, color: rgb(1, 1, 1) });
  const bottom = plate.y;
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.get(row, col)) continue;
      page.drawRectangle({
        x: x * MM + (col + QUIET_MODULES) * pitch,
        y: bottom + (qr.size + QUIET_MODULES - 1 - row) * pitch,
        width: pitch,
        height: pitch,
        color: rgb(0, 0, 0),
      });
    }
  }
}
