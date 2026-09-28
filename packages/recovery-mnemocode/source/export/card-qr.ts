import { renderPlatform } from './platform.js';
import { rgb, type PDFPage } from 'pdf-lib';
import { MM } from './business-layout.js';

const QUIET_MODULES = 4;
const MIN_MODULE_MM = 0.4;

/** Physical size includes a white quiet zone on all four sides. */
export function qrSizeMm(payload: string, minimum = 28): number {
  return qrSizeForModuleMm(payload, minimum, MIN_MODULE_MM);
}

export function qrSizeForModuleMm(payload: string, minimum: number, moduleMm: number): number {
  if (!Number.isFinite(moduleMm) || moduleMm <= 0)
    throw new Error('The QR module size must be a positive physical measurement.');
  const qr = renderPlatform().qrModules(payload);
  return Math.max(minimum, (qr.size + QUIET_MODULES * 2) * moduleMm);
}

/** Draw exact data as vector modules, never as part of a decorative bitmap. */
export function drawCollectionQr(
  page: PDFPage,
  payload: string,
  x: number,
  top: number,
  size: number,
  minimumModuleMm = MIN_MODULE_MM,
): void {
  const qr = renderPlatform().qrModules(payload);
  const totalModules = qr.size + QUIET_MODULES * 2;
  if (size / totalModules < minimumModuleMm - 1e-8)
    throw new Error('The QR is too small for this payload; use a larger page.');
  if (
    x < 0 ||
    top < 0 ||
    (x + size) * MM > page.getWidth() + 0.01 ||
    (top + size) * MM > page.getHeight() + 0.01
  )
    throw new Error('The QR does not fit on this page.');
  const pitch = (size * MM) / totalModules;
  const bottom = page.getHeight() - (top + size) * MM;
  page.drawRectangle({
    x: x * MM,
    y: bottom,
    width: size * MM,
    height: size * MM,
    color: rgb(1, 1, 1),
  });
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
