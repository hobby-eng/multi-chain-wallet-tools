import { MM, type MmRect } from "./business-layout.js";
import { readRenderAsset } from "./platform.js";
import {
  PDFName,
  type PDFDocument,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  clipEvenOdd,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  setFillingRgbColor,
  setGraphicsState,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import type { CardContent } from "./backup-cards.js";
import type { CardDrawing } from "./templates.js";
import type { SskrCardContent } from "./sskr-content.js";
import { ExportDetails } from "./export-details.js";
import { clearDocumentMetadata } from "./document-metadata.js";
import { drawCollectionStudy } from "./collection-sheet.js";
import { MAX_SHEET_CARDS, type SheetShape } from "./collection-layout.js";
import {
  chooseMaterialSamples,
  materialArtwork,
  TINT_OPACITY,
  type MaterialArtwork,
  type MaterialFinish,
  type MaterialSample,
  type MaterialStyle,
} from "./material-artwork.js";
import { numberedCode } from "./card-codes.js";
import { assertColorCards, EMPTY_CARD_COLLECTION, type ColorCards } from "./card-content.js";
import { pdfRect } from "./business-render-primitives.js";
import { rgbChannels } from "./color-math.js";
import { documentWithFont } from "./pdf-documents.js";
import { type CardPageSize, isCardPageSize, parsePageSize } from "./card-settings.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.material-cards", {
  "empty-card-collection": () => EMPTY_CARD_COLLECTION,
  "material-cards-support-at-most-references": (value0: string) =>
    `Material cards support at most ${value0} references.`,
});

/** The sizes of a material card's page: those of every card (CardPageSize). */
export type MaterialPageSize = CardPageSize;
// The tint layer keeps the photograph's light, texture and highlights ("Color" blend) and takes
// the hue and saturation of the catalogue colour of the sample. It covers only the object in the
// photograph, inside the material's outline; the backdrop, shadows and screws keep their colour.
const TINT_STATE = PDFName.of("MnemoTint");
const tintedPages = new WeakSet<PDFPage>();

/** Registers the "Color" blend state of the tint on `page`, once, and names it. */
function useTintState(page: PDFPage): PDFName {
  if (!tintedPages.has(page)) {
    const state = page.doc.context.obj({ Type: "ExtGState", BM: "Color", ca: TINT_OPACITY });
    page.node.setExtGState(TINT_STATE, page.doc.context.register(state));
    tintedPages.add(page);
  }
  return TINT_STATE;
}

/** The aspect of a finish's crop, width over height. */
function cropAspect(image: PDFImage, finish: MaterialFinish): number {
  const [, , cw, ch] = finish.crop;
  return (image.width * cw) / (image.height * ch);
}

/** Where a sample's photograph lies in a box: as large as fits, centred, in millimetres. */
function sampleArea(image: PDFImage, finish: MaterialFinish, box: MmRect): MmRect {
  const aspect = cropAspect(image, finish);
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

function drawSample(
  page: PDFPage,
  image: PDFImage,
  artwork: MaterialArtwork,
  sample: MaterialSample,
  x: number,
  top: number,
  width: number,
  height: number,
) {
  const [cx, cy, cw, ch] = sample.finish.crop;
  const area = sampleArea(image, sample.finish, { x, y: top, width, height });
  const [dw, dh] = [area.width, area.height];
  const placed = pdfRect(page, area);
  const [left, bottom] = [placed.x, placed.y];
  page.pushOperators(
    pushGraphicsState(),
    rectangle(left, bottom, placed.width, placed.height),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: left - (cx / cw) * dw * MM,
    y: bottom - ((1 - cy - ch) / ch) * dh * MM,
    width: (dw / cw) * MM,
    height: (dh / ch) * MM,
  });
  if (sample.tint !== undefined) {
    const [scale, dx, dy] = sample.finish.outlineFit ?? [1, 0, 0];
    // Outline points are fractions of the crop with y downwards; the page's y runs upwards.
    const at = (ring: readonly number[], i: number) =>
      [
        left + (defined(ring[i]) * scale + dx) * dw * MM,
        bottom + (1 - defined(ring[i + 1]) * scale - dy) * dh * MM,
      ] as const;
    const outline = artwork.catalogue.outline.flatMap((ring) => [
      moveTo(...at(ring, 0)),
      ...Array.from({ length: ring.length / 2 - 1 }, (_, i) => lineTo(...at(ring, 2 * i + 2))),
      closePath(),
    ]);
    const [r, g, b] = rgbChannels(defined(sample.tint));
    page.pushOperators(
      ...outline,
      // Even-odd, so that a hole in the outline, such as a screw, stays untinted.
      clipEvenOdd(),
      endPath(),
      setGraphicsState(useTintState(page)),
      setFillingRgbColor(defined(r), defined(g), defined(b)),
      rectangle(left, bottom, placed.width, placed.height),
      fill(),
    );
  }
  page.pushOperators(popGraphicsState());
}

type MaterialRenderContext = Awaited<ReturnType<typeof createRenderContext>>;

/** What the material cards draw with (CardDrawing): their photographs, font, QR codes, choices. */
type MaterialDrawing = Pick<CardDrawing, "readAsset" | "qrModules" | "randomInt">;

/**
 * A collection study of ordered exact references, with its QR code where asked: a material design
 * is printed on sheets only (drawsSeparateCards).
 */
export async function renderMaterialCard(
  drawing: MaterialDrawing,
  style: MaterialStyle,
  content: CardContent | SskrCardContent,
): Promise<Uint8Array> {
  const context = await createRenderContext(drawing, style, content);
  await drawMaterialStudy(context);
  return context.doc.save();
}

async function createRenderContext(
  drawing: MaterialDrawing,
  style: MaterialStyle,
  content: CardContent | SskrCardContent,
) {
  assertColorCards(content);
  if (content.colors.length === 0) throw ERRORS.create("empty-card-collection", []);
  if (content.colors.length > MAX_SHEET_CARDS)
    throw ERRORS.create("material-cards-support-at-most-references", [`${MAX_SHEET_CARDS}`]);
  // A material design is printed on sheets only: A6 unless another size is asked for.
  const size = parsePageSize(content.pageSize);
  const artwork = materialArtwork[style];
  // Through an export the content carries the details settled for it, which come back unchanged.
  // A material card suits an employer of any sector.
  const { profile, presentation } = ExportDetails.of(drawing.randomInt, content);
  const { doc, font } = await documentWithFont(drawing);
  const image = await embeddedPhotograph(doc, drawing, style);
  // Chosen for all references of the card together, so that no two of them look alike.
  const samples = chooseMaterialSamples(style, content.colors);
  clearDocumentMetadata(doc);
  return {
    qr: drawing,
    doc,
    font,
    size,
    content,
    artwork,
    presentation,
    profile,
    image,
    samples,
  };
}

/**
 * The lines under the first `count` samples of a sheet: each one's number and code, and on a sheet
 * larger than a card the name of its sample. Compact studies keep the exact references and leave
 * out the decorative names.
 */
function studyCaptions(
  content: ColorCards,
  samples: readonly MaterialSample[],
  compact: boolean,
  count: number,
): string[][] {
  return Array.from({ length: count }, (_, index) => [
    numberedCode(content, index),
    ...(compact ? [] : [defined(samples[index]).label]),
  ]);
}

/** The photograph of `style`, embedded in `doc`. */
async function embeddedPhotograph(
  doc: PDFDocument,
  drawing: MaterialDrawing,
  style: MaterialStyle,
): Promise<PDFImage> {
  return doc.embedJpg(await readRenderAsset(drawing, `images/material-${style}.jpg`));
}

/**
 * The shape of a sheet of `pageSize` with the samples of `content` in `style`, which a plan of its
 * decoys lays out (planCollectionSheet): the shape of a sample, and the captions of the first
 * cards, whose samples are chosen for those cards alone, as their sheet chooses them. A material
 * with fewer samples than the distinct codes refuses them.
 */
export async function materialSheetShape(
  drawing: MaterialDrawing,
  style: MaterialStyle,
  content: ColorCards,
  pageSize: CardPageSize,
): Promise<SheetShape> {
  const { doc, font } = await documentWithFont(drawing);
  const image = await embeddedPhotograph(doc, drawing, style);
  const compact = isCardPageSize(pageSize);
  return {
    font,
    aspect: cropAspect(image, defined(materialArtwork[style].finishes[0])),
    captions: (count) => {
      const samples = chooseMaterialSamples(style, content.colors.slice(0, count));
      return studyCaptions(content, samples, compact, count);
    },
  };
}

async function drawMaterialStudy(context: MaterialRenderContext): Promise<void> {
  const { qr, doc, font, content, size, artwork, image, samples, presentation, profile } = context;
  const compact = isCardPageSize(size);
  await drawCollectionStudy({
    doc,
    font,
    qr,
    settings: { ...content, pageSize: size },
    content,
    presentation,
    preparedFor: profile.name,
    theme: artwork.studyTheme,
    // The finishes of one material are cropped alike, so every box takes the shape of a sample.
    aspect: cropAspect(image, defined(artwork.finishes[0])),
    captions: studyCaptions(content, samples, compact, content.colors.length),
    paint: (page, box) =>
      drawSample(
        page,
        image,
        artwork,
        defined(samples[box.index]),
        box.x,
        box.y,
        box.width,
        box.height,
      ),
    pictureArea: (box) => sampleArea(image, defined(samples[box.index]).finish, box),
  });
}
