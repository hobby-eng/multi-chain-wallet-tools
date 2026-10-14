// The sheet that tells heirs how to restore a backup (mnemocode encode --heir-sheet): one sheet,
// printed on both sides. The front says what the owner leaves and gives the rest of its room, in
// one block, to a hint written by hand; the back gives the steps and the basics for someone new to
// wallets. It holds no secret; export/heir-sheet-text.ts writes its words, this file only lays
// them out, in A5 or A6, as PDF bytes (renderHeirSheet).
//
// Needs from the host: the bundled font, read through its render platform or CardRenderer, which
// it passes in (export/platform.ts; export/platform-node.ts in Node.js).
// Does not: write the words, save the PDF, or turn it into an image.

import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { MM } from "./business-layout.js";
import { clearDocumentMetadata } from "./document-metadata.js";
import { documentWithFont } from "./pdf-documents.js";
import type { AssetSource } from "./platform.js";
import { pageDimensions } from "./card-settings.js";
import { listInWords } from "../core/places.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.heir-sheet", {
  "instructions-heirs-leave-no-room-hint-on-front": () =>
    "The instructions for heirs leave no room for a hint on the front.",
  "steps-basics-heirs-do-not-fit-on-back": () =>
    "The steps and the basics for heirs do not fit on the back.",
  "size-instructions-heirs": (value0: string) =>
    `The size of the instructions for heirs must be ${value0}.`,
});

/** A part of the back: a heading and its paragraphs. */
export interface HeirSheetSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

/** The words of the sheet, in the order they are printed. */
export interface HeirSheetText {
  readonly title: string;
  readonly subtitle: string;
  readonly newcomer: string;
  /** The heading of what the heirs need, and its items. */
  readonly needsHeading: string;
  readonly needs: readonly string[];
  /** The heading of the owner's hint, and the note under it. */
  readonly hintHeading: string;
  readonly hintNote: string;
  /** The title of the back, and its steps. */
  readonly stepsTitle: string;
  readonly steps: readonly string[];
  /** The heading of what to do when a step does not work, and that paragraph. */
  readonly troubleHeading: string;
  readonly trouble: string;
  readonly warning: string;
  /** What the sheet is, for whoever keeps it; printed under the title. */
  readonly footer: string;
  readonly basicsTitle: string;
  readonly basics: readonly HeirSheetSection[];
}

/** A page size with the type sizes, in points, and the spacing that suit it. */
export interface HeirSheetFormat {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly title: number;
  readonly heading: number;
  readonly body: number;
  readonly small: number;
  /** Space before a heading. */
  readonly gap: number;
  /** Distance of the ruled lines for the hint, wide enough for handwriting. */
  readonly ruling: number;
}

/** The sizes of the sheet, by the names a host takes them by. */
export const HEIR_SHEET_SIZES = Object.freeze(["a5", "a6"] as const);
/** A size of the sheet for heirs (HEIR_SHEET_SIZES). */
export type HeirSheetSize = (typeof HEIR_SHEET_SIZES)[number];
/** The size of the sheet when none is chosen: A5, with larger print. */
export const DEFAULT_HEIR_SHEET_SIZE: HeirSheetSize = "a5";
/** The PDF that the sheet for heirs is saved in by default. */
export const HEIR_SHEET_FILE = "mnemocode-heirs.pdf";

/**
 * The paper of the sheet in millimetres, upright: A5 (ISO 216), the size of a notebook, and A6,
 * the paper of the cards turned upright, the size of a postcard.
 */
export const HEIR_SHEET_MM: Readonly<Record<HeirSheetSize, readonly [number, number]>> =
  Object.freeze({
    a5: pageDimensions("a5", "portrait"),
    a6: pageDimensions("a6", "portrait"),
  });

/** A size of the sheet in the words of the menu and the help, such as "148 x 210 mm". */
export function heirSheetSizeLabel(size: HeirSheetSize): string {
  const [width, height] = HEIR_SHEET_MM[size];
  return `${width} x ${height} mm`;
}

/** A5 portrait, the size of a notebook. */
export const A5: HeirSheetFormat = {
  width: HEIR_SHEET_MM.a5[0] * MM,
  height: HEIR_SHEET_MM.a5[1] * MM,
  margin: 10 * MM,
  title: 14,
  heading: 10.5,
  body: 9,
  small: 7.5,
  gap: 3.5 * MM,
  ruling: 7 * MM,
};

/** A6 portrait, the size of a postcard and of MnemoCode's cards. */
export const A6: HeirSheetFormat = {
  width: HEIR_SHEET_MM.a6[0] * MM,
  height: HEIR_SHEET_MM.a6[1] * MM,
  margin: 5 * MM,
  title: 10.5,
  heading: 7.5,
  body: 6.7,
  small: 6,
  gap: 2 * MM,
  ruling: 6 * MM,
};

/** Line height as a multiple of the font size; dense, as on a printed leaflet. */
const LEADING = 1.22;
/** Space between a heading and its text, and after the paragraphs of the back. */
const SMALL_GAP = 0.8 * MM;
/** Indent of a list item's text, as a multiple of the font size: room for "5." and a space. */
const ITEM_INDENT = 1.5;
/** Fewer ruled lines than this leave no real room for a hint. */
const MIN_HINT_LINES = 4;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.7, 0.7, 0.7);

/** Splits `text` into lines no wider than `width` at `size`; words are never broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * Writes one page from the top down; `y` is the baseline of the last line written. Without a page
 * it only measures.
 */
class Writer {
  /** Where the next line goes, from the bottom of the page; only the methods below move it. */
  #y: number;
  readonly #page: PDFPage | undefined;
  readonly #font: PDFFont;
  readonly #format: HeirSheetFormat;

  constructor(page: PDFPage | undefined, font: PDFFont, format: HeirSheetFormat) {
    this.#page = page;
    this.#font = font;
    this.#format = format;
    this.#y = format.height - format.margin;
  }

  /** The room left above the bottom margin. */
  get room(): number {
    return this.#y - this.#format.margin;
  }

  paragraph(text: string, size: number, color = INK, indent = 0, marker?: string): void {
    const width = this.#format.width - 2 * this.#format.margin - indent;
    const x = this.#format.margin;
    wrap(text, this.#font, size, width).forEach((line, index) => {
      this.#y -= size * LEADING;
      if (index === 0 && marker !== undefined)
        this.#page?.drawText(marker, { x, y: this.#y, size, font: this.#font, color });
      this.#page?.drawText(line, { x: x + indent, y: this.#y, size, font: this.#font, color });
    });
  }

  /** The gap of the format between two parts of the sheet. */
  gap(): void {
    this.space(this.#format.gap);
  }

  /** `amount` points of empty space. */
  space(amount: number): void {
    this.#y -= amount;
  }

  heading(text: string): void {
    this.gap();
    this.paragraph(text, this.#format.heading);
    this.space(SMALL_GAP);
  }

  ruledLines(count: number): void {
    for (let line = 0; line < count; line += 1) {
      this.space(this.#format.ruling);
      this.#page?.drawLine({
        start: { x: this.#format.margin, y: this.#y },
        end: { x: this.#format.width - this.#format.margin, y: this.#y },
        thickness: 0.5,
        color: RULE,
      });
    }
  }
}

/** The front: what the owner leaves, the hint being one block of ruled lines to the foot. */
function writeFront(
  writer: Writer,
  text: HeirSheetText,
  format: HeirSheetFormat,
  hintLines: number,
): void {
  writer.paragraph(text.title, format.title);
  writer.paragraph(text.subtitle, format.small, MUTED);
  writer.paragraph(text.footer, format.small, MUTED);
  writer.paragraph(text.newcomer, format.body);
  writer.heading(text.needsHeading);
  for (const need of text.needs)
    writer.paragraph(need, format.body, INK, ITEM_INDENT * format.body, "-");
  writer.heading(text.hintHeading);
  writer.paragraph(text.hintNote, format.small, MUTED);
  writer.ruledLines(hintLines);
}

/**
 * How many ruled lines fill the room that the front leaves, measured by writing the front once
 * without drawing it. The words are fixed by the program, so a front without room for a hint is a
 * bug in them.
 */
function hintLinesFor(font: PDFFont, text: HeirSheetText, format: HeirSheetFormat): number {
  const trial = new Writer(undefined, font, format);
  writeFront(trial, text, format, 0);
  const lines = Math.floor(trial.room / format.ruling);
  if (lines < MIN_HINT_LINES)
    throw ERRORS.create("instructions-heirs-leave-no-room-hint-on-front", []);
  return lines;
}

function writeSteps(writer: Writer, text: HeirSheetText, format: HeirSheetFormat): void {
  writer.paragraph(text.stepsTitle, format.title);
  text.steps.forEach((step, index) =>
    writer.paragraph(step, format.body, INK, ITEM_INDENT * format.body, `${index + 1}.`),
  );
  writer.heading(text.troubleHeading);
  writer.paragraph(text.trouble, format.body);
  writer.gap();
  writer.paragraph(text.warning, format.heading);
}

function writeBasics(writer: Writer, text: HeirSheetText, format: HeirSheetFormat): void {
  writer.paragraph(text.basicsTitle, format.title);
  for (const section of text.basics) {
    writer.heading(section.heading);
    for (const paragraph of section.paragraphs) {
      writer.paragraph(paragraph, format.body);
      writer.space(SMALL_GAP);
    }
  }
}

/** The back: what to do, the steps first and then the basics. */
function writeBack(writer: Writer, text: HeirSheetText, format: HeirSheetFormat): void {
  writeSteps(writer, text, format);
  writer.gap();
  writeBasics(writer, text, format);
  // The words are fixed by the program, so a back they overflow is a bug in them.
  if (writer.room < 0) throw ERRORS.create("steps-basics-heirs-do-not-fit-on-back", []);
}

/** The layout of each size of the sheet. */
export const HEIR_SHEET_FORMATS: Readonly<Record<HeirSheetSize, HeirSheetFormat>> = Object.freeze({
  a5: A5,
  a6: A6,
});

/** The layout of the size that `value` names, the default one without it; refused otherwise. */
export function parseHeirSheetSize(value: string | undefined): HeirSheetFormat {
  const size = HEIR_SHEET_SIZES.find((known) => known === (value ?? DEFAULT_HEIR_SHEET_SIZE));
  if (size === undefined)
    throw ERRORS.create("size-instructions-heirs", [`${listInWords(HEIR_SHEET_SIZES, "or")}`]);
  return HEIR_SHEET_FORMATS[size];
}

/**
 * Draws the sheet for heirs of `text` in `format`, A5 unless another is given, as a PDF of two
 * pages, its front and its back, without metadata.
 */
export async function renderHeirSheet(
  assets: AssetSource,
  text: HeirSheetText,
  format: HeirSheetFormat = HEIR_SHEET_FORMATS[DEFAULT_HEIR_SHEET_SIZE],
): Promise<Uint8Array> {
  const { doc, font } = await documentWithFont(assets);
  clearDocumentMetadata(doc);
  const size: [number, number] = [format.width, format.height];
  const hintLines = hintLinesFor(font, text, format);
  writeFront(new Writer(doc.addPage(size), font, format), text, format, hintLines);
  writeBack(new Writer(doc.addPage(size), font, format), text, format);
  return doc.save();
}
