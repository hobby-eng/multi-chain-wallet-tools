// The self-test of how a set of cards is made (owner, 2026-10-13): the colours of cards that print
// codes, as far apart as the designs show them (card-palette.ts), the brightness that the business
// designs take from a colour (business-tint.ts), the sheets in full rows (collection-layout.ts),
// the decoys after a backup's codes that keep its codes and its QR code (card-decoys.ts), and a
// phrase read back from the codes before its decoys (EncodedForm.leadingCodes); in the full
// self-test, a sheet of a phrase in Unicode codes drawn with its decoys, in a PDF that carries no
// time. A host that offers cards adds it to its self-test (SelfTestHost.features), so that a build
// without cards carries none of it.
//
// The quick checks call none of the renderer's services; the full one draws with the host's
// CardRenderer. Public data only: the colours are computed by an independent reference of the rule
// (scripts/card-palette-reference.py), the OKLab of red is CSS Color 4's.
//
// Host-neutral: it imports only other export and core modules and pdf-lib.

import { PDFDocument } from "pdf-lib";
import { EncodedForm } from "../core/encoded-form.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "../core/self-test-check.js";
import { artworkBrightness } from "./business-tint.js";
import { codeColors } from "./card-palette.js";
import { assertColorCardContent, type ColorCardContent } from "./card-content.js";
import {
  keptCards,
  keptIndividualCards,
  MAX_DECOYS,
  ownCards,
  withDecoyPool,
} from "./card-decoys.js";
import { collectionSheetLayout } from "./collection-layout.js";
import { oklab } from "./color-math.js";
import { plannedCardJob, renderCards } from "./render.js";
import { selectTemplate, type CardDrawing } from "./templates.js";
import { SELF_TEST_CARD_DETAILS } from "./self-test-cards.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-sets-self-test", {
  "set-cards-no-decoy": () => "A set of cards has no decoy.",
});

/**
 * The first colours of every set of cards that print codes, as the independent reference
 * scripts/card-palette-reference.py prints them.
 */
const FIRST_COLORS = "#468080 #060680 #FFFF0D #FF0DFF #800606 #FF490D #0DFFFF #5A47FF";
/** The OKLab of sRGB red that CSS Color 4 publishes, to three decimals. */
const OKLAB_RED = "0.628 0.225 0.126";
/** The Unicode code of the first BIP39 word, "abandon", and of "about" (core/words.ts). */
const ABANDON = "7684";
const ABOUT = "5728";
/** The public phrase "abandon … about" as Unicode codes. */
const PHRASE_CODES = [...Array<string>(11).fill(ABANDON), ABOUT];

/**
 * The quick known answers: the colours of a set and a code printed twice, the brightness of
 * black, white and a mid colour, a sheet in full rows, the decoys of a phrase, the codes before
 * them read back, and the refusals of cards that lose a code.
 */
function checkCardSetsStartup(): void {
  expectSame(
    oklab(1, 0, 0)
      .map((part) => part.toFixed(3))
      .join(" "),
    OKLAB_RED,
    "OKLab of red",
  );
  const codes = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];
  expectSame(codeColors(codes).join(" "), FIRST_COLORS, "Colors of the codes of a set");
  expectSame(codeColors(["C1", "C2", "C1"]).join(" "), "#468080 #060680 #468080", "Same code");
  // 0.35 for black, 1 for a full channel, 0.35 + 0.65 * 0x99 / 255 for #336699.
  expectSame(
    ["#000000", "#FFFFFF", "#336699"].map(artworkBrightness).join(" "),
    "0.35 1 0.74",
    "Brightness of the business artwork",
  );
  // 28 cards of 1.8 on an A6 page turned upright: 4 to a row, 7 full rows.
  const layout = collectionSheetLayout({ pageSize: "a6", orientation: "portrait" }, 28, 1.8, 1);
  expectSame(`${layout.columns}x${layout.rows}`, "4x7", "Sheet in full rows");
  const phrase: ColorCardContent = {
    kind: "colors",
    colors: codeColors(PHRASE_CODES),
    labels: PHRASE_CODES,
    payload: PHRASE_CODES.join(""),
  };
  // A fixed source: every decoy is the code of word 0, which the set colours alike.
  const pool = withDecoyPool(phrase, () => 0);
  expectSame(pool.decoys, MAX_DECOYS, "Decoys of a set");
  expectSame(pool.labels?.at(-1), ABANDON, "Decoy code");
  expectSame(pool.colors.at(-1), pool.colors[0], "Decoy colour");
  const kept = keptCards(pool, 15);
  expectSame(`${ownCards(kept)}+${kept.decoys}`, "12+3", "Decoys kept");
  const individual = keptIndividualCards(pool);
  expectSame(`${ownCards(individual)}+${individual.decoys}`, "12+1", "Separate cards");
  expectSame(individual.labels?.slice(0, 12).join(""), phrase.payload, "Separate real codes");
  assertColorCardContent(kept);
  expectRefused(() => keptCards(pool, 11), /every code of the backup/u, "Cards that lose a code");
  expectRefused(
    () => assertColorCardContent({ ...kept, decoys: 4 }),
    /Expected 12, 15, 18, 21 or 24|does not match/u,
    "Decoys that count a code as one",
  );
  expectSame(
    EncodedForm.of("unicode").leadingCodes([...PHRASE_CODES, ABANDON, ABOUT].join(" "), 12),
    PHRASE_CODES.join(" "),
    "Codes before the decoys",
  );
}

/**
 * Every check: the quick ones, and the A6 sheet of the public phrase in Unicode codes with its
 * decoys, its QR code without them, in a PDF without any document information.
 */
async function checkCardSets(drawing: CardDrawing): Promise<void> {
  checkCardSetsStartup();
  const job = await plannedCardJob(drawing, {
    template: selectTemplate("material-tile", "colors"),
    content: {
      kind: "colors",
      colors: codeColors(PHRASE_CODES),
      labels: PHRASE_CODES,
      payload: PHRASE_CODES.join(""),
      pageSize: "a6",
      cardQr: true,
      ...SELF_TEST_CARD_DETAILS,
    },
  });
  const { content } = job;
  if ((content.decoys ?? 0) < 1) throw ERRORS.create("set-cards-no-decoy", []);
  expectSame(content.labels?.slice(0, 12).join(" "), PHRASE_CODES.join(" "), "Codes of a set");
  expectSame(content.payload, PHRASE_CODES.join(""), "QR code of a set");
  const pdf = await PDFDocument.load(await renderCards(drawing, [job]), {
    updateMetadata: false,
  });
  expectSame(pdf.getPageCount(), 1, "Pages of a set");
  expectSame(pdf.context.trailerInfo.Info, undefined, "Document information of a set");
}

/** The checks of sets of cards, drawn with the host's `drawing`, for a host that offers cards. */
export function cardSetsSelfTest(drawing: CardDrawing): SelfTestFeature {
  return selfTestFeature({
    name: "Card sets",
    detail: "colors of codes, brightness, full rows, decoys, codes before them; undated A6 PDF",
    startup: checkCardSetsStartup,
    run: () => checkCardSets(drawing),
  });
}
