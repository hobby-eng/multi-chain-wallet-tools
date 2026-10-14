import {
  readCardPages,
  type CardImage,
  type CardPageDrawing,
  type DrawingStep,
  type GraphicsSettings,
  type PathSegment,
} from "../../../../packages/recovery-mnemocode/source/export/card-drawing.js";
import type { MnemoCodeCardImageFormat } from "@ckd/recovery-backup/mnemocode-cards.js";
import {
  JPEG_QUALITY,
  PIXELS_PER_POINT,
  coveredPixels,
} from "../../../../packages/recovery-mnemocode/source/export/document-formats.js";

/**
 * Draws the pages of a card PDF on a canvas and saves each one as a PNG or JPEG image.
 *
 * Paper that the card does not paint, such as the corners outside its rounded edge,
 * stays transparent in PNG and is white in JPEG.
 */

// A PDF draws a line of width zero as the thinnest line of the device: one pixel.
const THINNEST_LINE = 1 / PIXELS_PER_POINT;

type Context = CanvasRenderingContext2D;
type Picture = HTMLCanvasElement | ImageBitmap;

function assertCurrent(current: () => boolean): void {
  if (!current()) throw new Error("The card inputs changed while the image was drawn.");
}

function newCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: Context } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("This browser cannot draw images. Save the cards as PDF.");
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
        "This browser changes the pixels of saved images, which is a privacy setting against fingerprinting. Save the cards as PDF, or allow this page to read canvas images.",
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
  if (image.format === "rgb") return rgbPicture(image);
  // The browser decodes the photograph from memory; nothing is loaded from an address.
  return createImageBitmap(new Blob([new Uint8Array(image.data)], { type: "image/jpeg" }));
}

function release(source: Picture): void {
  if (source instanceof HTMLCanvasElement) discard(source);
  else source.close();
}

function trace(context: Context, segments: readonly PathSegment[]): void {
  context.beginPath();
  for (const segment of segments) {
    switch (segment.to) {
      case "move":
        context.moveTo(segment.x, segment.y);
        break;
      case "line":
        context.lineTo(segment.x, segment.y);
        break;
      case "curve":
        context.bezierCurveTo(segment.x1, segment.y1, segment.x2, segment.y2, segment.x, segment.y);
        break;
      case "quadratic":
        context.quadraticCurveTo(segment.x1, segment.y1, segment.x, segment.y);
        break;
      case "close":
        context.closePath();
        break;
    }
  }
}

function color(step: Extract<DrawingStep, { do: "fillColor" | "strokeColor" }>): string {
  const byte = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 255);
  return `rgb(${byte(step.red)}, ${byte(step.green)}, ${byte(step.blue)})`;
}

/** A canvas has one opacity; a PDF has one for filling and one for lines (its graphics state). */
type Opacity = Required<Pick<GraphicsSettings, "fill" | "stroke">>;
/** A page starts, and a restore without a matching save returns, fully opaque. */
const FULL_OPACITY: Opacity = Object.freeze({ fill: 1, stroke: 1 });

/** The value of `key` in `cache`, made by `make` the first time it is asked for. */
async function readOnce<Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
  make: (key: Key) => Promise<Value>,
): Promise<Value> {
  const known = cache.get(key);
  if (known !== undefined) return known;
  const made = await make(key);
  cache.set(key, made);
  return made;
}

async function paint(
  context: Context,
  page: CardPageDrawing,
  pictures: Map<CardImage, Picture>,
  current: () => boolean,
): Promise<void> {
  // A PDF measures from the bottom left corner and upwards, a canvas from the top left and downwards.
  context.setTransform(
    PIXELS_PER_POINT,
    0,
    0,
    -PIXELS_PER_POINT,
    0,
    page.height * PIXELS_PER_POINT,
  );
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  let opacity: Opacity = FULL_OPACITY;
  const saved: Opacity[] = [];
  for (const step of page.steps) {
    assertCurrent(current);
    switch (step.do) {
      case "save":
        context.save();
        saved.push({ ...opacity });
        break;
      case "restore":
        context.restore();
        opacity = saved.pop() ?? FULL_OPACITY;
        break;
      case "transform":
        context.transform(...step.matrix);
        break;
      case "fillColor":
        context.fillStyle = color(step);
        break;
      case "strokeColor":
        context.strokeStyle = color(step);
        break;
      case "graphicsState":
        opacity = { fill: step.fill ?? opacity.fill, stroke: step.stroke ?? opacity.stroke };
        // The canvas keeps the blend with save and restore, like the PDF graphics state.
        if (step.blend !== undefined)
          context.globalCompositeOperation = step.blend === "color" ? "color" : "source-over";
        break;
      case "lineWidth":
        context.lineWidth = step.width > 0 ? step.width : THINNEST_LINE;
        break;
      case "dash":
        context.setLineDash([...step.pattern]);
        context.lineDashOffset = step.phase;
        break;
      case "path":
        trace(context, step.segments);
        if (step.fill) {
          context.globalAlpha = opacity.fill;
          context.fill("nonzero");
        }
        if (step.stroke) {
          context.globalAlpha = opacity.stroke;
          context.stroke();
        }
        // A PDF paints a path first and limits the following drawing to it afterwards.
        if (step.clip) context.clip(step.clipRule);
        break;
      case "text":
        context.save();
        context.transform(...step.matrix);
        trace(context, step.segments);
        context.globalAlpha = opacity.fill;
        context.fill("nonzero");
        context.restore();
        break;
      case "image": {
        const source = await readOnce(pictures, step.image, picture);
        // The cached picture is released by pageAsImage even when its asynchronous decode is late.
        assertCurrent(current);
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

/** The image kinds a card is saved as, as MnemoCode's command line writes them. */
const IMAGE_TYPES: Readonly<Record<MnemoCodeCardImageFormat, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
};
/** MnemoCode's JPEG quality (its image export: pdftocairo -jpegopt quality=90). */

function imageBytes(
  canvas: HTMLCanvasElement,
  format: MnemoCodeCardImageFormat,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null)
          reject(new Error("The browser could not write the image. Save the cards as PDF."));
        else blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      IMAGE_TYPES[format],
      format === "jpg" ? JPEG_QUALITY / 100 : undefined,
    );
  });
}

async function pageAsImage(
  page: CardPageDrawing,
  format: MnemoCodeCardImageFormat,
  current: () => boolean,
): Promise<Uint8Array> {
  assertCurrent(current);
  // Whole pixels that the page covers completely, as MnemoCode counts them.
  const { canvas, context } = newCanvas(coveredPixels(page.width), coveredPixels(page.height));
  // JPEG has no transparency: the paper the card leaves, such as its corners, is white.
  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const pictures = new Map<CardImage, Picture>();
  try {
    await paint(context, page, pictures, current);
    assertCurrent(current);
    const bytes = await imageBytes(canvas, format);
    if (!current()) {
      bytes.fill(0);
      assertCurrent(current);
    }
    return bytes;
  } finally {
    for (const source of pictures.values()) release(source);
    discard(canvas);
  }
}

/**
 * Consumes the PDF into page images under its export's input capture. Partial images are cleared
 * on failure or invalidation; canvases and decoded pictures are released by each page.
 */
export async function cardPagesAsImages(
  pdf: Uint8Array,
  format: MnemoCodeCardImageFormat,
  current: () => boolean = () => true,
): Promise<Uint8Array[]> {
  const images: Uint8Array[] = [];
  try {
    assertCurrent(current);
    assertCanvasReadsBack();
    const pages = await readCardPages(pdf);
    for (const page of pages) {
      assertCurrent(current);
      images.push(await pageAsImage(page, format, current));
    }
    assertCurrent(current);
    return images;
  } catch (cause) {
    for (const image of images) image.fill(0);
    throw cause;
  } finally {
    pdf.fill(0);
  }
}
