// SeedStitch in the Deriver (MnemoCode docs/SEEDSTITCH.md): a phrase masked with MnemoCode's
// Seedshift, hidden in the legend of a cross-stitch pattern made from a picture, and a legend line
// read back into the record of the masked phrase. MnemoCode's WebAssembly makes and reads both and
// refuses what it does not take, in its own words; this module adds the page's input limits and
// the shapes its results take on the page.
import { errorCode } from "@ckd/core/refusal.js";
import { mnemocode, type MnemoCodeBinding } from "./mnemocode-engine.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";

/** The stitches across that a pattern may have, and MnemoCode's own when none is given. */
export const STITCHES_ACROSS = Object.freeze({ min: 40, max: 500, default: 200 });
/** The largest picture file MnemoCode reads; the page checks it before reading the file. */
export const STITCH_PICTURE_BYTES = 40 * 1024 * 1024;
/** What MnemoCode says of a larger file, said by the page before it reads one. */
export const STITCH_PICTURE_TOO_LARGE = "The picture file is larger than 40 MiB.";

/** What a pattern is made of: the phrase and the dates as typed, a picture file and a width. */
export interface StitchRequest {
  readonly phrase: string;
  readonly dates: string;
  /** A PNG or JPEG file; no secret. */
  readonly picture: Uint8Array;
  readonly stitchesAcross: number;
}

/** A pattern made: its legend line and its PDF, and what MnemoCode's command line says of it. */
export interface StitchedPattern {
  /** The legend as a person types it back; with the dates it gives the phrase. */
  readonly legend: string;
  /** Cover, legend and chart pages; it holds the legend too. */
  readonly pdf: Uint8Array;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** The stitches moved to set the counts. */
  readonly moved: number;
  /** How far the pattern is from the picture, seen from a little distance (CIELAB). */
  readonly seenDifference: number;
}

/** A legend line read back: the record of the masked phrase, and the row taken as misread. */
export interface StitchLegendReading {
  /** `MNC1:seedshift:indexes:…`, which Decode reads with the dates like any record. */
  readonly record: string;
  /** The row, from 1, read as the only change of it that gives a phrase. */
  readonly correctedRow: number | undefined;
}

/**
 * The refusals after which MnemoCode's command line asks for another picture or another width and
 * keeps the phrase and the dates: the picture cannot be used, or cannot hold the phrase.
 */
const ANOTHER_PICTURE = new Set([
  "embroidery.picture.not-a-picture",
  "embroidery.picture.narrower-than-pattern",
  "embroidery.picture.too-tall",
  "embroidery.hide.too-few-colours",
  "embroidery.hide.no-legend",
]);

/** Whether `cause` is a refusal that another picture or another width may answer. */
export function asksForAnotherPicture(cause: unknown): boolean {
  const code = errorCode(cause);
  return code !== undefined && ANOTHER_PICTURE.has(code);
}

/**
 * Makes the pattern of `request` with `binding`, in a worker: the pattern is about a second's work
 * at 200 stitches across. The object MnemoCode returns is freed once its results are read.
 */
export function makeStitchPattern(
  binding: MnemoCodeBinding,
  request: StitchRequest,
): StitchedPattern {
  MnemoCodeInputAdmission.assertSize(request.phrase, "Mnemonic input");
  MnemoCodeInputAdmission.assertSize(request.dates, "Date input");
  using pattern = new binding.StitchPattern(
    request.phrase,
    request.dates,
    request.picture,
    request.stitchesAcross,
  );
  return {
    legend: pattern.legend(),
    pdf: pattern.pdf(),
    rows: pattern.rows,
    width: pattern.width,
    height: pattern.height,
    moved: pattern.moved,
    seenDifference: pattern.seenDifference,
  };
}

/**
 * The legend line `text` read back; undefined where the text is no legend line, such as codes or
 * a record. Refused, in MnemoCode's words, for a line that reads as no phrase or as several.
 */
export function readStitchLegendLine(text: string): StitchLegendReading | undefined {
  MnemoCodeInputAdmission.assertSize(text, "MnemoCode input");
  using legend = mnemocode().readStitchLegend(text);
  if (legend === undefined) return undefined;
  return { record: legend.record(), correctedRow: legend.correctedRow };
}

/** What the page says of a row read as misread, as MnemoCode's command line says it. */
export function correctedRowWarning(row: number): string {
  return `Row ${row} of the legend did not fit; it was read as the only change of it that gives a phrase. Check that row on the paper.`;
}

/** Whether `cause` is MnemoCode's refusal of a legend line, or of the phrase it should hold. */
export function isStitchLegendRefusal(cause: unknown): boolean {
  return errorCode(cause)?.startsWith("embroidery.") === true;
}
