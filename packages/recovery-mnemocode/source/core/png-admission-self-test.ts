// The self-test of PNG admission (png-admission.ts): the exact budget of filtered scanline bytes of
// small images, without and with Adam7 interlacing, and the refusals of a second IHDR, data after
// IEND, a palette image without its palette (AUD-022-ARC002) and 16-bit samples. The budgets follow
// the W3C PNG specification (sections 7.2 and 8.1: one filter byte per row, the seven Adam7 passes,
// no rows for an empty pass) and were computed independently, by that formula in Python. The images
// come from synthetic-png.ts: admission inflates nothing, so their data need not be compressed.
// Public synthetic bytes only.
//
// Host-neutral: it imports only core and sskr modules.

import { PngAdmission } from "./png-admission.js";
import { pngChunk, pngHeader, pngImage } from "./synthetic-png.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "./self-test-check.js";

const DATA = pngChunk("IDAT", [0]);
/**
 * A whole ancillary chunk, which admission takes before IEND: after IEND only the rule that IEND
 * comes last refuses it. A single byte there would be refused anyway, as too short for a chunk.
 */
const AFTER_IEND = pngChunk("tEXt", [65]);
/** Image sizes and their budgets: [width, height, depth, color, interlace, filtered bytes]. */
const BUDGETS: readonly (readonly [number, number, number, number, number, number])[] = [
  [1, 1, 8, 6, 0, 5],
  [3, 5, 8, 0, 1, 25],
  [9, 2, 1, 0, 0, 6],
  [9, 9, 8, 0, 1, 100],
];

const REFUSED = /not a valid PNG/u;

/** The quick known answers: budgets, and refusals that a lenient reader would miss. */
function checkPngAdmissionStartup(): void {
  for (const [width, height, depth, color, interlace, filtered] of BUDGETS)
    expectSame(
      PngAdmission.read(pngImage(pngHeader(width, height, depth, color, interlace), DATA))
        .filteredBytes,
      filtered,
      `PNG budget ${width}x${height}${interlace === 1 ? " Adam7" : ""}`,
    );
  expectRefused(
    () => PngAdmission.read(pngImage(pngHeader(1, 1, 8, 0), pngHeader(4097, 1, 8, 0), DATA)),
    REFUSED,
    "PNG second IHDR",
  );
  expectRefused(
    () =>
      PngAdmission.read(Uint8Array.from([...pngImage(pngHeader(1, 1, 8, 0), DATA), ...AFTER_IEND])),
    REFUSED,
    "PNG data after IEND",
  );
  expectRefused(
    () => PngAdmission.read(pngImage(pngHeader(1, 1, 8, 3), DATA)),
    REFUSED,
    "PNG palette image without a palette",
  );
  expectRefused(
    () => PngAdmission.read(pngImage(pngHeader(1, 1, 16, 0), DATA)),
    /bits per sample/u,
    "PNG 16-bit samples",
  );
}

/** The checks of PNG admission, for a host that reads QR code images. */
export const PNG_ADMISSION_SELF_TEST: SelfTestFeature = selfTestFeature({
  name: "PNG admission",
  detail: "scanline budgets with and without Adam7, a second IHDR, data after IEND, 16-bit samples",
  startup: checkPngAdmissionStartup,
  run: checkPngAdmissionStartup,
});
