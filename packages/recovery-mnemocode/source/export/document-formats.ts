// The files that cards are saved as, a PDF or images of its pages, and the rules that draw an
// image: the resolution, the whole pixels a page covers, the paper of each image format and the
// quality of a JPEG. One source for the command line, which draws images with pdftocairo
// (image-export.ts), and for a page, which draws them itself.
//
// Host-neutral: it imports nothing but how a list is named in words (core/places.ts) and the
// points of an inch (page-units.ts).

import { listInWords } from "../core/places.js";
import { POINTS_PER_INCH } from "./page-units.js";

/** The formats of the files of cards: the PDF first, the default, then the image formats. */
export const DOCUMENT_FORMATS = Object.freeze(["pdf", "png", "jpg"] as const);
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];
/** The image formats, png first as the default. */
export const IMAGE_FORMATS = Object.freeze(
  DOCUMENT_FORMATS.filter((format): format is Exclude<DocumentFormat, "pdf"> => format !== "pdf"),
);
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
/** The format of the files of cards when none is chosen. */
export const DEFAULT_DOCUMENT_FORMAT: DocumentFormat = DOCUMENT_FORMATS[0];
/** The image format when an image is asked for without one. */
export const DEFAULT_IMAGE_FORMAT: ImageFormat = IMAGE_FORMATS[0]!;

/** What each format is, as hosts name and save it. */
export interface DocumentFormatFacts {
  /** Its name, as a list of answers shows it. */
  readonly name: string;
  readonly mimeType: string;
  /** What it is good for, beside its name in a list. */
  readonly note: string;
  /** An image's paper that no card covers, such as a card's rounded corners: kept transparent. */
  readonly transparentPaper: boolean;
  /** The quality of a JPEG, of 100; undefined for the others. */
  readonly qualityPercent?: number;
}

/** The facts of each format. */
export const DOCUMENT_FORMAT_FACTS: Readonly<Record<DocumentFormat, DocumentFormatFacts>> =
  Object.freeze({
    pdf: {
      name: "PDF",
      mimeType: "application/pdf",
      note: "prints at its exact size",
      transparentPaper: false,
    },
    png: {
      name: "PNG",
      mimeType: "image/png",
      note: "sharp text and QR codes",
      transparentPaper: true,
    },
    jpg: {
      name: "JPEG",
      mimeType: "image/jpeg",
      note: "smaller files",
      transparentPaper: false,
      qualityPercent: 90,
    },
  });

/** The quality of a JPEG page, of 100. */
export const JPEG_QUALITY = DOCUMENT_FORMAT_FACTS.jpg.qualityPercent!;
/** Another name of jpg that a person may type. */
const JPEG_ALIAS = "jpeg";

/**
 * The endings of the files that an export writes, without their point: a new folder never takes a
 * name with one, which would look like such a file (FILE_NAME_FOR_FOLDER, cli/output-paths.ts).
 */
export const DOCUMENT_EXTENSIONS: readonly string[] = Object.freeze([
  ...DOCUMENT_FORMATS,
  JPEG_ALIAS,
]);

/** Whether `value` names an image format of IMAGE_FORMATS. */
export function isImageFormat(value: unknown): value is ImageFormat {
  return (IMAGE_FORMATS as readonly unknown[]).includes(value);
}

/** `value` as an image format, jpeg as jpg; undefined gives the default, png. */
export function parseImageFormat(value: string | undefined): ImageFormat {
  if (value === undefined) return DEFAULT_IMAGE_FORMAT;
  if (value === JPEG_ALIAS) return "jpg";
  if (!isImageFormat(value))
    throw new Error(
      `The image format must be one of: ${IMAGE_FORMATS.join(", ")}; ${JPEG_ALIAS} is accepted as an alias.`,
    );
  return value;
}

/** `value` as the format of the files of cards: none, or an empty one, gives the PDF. */
export function parseDocumentFormat(value: string | undefined): DocumentFormat {
  if (value === undefined || value === "" || value === "pdf") return DEFAULT_DOCUMENT_FORMAT;
  if (value === JPEG_ALIAS || isImageFormat(value)) return parseImageFormat(value);
  const names = DOCUMENT_FORMATS.map((format) => DOCUMENT_FORMAT_FACTS[format].name);
  throw new Error(`Select ${listInWords(names, "or")} as the file format.`);
}

// The points of an inch (page-units.ts), here too for the hosts that take it with the formats.
export { POINTS_PER_INCH };
/** The resolution that pages are drawn at as images. */
export const IMAGE_DPI = 300;
/** The pixels of an image that one point of a page takes. */
export const PIXELS_PER_POINT = IMAGE_DPI / POINTS_PER_INCH;

/**
 * Whole pixels that a page of `points` covers completely, at least one. A renderer that rounds the
 * size up covers the last row and column of pixels only in part, which then show the paper as a
 * thin line; rounding down leaves them out.
 */
export function coveredPixels(points: number): number {
  return Math.max(1, Math.floor((points * IMAGE_DPI) / POINTS_PER_INCH));
}
