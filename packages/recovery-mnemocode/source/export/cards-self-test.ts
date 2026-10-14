// The self-test check of the card renderers: one card of each artwork family drawn from the public
// test phrase, on an A6 page, with its embedded font, images and QR code. A host adds it to its
// self-test (core/self-test.ts, SelfTestHost.after) when it offers cards.
//
// From the host it needs its CardRenderer (card-renderer.ts), which the cards are drawn with. It
// writes no file.
//
// Host-neutral: it imports only other export and core modules and pdf-lib.

import { PDFDocument } from "pdf-lib";
import { indexesToColors } from "../core/colors.js";
import { representMnemonic } from "../core/seedshift.js";
import type { SelfTestCheck } from "../core/self-test-check.js";
import { cardTemplates, type CardDrawing } from "./templates.js";
import {
  A6_WIDTH_POINTS,
  SELF_TEST_CARD_DETAILS,
  WIDTH_TOLERANCE_POINTS,
} from "./self-test-cards.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.cards-self-test", {
  "a6-page-count-mismatch": (value0: string) => `${value0} A6 page count mismatch.`,
  "a6-dimensions-mismatch": (value0: string) => `${value0} A6 dimensions mismatch.`,
});

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

async function checkCardExports(drawing: CardDrawing): Promise<void> {
  const colors = indexesToColors(representMnemonic(PUBLIC_MNEMONIC).shiftedIndexes);
  // Mixed covers the seven business artworks. Each material has its own artwork path;
  // exercise each without repeating business styles.
  for (const template of cardTemplates.filter(
    (item) => item.style === "mixed" || item.family !== "business",
  )) {
    // Exercises local images, embedded font, individual-card QR suppression,
    // and the production PDF renderer.
    const bytes = await template.render(drawing, {
      kind: "colors",
      colors,
      payload: colors.join(" "),
      pageSize: "a6",
      orientation: "landscape",
      cardQr: true,
      ...SELF_TEST_CARD_DETAILS,
    });
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() !== 1) throw ERRORS.create("a6-page-count-mismatch", [`${template.id}`]);
    if (Math.abs(pdf.getPage(0).getWidth() - A6_WIDTH_POINTS) > WIDTH_TOLERANCE_POINTS)
      throw ERRORS.create("a6-dimensions-mismatch", [`${template.id}`]);
  }
}

/** The check of the card renderers, drawn with the host's `drawing`, for a host's self-test. */
export function cardExportCheck(drawing: CardDrawing): SelfTestCheck {
  return Object.freeze({
    name: "Card export assets",
    detail: "approved templates, fonts, artwork and single-page A6 PDF",
    run: () => checkCardExports(drawing),
  });
}
