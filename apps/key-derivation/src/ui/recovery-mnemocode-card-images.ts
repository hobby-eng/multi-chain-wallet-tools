import {
  readCardPages,
  type CardImage,
  type CardPageDrawing,
  type DrawingStep,
  type PathSegment,
} from '@ckd/recovery-backup/mnemocode-card-drawing.js';
import { MNEMOCODE_CARD_IMAGE_DPI } from '@ckd/recovery-backup/mnemocode-cards.js';

/**
 * Draws the pages of a card PDF on a canvas and saves each one as a PNG image.
 *
 * Paper that the card does not paint, such as the corners outside its rounded edge,
 * stays transparent.
 */

const POINTS_PER_INCH = 72;
const PIXELS_PER_POINT = MNEMOCODE_CARD_IMAGE_DPI / POINTS_PER_INCH;
// A PDF draws a line of width zero as the thinnest line of the device: one pixel.
const THINNEST_LINE = 1 / PIXELS_PER_POINT;

type Context = CanvasRenderingContext2D;
type Picture = HTMLCanvasElement | ImageBitmap;

function newCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: Context } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser cannot draw images. Save the cards as PDF.');
  return { canvas, context };
}

/** Releases the pixels of a canvas; they show recovery material. */
function discard(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

const READ_BACK_COLORS = [
  [255, 0, 0],
  [0, 128, 255],
  [17, 17, 17],
  [250, 250, 250],
] as const;

/**
 * Some privacy settings make a browser return slightly changed pixels from a canvas.
 * A card saved that way would carry noise, so the export stops before it draws.
 */
function assertCanvasReadsBack(): void {
  const { canvas, context } = newCanvas(READ_BACK_COLORS.length, 1);
  try {
    for (const [index, [red, green, blue]] of READ_BACK_COLORS.entries()) {
      context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      context.fillRect(index, 0, 1, 1);
    }
    const pixels = context.getImageData(0, 0, READ_BACK_COLORS.length, 1).data;
    const expected = READ_BACK_COLORS.flatMap((color) => [...color, 255]);
    if (expected.some((value, index) => pixels[index] !== value))
      throw new Error(
        'This browser changes the pixels of saved images, which is a privacy setting against fingerprinting. Save the cards as PDF, or allow this page to read canvas images.',
      );
  } finally {
    discard(canvas);
  }
}

function rgbPicture(image: CardImage): HTMLCanvasElement {
  const { canvas, context } = newCanvas(image.width, image.height);
  const pixels = context.createImageData(image.width, image.height);
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    pixels.data[pixel * 4] = image.data[pixel * 3] ?? 0;
    pixels.data[pixel * 4 + 1] = image.data[pixel * 3 + 1] ?? 0;
    pixels.data[pixel * 4 + 2] = image.data[pixel * 3 + 2] ?? 0;
    pixels.data[pixel * 4 + 3] = image.alpha?.[pixel] ?? 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function picture(image: CardImage): Promise<Picture> {
  if (image.format === 'rgb') return rgbPicture(image);
  // The browser decodes the photograph from memory; nothing is loaded from an address.
  return createImageBitmap(new Blob([new Uint8Array(image.data)], { type: 'image/jpeg' }));
}

function release(source: Picture): void {
  if (source instanceof HTMLCanvasElement) discard(source);
  else source.close();
}

function trace(context: Context, segments: readonly PathSegment[]): void {
  context.beginPath();
  for (const segment of segments) {
    switch (segment.to) {
      case 'move':
        context.moveTo(segment.x, segment.y);
        break;
      case 'line':
        context.lineTo(segment.x, segment.y);
        break;
      case 'curve':
        context.bezierCurveTo(segment.x1, segment.y1, segment.x2, segment.y2, segment.x, segment.y);
        break;
      case 'quadratic':
        context.quadraticCurveTo(segment.x1, segment.y1, segment.x, segment.y);
        break;
      case 'close':
        context.closePath();
        break;
    }
  }
}

function color(step: Extract<DrawingStep, { do: 'fillColor' | 'strokeColor' }>): string {
  const byte = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 255);
  return `rgb(${byte(step.red)}, ${byte(step.green)}, ${byte(step.blue)})`;
}

/** A canvas has one opacity; a PDF has one for filling and one for lines. */
interface Opacity {
  fill: number;
  stroke: number;
}

async function paint(context: Context, page: CardPageDrawing, pictures: Map<CardImage, Picture>): Promise<void> {
  // A PDF measures from the bottom left corner and upwards, a canvas from the top left and downwards.
  context.setTransform(PIXELS_PER_POINT, 0, 0, -PIXELS_PER_POINT, 0, page.height * PIXELS_PER_POINT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  let opacity: Opacity = { fill: 1, stroke: 1 };
  const saved: Opacity[] = [];
  for (const step of page.steps) {
    switch (step.do) {
      case 'save':
        context.save();
        saved.push({ ...opacity });
        break;
      case 'restore':
        context.restore();
        opacity = saved.pop() ?? { fill: 1, stroke: 1 };
        break;
      case 'transform':
        context.transform(...step.matrix);
        break;
      case 'fillColor':
        context.fillStyle = color(step);
        break;
      case 'strokeColor':
        context.strokeStyle = color(step);
        break;
      case 'opacity':
        opacity = { fill: step.fill ?? opacity.fill, stroke: step.stroke ?? opacity.stroke };
        break;
      case 'lineWidth':
        context.lineWidth = step.width > 0 ? step.width : THINNEST_LINE;
        break;
      case 'dash':
        context.setLineDash([...step.pattern]);
        context.lineDashOffset = step.phase;
        break;
      case 'path':
        trace(context, step.segments);
        if (step.fill) {
          context.globalAlpha = opacity.fill;
          context.fill('nonzero');
        }
        if (step.stroke) {
          context.globalAlpha = opacity.stroke;
          context.stroke();
        }
        // A PDF paints a path first and limits the following drawing to it afterwards.
        if (step.clip) context.clip('nonzero');
        break;
      case 'text':
        context.save();
        context.transform(...step.matrix);
        trace(context, step.segments);
        context.globalAlpha = opacity.fill;
        context.fill('nonzero');
        context.restore();
        break;
      case 'image': {
        let source = pictures.get(step.image);
        if (source === undefined) {
          source = await picture(step.image);
          pictures.set(step.image, source);
        }
        context.save();
        // The first row of an image is its top, which a PDF places at the height 1.
        context.transform(1, 0, 0, -1, 0, 1);
        context.globalAlpha = opacity.fill;
        context.drawImage(source, 0, 0, 1, 1);
        context.restore();
        break;
      }
    }
  }
}

function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('The browser could not write the image. Save the cards as PDF.'));
      else blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

async function pageAsPng(page: CardPageDrawing): Promise<Uint8Array> {
  // Whole pixels that the page covers completely, as MnemoCode counts them.
  const { canvas, context } = newCanvas(
    Math.max(1, Math.floor(page.width * PIXELS_PER_POINT)),
    Math.max(1, Math.floor(page.height * PIXELS_PER_POINT)),
  );
  const pictures = new Map<CardImage, Picture>();
  try {
    await paint(context, page, pictures);
    return await pngBytes(canvas);
  } finally {
    for (const source of pictures.values()) release(source);
    discard(canvas);
  }
}

/** One PNG image for every page of the PDF. */
export async function cardPagesAsPng(pdf: Uint8Array): Promise<Uint8Array[]> {
  assertCanvasReadsBack();
  const images: Uint8Array[] = [];
  for (const page of await readCardPages(pdf)) images.push(await pageAsPng(page));
  return images;
}
