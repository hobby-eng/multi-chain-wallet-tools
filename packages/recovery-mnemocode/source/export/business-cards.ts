import { resolveIdentityFor, sectorForTemplate } from './card-identities.js';
import { fit, text, clipCard } from './business-render-primitives.js';
import { businessFields, physicalStyle } from './business-designs.js';
import { readRenderAsset } from './platform.js';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
  popGraphicsState,
} from 'pdf-lib';
export { drawCollectionQr } from './card-qr.js';
import { clearDocumentMetadata } from './document-metadata.js';
import { resolvePresentationFor } from './card-copy.js';
import { colorsToIndexes, unicodeToColors } from '../core.js';
import type { CardContent } from './templates.js';
import type { SskrCardContent } from './sskr-content.js';
import { colorsToShare } from '../sskr/transport.js';
import { businessArtwork } from './business-artwork.js';
import { MM, type CardBox } from './business-layout.js';
import {
  collectionSheetLayout,
  drawStudyCaption,
  drawStudyFrame,
  drawStudyShadow,
} from './collection-sheet.js';
import {
  pageDimensions,
  parsePageSize,
  type BusinessStyle,
  type CardProfile,
  type CardPresentation,
} from './card-settings.js';

const ink = rgb(0.12, 0.13, 0.14);
const white = rgb(1, 1, 1);

type BusinessContent = Exclude<CardContent, { readonly kind: 'unicode' }> | SskrCardContent;

function validateContent(
  content: CardContent | SskrCardContent,
): asserts content is BusinessContent {
  if (content.kind !== 'colors' && content.kind !== 'sskr')
    throw new Error('Business cards require a color representation.');
  const share = content.kind === 'sskr';
  if (share) {
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

const CARD = { width: 90, height: 50 } as const;
type FittedField = ReturnType<typeof businessFields>[number] & { size: number };
interface RenderContext {
  doc: PDFDocument;
  font: PDFFont;
  content: BusinessContent;
  style: BusinessStyle;
  styleOffset: number;
  artwork: (index: number, code: string) => Promise<PDFImage>;
  profile: Required<CardProfile>;
  presentation: CardPresentation;
  fieldsFor: (index: number) => FittedField[];
  fieldColor: (dark: boolean | undefined, index: number) => ReturnType<typeof rgb>;
}

export async function renderBusinessCards(
  style: BusinessStyle,
  content: CardContent | SskrCardContent,
  individualIndex?: number,
  styleOffset = 0,
): Promise<Uint8Array> {
  validateContent(content);
  parsePageSize(content.pageSize);
  const profile = resolveIdentityFor(content, sectorForTemplate(style));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readRenderAsset('fonts/DejaVuSans-UI.ttf'), {
    subset: true,
  });
  const presentation = resolvePresentationFor(content);
  clearDocumentMetadata(doc);
  const fieldColor = (dark: boolean | undefined, index: number) => {
    if (!dark) return white;
    if (physicalStyle(style, index + styleOffset) !== 'curves') return ink;
    const hex = content.colors[index]!;
    const c = [1, 3, 5].map((pos) => parseInt(hex.slice(pos, pos + 2), 16));
    const peak = Math.max(...c, 1);
    return (0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!) / peak > 0.48 ? ink : white;
  };
  const fieldsFor = (index: number) => buildFields(style, styleOffset, profile, font, index);
  // Scoped to one PDF: shared images never retain user data across exports.
  const artworkCache = new Map<string, Promise<PDFImage>>();
  const artwork = (index: number, code: string): Promise<PDFImage> => {
    const design = physicalStyle(style, index + styleOffset);
    const key = `${design}:${code}`;
    let pending = artworkCache.get(key);
    if (!pending) {
      pending = businessArtwork(design, code).then((bytes) => doc.embedPng(bytes));
      artworkCache.set(key, pending);
    }
    return pending;
  };
  const context: RenderContext = {
    artwork,
    doc,
    font,
    content,
    style,
    styleOffset,
    profile,
    presentation,
    fieldsFor,
    fieldColor,
  };
  if (individualIndex !== undefined && !(content.kind === 'sskr' && content.qrCard))
    await renderSingle(context, individualIndex);
  else await renderCollection(context);
  return doc.save();
}

function buildFields(
  style: BusinessStyle,
  styleOffset: number,
  profile: Required<CardProfile>,
  font: PDFFont,
  index: number,
): FittedField[] {
  return businessFields(physicalStyle(style, index + styleOffset), profile).map((field) => ({
    ...field,
    size: fit(
      font,
      field.value,
      field.preferred,
      field.minimum,
      CARD.width * MM * field.width,
      field.label,
    ),
  }));
}

async function renderSingle(context: RenderContext, individualIndex: number): Promise<void> {
  const { doc, font, content, style, styleOffset, presentation, fieldsFor, fieldColor } = context;
  const share = content.kind === 'sskr';
  if (
    !Number.isInteger(individualIndex) ||
    individualIndex < 0 ||
    individualIndex >= content.colors.length
  )
    throw new Error('Invalid card index.');
  const code = content.colors[individualIndex]!.toUpperCase();
  // This document contains only this reference: no collection QR or hidden full payload.
  const page = doc.addPage([90 * MM, 50 * MM]);
  const box = { x: 0, y: 0, width: 90, height: 50, index: individualIndex };
  clipCard(page, box);
  page.drawImage(await context.artwork(individualIndex, code), {
    x: 0,
    y: 0,
    width: 90 * MM,
    height: 50 * MM,
  });
  page.pushOperators(popGraphicsState());
  for (const field of fieldsFor(individualIndex))
    text(
      page,
      font,
      field.value,
      field.x * 90,
      field.y * 50,
      field.size,
      fieldColor(field.dark, individualIndex),
    );
  // Every separate card shows its number and the size of the set, so a missing card is noticed.
  const position = `${String(individualIndex + 1).padStart(2, '0')} / ${String(content.colors.length).padStart(2, '0')}`;
  const reference = share
    ? `${String(individualIndex + 1).padStart(2, '0')} / ${content.colors.length}  ${code.slice(1)}  |  ${content.collectionReference}`
    : `${position}  ${code.slice(1)}`;
  const referenceText = `${presentation.referenceLabel} ${reference}`.trim();
  const design = physicalStyle(style, individualIndex + styleOffset);
  const referenceSize = fit(
    font,
    referenceText,
    design === 'contact' ? 4.6 : 6.3,
    4.2,
    76 * MM,
    'Reference',
  );
  const referenceX =
    design === 'it' ? 55.5 - font.widthOfTextAtSize(referenceText, referenceSize) / MM : 7.2;
  text(
    page,
    font,
    referenceText,
    referenceX,
    46,
    referenceSize,
    ['contact', 'facets'].includes(design) ? ink : rgb(0.84, 0.86, 0.88),
  );
  resizeSinglePage(page, content);
}

async function renderCollection(context: RenderContext): Promise<void> {
  const { doc, font, content, profile, presentation, style } = context;
  const share = content.kind === 'sskr';
  const studyTheme = style === 'it' ? 'noir' : 'cool';
  const payload = content.cardQr || (share && content.qrCard) ? content.payload : undefined;
  const layout = collectionSheetLayout(
    content,
    content.colors.length,
    CARD.width / CARD.height,
    1,
    payload,
  );
  const page = doc.addPage([layout.width * MM, layout.height * MM]);
  drawStudyFrame(
    page,
    font,
    layout,
    presentation,
    content.title ?? presentation.studioName,
    share ? content.collectionReference : '01',
    profile.name,
    payload,
    studyTheme,
  );
  for (const box of layout.cards) {
    await drawCard(context, page, box, studyTheme);
    drawStudyCaption(
      page,
      font,
      layout,
      box,
      [
        `${String(box.index + 1).padStart(2, '0')}  ${content.colors[box.index]!.slice(1).toUpperCase()}`,
      ],
      studyTheme,
    );
  }
}

async function drawCard(
  context: RenderContext,
  page: PDFPage,
  box: CardBox,
  studyTheme: 'cool' | 'noir',
): Promise<void> {
  const { font, content, fieldsFor, fieldColor } = context;
  const code = content.colors[box.index]!.toUpperCase();
  const artwork = await context.artwork(box.index, code);
  drawStudyShadow(page, box, studyTheme);
  clipCard(page, box);
  page.drawImage(artwork, {
    x: box.x * MM,
    y: page.getHeight() - (box.y + box.height) * MM,
    width: box.width * MM,
    height: box.height * MM,
  });
  page.pushOperators(popGraphicsState());
  const scale = box.width / 90;
  for (const field of fieldsFor(box.index))
    text(
      page,
      font,
      field.value,
      box.x + field.x * box.width,
      box.y + field.y * box.height,
      field.size * scale,
      fieldColor(field.dark, box.index),
    );
}

function resizeSinglePage(page: PDFPage, content: BusinessContent): void {
  if (content.pageSize !== undefined || content.orientation !== undefined) {
    const [width, height] = pageDimensions(content.pageSize ?? 'business', content.orientation);
    const scale = Math.min(1, width / 90, height / 50);
    page.scaleContent(scale, scale);
    page.translateContent(((width - 90 * scale) * MM) / 2, ((height - 50 * scale) * MM) / 2);
    page.setSize(width * MM, height * MM);
  }
}
