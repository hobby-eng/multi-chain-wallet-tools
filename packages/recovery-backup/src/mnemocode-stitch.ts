// SeedStitch in the Deriver (MnemoCode docs/SEEDSTITCH.md): a phrase masked with MnemoCode's
// Seedshift, or with Direct the phrase itself, hidden in the legend of a cross-stitch pattern made
// from a picture on a chosen fabric and size, and a legend line, typed or kept in the pattern's
// PDF, read back into the record of the phrase. MnemoCode's WebAssembly makes and reads both and
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

/** The modes a pattern takes: the phrase masked with MnemoCode Seedshift, or the phrase itself. */
export const STITCH_MODES = Object.freeze(["seedshift", "direct"] as const);
export type StitchMode = (typeof STITCH_MODES)[number];

/** A fabric as MnemoCode's menu offers it, the usual one first. */
export interface StitchFabric {
  /** As `stitch --fabric` takes it: "14" or "linen-28". */
  readonly option: string;
  readonly name: string;
  /** Stitches an inch. */
  readonly count: number;
  readonly note: string;
}

/** The fabrics of MnemoCode's menu (mnemocode-embroidery fabric::FABRICS), Aida 14 first. */
export const STITCH_FABRICS: readonly StitchFabric[] = Object.freeze(
  [
    { option: "14", name: "Aida 14", count: 14, note: "the most usual" },
    { option: "11", name: "Aida 11", count: 11, note: "" },
    { option: "16", name: "Aida 16", count: 16, note: "" },
    { option: "18", name: "Aida 18", count: 18, note: "" },
    {
      option: "linen-28",
      name: "Linen 28 over 1",
      count: 28,
      note: "fine: for detail in a small piece",
    },
  ].map((fabric) => Object.freeze(fabric)),
);

/** What MnemoCode's menu says of a fabric: its stitches a centimetre, and what it suits. */
export function stitchFabricNote(fabric: StitchFabric): string {
  const perCentimetre = ((fabric.count * 10) / 25.4).toFixed(1);
  return `${perCentimetre} stitches a centimetre${fabric.note === "" ? "" : `, ${fabric.note}`}`;
}

/** What a pattern is made of: the phrase and the dates as typed, a picture file, a width, a fabric. */
export interface StitchRequest {
  readonly phrase: string;
  readonly dates: string;
  /** A PNG, JPEG or WebP file; no secret. */
  readonly picture: Uint8Array;
  readonly stitchesAcross: number;
  readonly mode: StitchMode;
  /** As `stitch --fabric` takes it; the PDF gives the skeins and sizes for it. */
  readonly fabric: string;
}

/** A pattern made: its legend line and its PDF, and what MnemoCode's command line says of it. */
export interface StitchedPattern {
  /** The legend as a person types it back; with the dates it gives the phrase. */
  readonly legend: string;
  /** A cover, the floss key with the legend line, and the chart in colour. */
  readonly pdf: Uint8Array;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** The stitches moved to set the counts. */
  readonly moved: number;
  /** How far the pattern is from the picture, seen from a little distance (CIELAB). */
  readonly seenDifference: number;
}

/** A legend line read back: the record of the phrase, and the row taken as misread. */
export interface StitchLegendReading {
  /** `MNC1:seedshift:indexes:…`, which Decode reads with the dates, or `MNC1:direct:indexes:…`. */
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
    request.mode,
  );
  return {
    legend: pattern.legend(),
    pdf: pattern.pdf(request.fabric),
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

/**
 * The legend line that a pattern's PDF keeps, read back as a typed one is; undefined where the PDF
 * keeps none, as when another program saved it again: then the legend is typed from the key.
 */
export function readStitchPdfLegend(pdf: Uint8Array): StitchLegendReading | undefined {
  using legend = mnemocode().readStitchPdf(pdf);
  if (legend === undefined) return undefined;
  return { record: legend.record(), correctedRow: legend.correctedRow };
}

/** A paper size a picture may be fitted into on a fabric, as MnemoCode's menu offers it. */
export interface StitchSheet {
  /** "A4, 21 x 29.7 cm". */
  readonly label: string;
  /** "171 x 236 stitches, 31.0 x 42.8 cm". */
  readonly note: string;
  readonly across: number;
}

/** A centimetre value as MnemoCode prints it: "21" for 21.0 and "29.7". */
function centimetres(millimetres: number): string {
  return String(Math.round(millimetres) / 10);
}

/**
 * How large a pattern of a picture may be on a fabric (MnemoCode's StitchSizes): the sheets from
 * A6 to A2 that hold it, each with its stitches, and the widths it allows in centimetres and in
 * stitches. The page keeps one while the picture and the fabric stay, and frees it after.
 */
export class StitchSizeOffer implements Disposable {
  readonly #sizes: InstanceType<MnemoCodeBinding["StitchSizes"]>;
  readonly sheets: readonly StitchSheet[];

  constructor(picture: Uint8Array, fabric: string) {
    this.#sizes = new (mnemocode().StitchSizes)(picture, fabric);
    const sheets: StitchSheet[] = [];
    for (let at = 0; at < this.#sizes.count; at += 1) {
      const across = this.#sizes.across(at) ?? 0;
      const down = this.#sizes.down(at) ?? 0;
      sheets.push({
        label: `${this.#sizes.name(at) ?? ""}, ${centimetres(this.#sizes.shortSide(at) ?? 0)} x ${centimetres(this.#sizes.longSide(at) ?? 0)} cm`,
        note: `${across} x ${down} stitches, ${(this.#sizes.centimetresAcross(at) ?? 0).toFixed(1)} x ${(this.#sizes.centimetresDown(at) ?? 0).toFixed(1)} cm`,
        across,
      });
    }
    this.sheets = sheets;
  }

  /** The sheet selected first: the smallest that looks real, else the largest. */
  get first(): number | undefined {
    return this.#sizes.first;
  }

  /** What MnemoCode's menu says above the sizes. */
  get detailNote(): string {
    return `More stitches give more detail: a photograph looks real from about ${this.#sizes.detailedFrom} across.`;
  }

  /** "18.2 to 91.4": the centimetres across a typed width may have. */
  get centimetreRange(): string {
    return `${this.#sizes.fewestCentimetres.toFixed(1)} to ${this.#sizes.mostCentimetres.toFixed(1)}`;
  }

  /** "40 to 500": the stitches across the picture may have. */
  get stitchRange(): string {
    return `${this.#sizes.fewestAcross} to ${this.#sizes.mostAcross}`;
  }

  /** The stitches across of a typed width in centimetres, a comma or a point before its decimals. */
  typedCentimetres(text: string): number | undefined {
    const typed = text.trim().replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/u.test(typed)) return undefined;
    return this.#sizes.typedWidth(Number(typed));
  }

  /** The stitches across typed, a whole number within the widths the picture allows. */
  typedStitches(text: string): number | undefined {
    const typed = text.trim();
    if (!/^\d+$/u.test(typed)) return undefined;
    const across = Number(typed);
    return across >= this.#sizes.fewestAcross && across <= this.#sizes.mostAcross
      ? across
      : undefined;
  }

  [Symbol.dispose](): void {
    this.#sizes.free();
  }
}

/** What the page says of a row read as misread, as MnemoCode's command line says it. */
export function correctedRowWarning(row: number): string {
  return `Row ${row} of the legend did not fit; it was read as the only change of it that gives a phrase. Check that row on the paper.`;
}

/** Whether `cause` is MnemoCode's refusal of a legend line, or of the phrase it should hold. */
export function isStitchLegendRefusal(cause: unknown): boolean {
  return errorCode(cause)?.startsWith("embroidery.") === true;
}
