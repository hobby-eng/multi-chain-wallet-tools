import {
  glassPageLayout,
  GLASS_CARD as CARD,
  GLASS_SHEET as SHEET,
  type GlassPageLayout,
} from './glass-layout.js';
import { MM, type CardBox } from './business-layout.js';
import { clipCard } from './business-render-primitives.js';
import { resolveIdentityFor } from './card-identities.js';
import { readRenderAsset } from './platform.js';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  popGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { colorsToIndexes, unicodeToColors } from '../core.js';
import { colorsToShare } from '../sskr/transport.js';
import { resolvePresentationFor } from './card-copy.js';
import { clearDocumentMetadata } from './document-metadata.js';
import type { CardProfile, CardPresentation } from './card-settings.js';
import { glassArtwork } from './glass-artwork.js';
import {
  collectionSheetLayout,
  drawStudyCaption,
  drawStudyFrame,
  drawStudyShadow,
  studyCaptionWidth,
} from './collection-sheet.js';
import type { CardContent } from './templates.js';
import type { SskrCardContent } from './sskr-content.js';

// Physical millimetres in the compact master; text remains vector and is never stretched.
const COMPACT_REFERENCES = {
  left: 3,
  columnPitch: 29,
  businessTop: 30,
  sheetTop: 31,
  businessRowPitch: 4.8,
  sheetRowPitch: 5.3,
  swatchSize: 2.3,
  textOffset: 3.3,
  fontSize: 6.6,
} as const;
const ink = rgb(0.1, 0.12, 0.13);
export const GLASS_REFERENCES_PER_CARD = 4;
export const glassCardCount = (referenceCount: number, referencesPerCard: 4 | 6 | 8 = 4): number =>
  Math.ceil(referenceCount / referencesPerCard);
type GlassContent = Exclude<CardContent, { readonly kind: 'unicode' }> | SskrCardContent;
interface RenderContext {
  doc: PDFDocument;
  font: PDFFont;
  content: GlassContent;
  profile: Required<CardProfile>;
  presentation: CardPresentation;
  count: number;
  referencesPerCard: 4 | 6 | 8;
  cardWidth: number;
  cardHeight: number;
  wholeShareQr: boolean;
}

function validateContent(content: CardContent | SskrCardContent): asserts content is GlassContent {
  if (content.kind !== 'colors' && content.kind !== 'sskr')
    throw new Error('Glass cards require color references.');
  if (content.kind === 'sskr') {
    colorsToShare(content.colors.join(' '));
    if (content.payload !== content.colors.join(' '))
      throw new Error('Share QR does not match the printed references.');
  } else {
    colorsToIndexes(content.colors);
    if (
      content.payload !== content.colors.join(' ') &&
      unicodeToColors(content.payload).join(' ') !== content.colors.join(' ')
    )
      throw new Error('Collection QR does not match the printed references.');
  }
}

function referencesFor(
  content: GlassContent,
  index: number,
  referencesPerCard = GLASS_REFERENCES_PER_CARD,
): readonly string[] {
  const start = index * referencesPerCard;
  return content.colors.slice(start, start + referencesPerCard);
}

function fit(
  font: PDFFont,
  value: string,
  preferred: number,
  width: number,
  minimum = 4.8,
): number {
  const size = Math.min(
    preferred,
    (width * MM) / Math.max(0.001, font.widthOfTextAtSize(value, 1)),
  );
  if (size < minimum) throw new Error('Card contact details are too long; shorten the value.');
  return size;
}

function write(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  top: number,
  size: number,
): void {
  if (!value) return;
  page.drawText(value, {
    x: x * MM,
    // Convert the established top-of-line-box convention to the PDF baseline.
    y: page.getHeight() - top * MM - size,
    font,
    size,
    color: ink,
  });
}

function drawSheetIdentity(context: RenderContext, page: PDFPage, layout: GlassPageLayout): void {
  if (!layout.studioSheet) return;
  const { font, presentation } = context;
  const width = layout.width - 2 * SHEET.side;
  for (const [value, top, preferred] of [
    [presentation.studioName, 3, 11],
    [presentation.slogan, 9, 6.5],
    [presentation.subtitle, 13, 5.8],
    [presentation.footer, layout.height - 7, 5.5],
  ] as const) {
    if (value) write(page, font, value, SHEET.side, top, fit(font, value, preferred, width, 4.5));
  }
}

// Glass cards are light, so their sheet is light as well.
const SHEET_THEME = 'mist';

// Share of the width of a photograph that lies outside the rim of the plate, on each side.
// Measured in the three photographs: 2 to 4 of about 1000 pixels.
const BACKGROUND_BESIDE_PLATE = 0.004;

/**
 * The photographs show a glass plate with rounded corners on a light background. A card is
 * cut along the plate, not along the photograph: the corners are clipped to the rounded
 * shape of every card, and the photograph is drawn a little wider, so that the rim of the
 * plate meets the edge of the card and none of the background is left.
 */
function drawGlassPlate(page: PDFPage, artwork: PDFImage, box: CardBox): void {
  const width = box.width / (1 - 2 * BACKGROUND_BESIDE_PLATE);
  clipCard(page, box);
  page.drawImage(artwork, {
    x: (box.x - (width - box.width) / 2) * MM,
    y: page.getHeight() - (box.y + box.height) * MM,
    width: width * MM,
    height: box.height * MM,
  });
  page.pushOperators(popGraphicsState());
}

async function drawCard(
  context: RenderContext,
  page: PDFPage,
  index: number,
  x: number,
  top: number,
  scale: number,
): Promise<void> {
  const { doc, font, content, profile, count, referencesPerCard, cardWidth, cardHeight } = context;
  const refs = referencesFor(content, index, referencesPerCard);
  const bytes = await glassArtwork(refs, referencesPerCard);
  const artwork = referencesPerCard === 4 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  drawGlassPlate(page, artwork, {
    x,
    y: top,
    width: cardWidth * scale,
    height: cardHeight * scale,
    index,
  });
  if (referencesPerCard !== 4) {
    drawCompactLabels(context, page, index, refs, x, top, scale);
    return;
  }
  const label = (value: string, dx: number, dy: number, size: number) =>
    write(page, font, value, x + dx * scale, top + dy * scale, size * scale);
  label(profile.company, 4, 3.3, fit(font, profile.company, 9, 37));
  label(profile.website, 4, 8, fit(font, profile.website, 5.2, 37));
  label(profile.name, 47, 3.3, fit(font, profile.name, 8.5, 39));
  label(profile.role, 47, 7.4, fit(font, profile.role, 5.8, 39));
  label(profile.email, 47, 10.7, fit(font, profile.email, 5.5, 39));
  label(profile.phone, 47, 13.8, fit(font, profile.phone, 5.2, 39));
  for (const [offset, ref] of refs.entries()) {
    const dx = 4 + (offset % 2) * 33;
    const dy = 35 + Math.floor(offset / 2) * 6;
    const components = [1, 3, 5].map((p) => parseInt(ref.slice(p, p + 2), 16) / 255);
    page.drawRectangle({
      x: (x + dx * scale) * MM,
      y: page.getHeight() - (top + (dy + 2.8) * scale) * MM,
      width: 2.8 * scale * MM,
      height: 2.8 * scale * MM,
      color: rgb(components[0]!, components[1]!, components[2]!),
      borderWidth: 0.3,
      borderColor: rgb(0.85, 0.85, 0.85),
    });
    label(
      `${String(index * GLASS_REFERENCES_PER_CARD + offset + 1).padStart(2, '0')}  ${ref.slice(1)}`,
      dx + 4,
      dy,
      6.8,
    );
  }
  label(
    `${content.kind === 'sskr' ? content.collectionReference : 'Collection reference'}  /  ${String(index + 1).padStart(2, '0')}-${String(count).padStart(2, '0')}`,
    4,
    46.5,
    4.6,
  );
}

/** Compact references stay vector text at a fixed readable size; artwork is decorative. */
function drawCompactLabels(
  context: RenderContext,
  page: PDFPage,
  index: number,
  refs: readonly string[],
  x: number,
  top: number,
  scale: number,
): void {
  const { font, profile, referencesPerCard, cardWidth, cardHeight } = context;
  const label = (value: string, dx: number, dy: number, size: number) =>
    write(page, font, value, x + dx * scale, top + dy * scale, size * scale);
  const right = cardWidth / 2 + 2;
  label(profile.company, 3, 2.7, fit(font, profile.company, 8.2, right - 6));
  label(profile.website, 3, 7, fit(font, profile.website, 5.2, right - 6));
  label(profile.name, right, 2.7, fit(font, profile.name, 8, right - 6));
  label(profile.role, right, 6.8, fit(font, profile.role, 5.5, right - 6));
  label(profile.email, right, 10.2, fit(font, profile.email, 5.2, right - 6));
  label(profile.phone, 3, 10.4, fit(font, profile.phone, 5.2, right - 6));
  const rowGap =
    cardHeight === 50 ? COMPACT_REFERENCES.businessRowPitch : COMPACT_REFERENCES.sheetRowPitch;
  const firstRow = cardHeight === 50 ? COMPACT_REFERENCES.businessTop : COMPACT_REFERENCES.sheetTop;
  for (const [offset, ref] of refs.entries()) {
    const dx = COMPACT_REFERENCES.left + (offset % 2) * COMPACT_REFERENCES.columnPitch;
    const dy = firstRow + Math.floor(offset / 2) * rowGap;
    const components = [1, 3, 5].map((p) => parseInt(ref.slice(p, p + 2), 16) / 255);
    page.drawRectangle({
      x: (x + dx * scale) * MM,
      y: page.getHeight() - (top + (dy + COMPACT_REFERENCES.swatchSize) * scale) * MM,
      width: COMPACT_REFERENCES.swatchSize * scale * MM,
      height: COMPACT_REFERENCES.swatchSize * scale * MM,
      color: rgb(components[0]!, components[1]!, components[2]!),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.25,
    });
    label(
      `${String(index * referencesPerCard + offset + 1).padStart(2, '0')} ${ref.slice(1)}`,
      dx + COMPACT_REFERENCES.textOffset,
      dy,
      COMPACT_REFERENCES.fontSize,
    );
  }
}

/** Ordered references per card. QR belongs only to a collection study. */
export async function renderGlassCards(
  content: CardContent | SskrCardContent,
  individualIndex?: number,
  referencesPerCard: 4 | 6 | 8 = 4,
): Promise<Uint8Array> {
  validateContent(content);
  const wholeShareQr = content.kind === 'sskr' && content.qrCard === true;
  if (![4, 6, 8].includes(referencesPerCard)) throw new Error('Glass capacity must be 4, 6 or 8.');
  const count = glassCardCount(content.colors.length, referencesPerCard);
  // A separate card always has the business size; only a sheet shows the photographs of the
  // 6 and 8 reference cards in their own proportions of 85.6 x 54.
  const businessShape =
    referencesPerCard === 4 || content.pageSize === 'business' || individualIndex !== undefined;
  const cardWidth = businessShape ? 90 : 85.6;
  const cardHeight = businessShape ? 50 : 54;
  if (
    individualIndex !== undefined &&
    (!Number.isInteger(individualIndex) || individualIndex < 0 || individualIndex >= count)
  )
    throw new Error('Invalid glass card index.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readRenderAsset('fonts/DejaVuSans-UI.ttf'), {
    subset: true,
  });
  const context: RenderContext = {
    doc,
    font,
    content,
    count,
    referencesPerCard,
    cardWidth,
    cardHeight,
    wholeShareQr,
    profile: resolveIdentityFor(content, undefined),
    presentation: resolvePresentationFor(content),
  };
  if (individualIndex === undefined || wholeShareQr) {
    await drawGlassStudy(context);
    clearDocumentMetadata(doc);
    return doc.save();
  }
  const layout = glassPageLayout(
    content,
    individualIndex !== undefined,
    cardWidth,
    cardHeight,
    count,
  );
  await drawGlassPages(context, layout, [individualIndex]);
  clearDocumentMetadata(doc);
  return doc.save();
}

async function drawGlassStudy(context: RenderContext): Promise<void> {
  const {
    doc,
    font,
    content,
    profile,
    presentation,
    count,
    referencesPerCard,
    cardWidth,
    cardHeight,
  } = context;
  const payload = content.cardQr || context.wholeShareQr ? content.payload : undefined;
  const captions = Array.from({ length: count }, (_, index) => {
    const refs = referencesFor(content, index, referencesPerCard);
    const lines: string[] = [];
    for (let offset = 0; offset < refs.length; offset += 2)
      lines.push(
        refs
          .slice(offset, offset + 2)
          .map(
            (ref, i) =>
              `${String(index * referencesPerCard + offset + i + 1).padStart(2, '0')} ${ref.slice(1).toUpperCase()}`,
          )
          .join('   '),
      );
    return lines;
  });
  const layout = collectionSheetLayout(
    content,
    count,
    cardWidth / cardHeight,
    Math.ceil(referencesPerCard / 2),
    payload,
    studyCaptionWidth(font, captions.flat()),
  );
  const page = doc.addPage([layout.width * MM, layout.height * MM]);
  drawStudyFrame(
    page,
    font,
    layout,
    presentation,
    content.title ?? presentation.studioName,
    content.kind === 'sskr' ? content.collectionReference : '01',
    profile.name,
    payload,
    SHEET_THEME,
  );
  for (const box of layout.cards) {
    drawStudyShadow(page, box, SHEET_THEME);
    // The photograph is a design sketch; exact ordered references remain independent vector text.
    const refs = referencesFor(content, box.index, referencesPerCard);
    const bytes = await glassArtwork(refs, referencesPerCard);
    const artwork = referencesPerCard === 4 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    drawGlassPlate(page, artwork, box);
    drawStudyCaption(page, font, layout, box, captions[box.index]!, SHEET_THEME);
  }
}

async function drawGlassPages(
  context: RenderContext,
  layout: GlassPageLayout,
  selected: readonly number[],
): Promise<void> {
  const { doc, cardWidth, cardHeight } = context;
  const capacity = layout.columns * layout.rows;
  for (let start = 0; start < selected.length; start += capacity) {
    const indices = selected.slice(start, start + capacity);
    const page = doc.addPage([layout.width * MM, layout.height * MM]);
    drawSheetIdentity(context, page, layout);
    const usedRows = Math.ceil(indices.length / layout.columns);
    const cw = cardWidth * layout.scale;
    const ch = cardHeight * layout.scale;
    const gridHeight = usedRows * ch + (usedRows - 1) * CARD.gap;
    for (const [local, index] of indices.entries()) {
      const row = Math.floor(local / layout.columns);
      const col = local % layout.columns;
      const usedColumns = Math.min(layout.columns, indices.length - row * layout.columns);
      const x =
        (layout.width - (usedColumns * cw + (usedColumns - 1) * CARD.gap)) / 2 +
        col * (cw + CARD.gap);
      const top =
        layout.top + (layout.bottom - layout.top - gridHeight) / 2 + row * (ch + CARD.gap);
      await drawCard(context, page, index, x, top, layout.scale);
    }
  }
}
