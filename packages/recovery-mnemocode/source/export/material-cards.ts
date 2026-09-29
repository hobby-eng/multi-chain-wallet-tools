import { MM } from './business-layout.js';
import { materialPageLayout, materialGridLayout } from './material-layout.js';
import { readRenderAsset } from './platform.js';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFPage,
  type PDFImage,
} from 'pdf-lib';
import { colorsToIndexes, unicodeToColors } from '../core.js';
import { colorsToShare } from '../sskr/transport.js';
import type { CardContent } from './templates.js';
import type { SskrCardContent } from './sskr-content.js';
import { resolveIdentityFor } from './card-identities.js';
import { resolvePresentationFor } from './card-copy.js';
import { clearDocumentMetadata } from './document-metadata.js';
import {
  collectionSheetLayout,
  drawStudyCaption,
  drawStudyFrame,
  drawStudyShadow,
  studyCaptionWidth,
} from './collection-sheet.js';
import {
  chooseMaterialFinish,
  materialArtwork,
  type MaterialFinish,
  type MaterialStyle,
} from './material-artwork.js';
export type MaterialPageSize = 'business' | 'a6' | 'a4';
export interface MaterialCardOptions {
  readonly pageSize?: MaterialPageSize;
  readonly individualIndex?: number;
}
const TYPE_LAYOUT = {
  studioTop: 2.2,
  titleTop: 6,
  ownerTop: 8.7,
  labelsHeight: 4.5,
  referenceOffset: 0.3,
  // Leaves a visible gap below the 5.5 pt reference line, which is 1.94 mm tall.
  finishOffset: 2.6,
  footerInset: 3.2,
  minimumFont: 3.8,
} as const;

function drawSample(
  page: PDFPage,
  image: PDFImage,
  finish: MaterialFinish,
  x: number,
  top: number,
  width: number,
  height: number,
) {
  const [cx, cy, cw, ch] = finish.crop;
  const cropRatio = (image.width * cw) / (image.height * ch);
  const dw = Math.min(width, height * cropRatio);
  const dh = dw / cropRatio;
  const left = (x + (width - dw) / 2) * MM;
  const bottom = page.getHeight() - (top + (height + dh) / 2) * MM;
  page.pushOperators(
    pushGraphicsState(),
    rectangle(left, bottom, dw * MM, dh * MM),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: left - (cx / cw) * dw * MM,
    y: bottom - ((1 - cy - ch) / ch) * dh * MM,
    width: (dw / cw) * MM,
    height: (dh / ch) * MM,
  });
  page.pushOperators(popGraphicsState());
}

type MaterialRenderContext = Awaited<ReturnType<typeof createRenderContext>>;

/** Front: ordered exact references. QR belongs only to a collection study. */
export async function renderMaterialCard(
  style: MaterialStyle,
  content: CardContent | SskrCardContent,
  options: MaterialCardOptions = {},
): Promise<Uint8Array> {
  const context = await createRenderContext(style, content, options);
  if (context.individual === undefined) drawMaterialStudy(context);
  else drawMaterialFront(context);
  return context.doc.save();
}

async function createRenderContext(
  style: MaterialStyle,
  content: CardContent | SskrCardContent,
  options: MaterialCardOptions,
) {
  if (content.kind !== 'colors' && content.kind !== 'sskr')
    throw new Error('Material cards require color references.');
  const share = content.kind === 'sskr';
  if (share) {
    colorsToShare(content.colors.join(' '));
    if (content.payload !== content.colors.join(' '))
      throw new Error('Share QR does not match its references.');
  } else {
    colorsToIndexes(content.colors);
    if (
      content.payload !== content.colors.join(' ') &&
      unicodeToColors(content.payload).join(' ') !== content.colors.join(' ')
    )
      throw new Error('Collection QR does not match its references.');
  }
  if (content.colors.length < 1 || content.colors.length > 16)
    throw new Error('Material cards support at most 16 references.');
  const size = options.pageSize ?? content.pageSize ?? 'business';
  if (!['business', 'a6', 'a4'].includes(size))
    throw new Error('Material page size must be business, a6 or a4.');
  const individual = options.individualIndex;
  if (
    individual !== undefined &&
    (!Number.isInteger(individual) || individual < 0 || individual >= content.colors.length)
  )
    throw new Error('Invalid material card index.');
  const { width, height, portrait, scale } = materialPageLayout(size, content.orientation);
  const artwork = materialArtwork[style];
  const presentation = resolvePresentationFor(content);
  const includeQr = content.cardQr === true || (share && content.qrCard === true);
  const profile = resolveIdentityFor(content);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readRenderAsset('fonts/DejaVuSans-UI.ttf'), {
    subset: true,
  });
  const image = await doc.embedJpg(await readRenderAsset(`images/material-${style}.jpg`));
  const ink = artwork.dark ? rgb(0.94, 0.92, 0.87) : rgb(0.15, 0.16, 0.16);
  const muted = artwork.dark ? rgb(0.73, 0.72, 0.67) : rgb(0.38, 0.38, 0.35);
  clearDocumentMetadata(doc);
  const drawText = (
    page: PDFPage,
    value: string,
    top: number,
    desired: number,
    maxWidth: number,
    center: number,
    subdued = false,
  ) => {
    const supported = font.getCharacterSet();
    if ([...value].some((c) => !supported.includes(c.codePointAt(0)!)))
      throw new Error('Card text contains a character not supported by the font.');
    const fs = Math.min(
      desired * scale,
      (maxWidth * MM) / Math.max(font.widthOfTextAtSize(value, 1), 0.01),
    );
    if (fs < TYPE_LAYOUT.minimumFont * scale)
      throw new Error('Card text is too long to fit legibly; shorten the company or name.');
    page.drawText(value, {
      x: center * MM - font.widthOfTextAtSize(value, fs) / 2,
      // Preserve the one-font-size line box used by the other card renderers.
      y: page.getHeight() - top * MM - fs,
      size: fs,
      font,
      color: subdued ? muted : ink,
    });
  };
  const makePage = () => {
    const p = doc.addPage([width * MM, height * MM]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: p.getWidth(),
      height: p.getHeight(),
      color: rgb(...artwork.background),
    });
    return p;
  };
  return {
    doc,
    font,
    size,
    content,
    individual,
    style,
    width,
    height,
    scale,
    portrait,
    artwork,
    presentation,
    profile,
    image,
    includeQr,
    drawText,
    makePage,
  };
}

function drawMaterialFront(context: MaterialRenderContext): void {
  const {
    content,
    individual,
    style,
    width,
    height,
    scale,
    portrait,
    artwork,
    presentation,
    profile,
    image,
    drawText,
    makePage,
  } = context;
  const page = makePage();
  drawText(
    page,
    presentation.studioName.toUpperCase(),
    TYPE_LAYOUT.studioTop * scale,
    8,
    width - 8 * scale,
    width / 2,
  );
  drawText(page, artwork.title, TYPE_LAYOUT.titleTop * scale, 4.8, width - 8 * scale, width / 2);
  drawText(
    page,
    `Prepared for ${profile.name}`,
    TYPE_LAYOUT.ownerTop * scale,
    4.5,
    width - 8 * scale,
    width / 2,
    true,
  );
  const entries =
    individual === undefined
      ? content.colors.map((code, index) => ({ code, index }))
      : [{ code: content.colors[individual]!, index: individual }];
  const { columns, cellWidth, cellHeight, gap, areaTop } = materialGridLayout(
    width,
    height,
    scale,
    portrait,
    entries.length,
    individual,
  );
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i]!.code.toUpperCase();
    const finish = chooseMaterialFinish(style, code);
    const countThisRow = Math.min(columns, entries.length - Math.floor(i / columns) * columns);
    const centeredStart = (width - (countThisRow * cellWidth + (countThisRow - 1) * gap)) / 2;
    const x = centeredStart + (i % columns) * (cellWidth + gap);
    const top = areaTop + Math.floor(i / columns) * cellHeight;
    const labelsHeight = TYPE_LAYOUT.labelsHeight * scale;
    const imageHeight = cellHeight - labelsHeight;
    drawSample(page, image, finish, x, top, cellWidth, imageHeight);
    // Both captions share the physical center of the image, including incomplete rows.
    drawText(
      page,
      `${String(entries[i]!.index + 1).padStart(2, '0')}  ${code.slice(1)}`,
      top + imageHeight + TYPE_LAYOUT.referenceOffset * scale,
      5.5,
      cellWidth,
      x + cellWidth / 2,
    );
    drawText(
      page,
      finish.name,
      top + imageHeight + TYPE_LAYOUT.finishOffset * scale,
      4.8,
      cellWidth,
      x + cellWidth / 2,
      true,
    );
  }
  drawText(
    page,
    presentation.subtitle,
    height - TYPE_LAYOUT.footerInset * scale,
    4.5,
    width - 8 * scale,
    width / 2,
    true,
  );
}

function drawMaterialStudy(context: MaterialRenderContext): void {
  const { doc, font, content, size, style, image, presentation, profile, includeQr } = context;
  const payload = includeQr ? content.payload : undefined;
  const compact = size === 'business';
  // Compact studies prioritize exact recovery references over decorative finish names.
  const captions = content.colors.map((code, index) => [
    `${String(index + 1).padStart(2, '0')}  ${code.slice(1).toUpperCase()}`,
    ...(compact ? [] : [chooseMaterialFinish(style, code).name]),
  ]);
  const layout = collectionSheetLayout(
    { ...content, pageSize: size },
    content.colors.length,
    1.45,
    compact ? 1 : 2,
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
    'warm',
  );
  for (const box of layout.cards) {
    const code = content.colors[box.index]!.toUpperCase();
    const finish = chooseMaterialFinish(style, code);
    drawStudyShadow(page, box);
    drawSample(page, image, finish, box.x, box.y, box.width, box.height);
    drawStudyCaption(page, font, layout, box, captions[box.index]!);
  }
}
