import * as upngModule from "@pdf-lib/upng";
import { zipSync } from "fflate";
import { encode as encodeQr } from "uqr";
import {
  CardRenderer,
  cardTemplates,
  createCardSession,
  isCardPageSize,
  parseOrientation,
  parsePageSize,
  renderAssets,
  renderCards,
  renderIndividualCards,
  selectTemplate,
  validateProfile,
  type CardContent,
  type CardJob,
  type CardOrientation,
  type CardPageSize,
  type CardProfile,
  type CardSession,
  type RasterImage,
  type RenderAsset,
  type RenderPlatform,
} from "../../recovery-mnemocode/source/cards.js";
import {
  designTexts,
  type CardCopyOverrides,
} from "../../recovery-mnemocode/source/export/card-copy.js";
import {
  CardPreview,
  SAMPLE_FILE_BASE,
  SAMPLE_WORD_COUNTS,
} from "../../recovery-mnemocode/source/export/card-preview.js";
import { cardExportCheck } from "../../recovery-mnemocode/source/export/cards-self-test.js";
import type { SelfTestCheck } from "../../recovery-mnemocode/source/core/self-test.js";
import { resolveTemplateId } from "../../recovery-mnemocode/source/export/template-catalog.js";
import { plannedCardJob } from "../../recovery-mnemocode/source/export/render.js";
import { pageFileName } from "../../recovery-mnemocode/source/export/card-codes.js";
import { backupCardContent } from "../../recovery-mnemocode/source/export/backup-cards.js";
import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import { EncodedForm } from "../../recovery-mnemocode/source/core/encoded-form.js";
import { isEncodedFormat } from "../../recovery-mnemocode/source/core/types.js";
import { shareKeepingNote } from "../../recovery-mnemocode/source/export/sskr-keeping-text.js";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_FORMAT_FACTS,
  IMAGE_DPI,
  parseDocumentFormat,
  type DocumentFormat,
  type ImageFormat,
} from "../../recovery-mnemocode/source/export/document-formats.js";
import {
  CARD_PAGE_SIZES,
  SHEET_PAGE_SIZE,
  pageDimensions,
} from "../../recovery-mnemocode/source/export/card-settings.js";
import type { ShareFormat } from "../../recovery-mnemocode/source/sskr/transport.js";
import type { SskrCardLayout } from "../../recovery-mnemocode/source/export/sskr-content.js";
// Built only with the SSKR library (mnemocode-share-render.ts).
import { ShareCardSet, resolveSskrLayout } from "./mnemocode-share-render.js";
import { encodeMnemoCode, type MnemoCodeDate, type MnemoCodeMode } from "./mnemocode.js";

/**
 * Browser host for the unmodified MnemoCode card renderers.
 *
 * MnemoCode draws the cards. This module only supplies the services the renderers
 * ask their host for, using components this project already contains: the system
 * random source, `uqr` for QR matrices, the PNG coder that `pdf-lib` depends on,
 * and `fflate` for the ZIP archive of individual cards.
 */

type Upng = typeof import("@pdf-lib/upng");

function isUpng(value: unknown): value is Upng {
  return typeof value === "object" && value !== null && "decode" in value && "encode" in value;
}

/** The package publishes a default export as ESM and a namespace as CommonJS. */
function resolveUpng(module: unknown): Upng {
  let candidate = module;
  for (let depth = 0; depth < 3; depth += 1) {
    if (isUpng(candidate)) return candidate;
    if (typeof candidate !== "object" || candidate === null || !("default" in candidate)) break;
    candidate = candidate.default;
  }
  throw new Error("The PNG coder is unavailable in this build.");
}

const upng = resolveUpng(upngModule);

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function decodePng(bytes: Uint8Array): RasterImage {
  const image = upng.decode(arrayBuffer(bytes));
  const frame = upng.toRGBA8(image)[0];
  if (frame === undefined || frame.byteLength !== image.width * image.height * 4)
    throw new Error("The PNG image could not be decoded.");
  return { width: image.width, height: image.height, data: new Uint8Array(frame) };
}

export function encodePng(image: RasterImage): Uint8Array {
  if (image.data.byteLength !== image.width * image.height * 4)
    throw new Error("The image data is incomplete.");
  // Zero colours requests lossless output.
  return new Uint8Array(upng.encode([arrayBuffer(image.data)], image.width, image.height, 0));
}

const UINT32_RANGE = 0x1_0000_0000;

/** Uniform choice by rejection sampling; a plain remainder would favour small values. */
export function uniformInteger(
  upperExclusive: number,
  fill: (values: Uint32Array<ArrayBuffer>) => unknown = (values) =>
    globalThis.crypto.getRandomValues(values),
): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1 || upperExclusive > UINT32_RANGE)
    throw new Error("The random range is invalid.");
  const accepted = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  const values = new Uint32Array(1);
  for (let attempt = 0; attempt < 256; attempt += 1) {
    fill(values);
    const value = values[0];
    if (value !== undefined && value < accepted) return value % upperExclusive;
  }
  throw new Error("The random source did not return a usable value.");
}

export type MnemoCodeCardAssetReader = (path: RenderAsset) => Uint8Array | Promise<Uint8Array>;

export function createMnemoCodeCardPlatform(readAsset: MnemoCodeCardAssetReader): RenderPlatform {
  return {
    readAsset: async (path) => {
      const bytes = await readAsset(path);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
        throw new Error(`Card asset ${path} is missing from this build.`);
      return bytes;
    },
    randomInt: (upperExclusive) => uniformInteger(upperExclusive),
    decodePng,
    encodePng: (image) => encodePng(image),
    qrModules: (payload) => {
      const { size, data } = encodeQr(payload, { ecc: "M", border: 0 });
      return { size, get: (row, column) => data[row]?.[column] === true };
    },
  };
}

export const MNEMOCODE_CARD_ASSETS: readonly RenderAsset[] = renderAssets;

export interface MnemoCodeCardTemplate {
  readonly id: string;
  readonly name: string;
}

/** The list comes from the vendored MnemoCode registry, never from a copy kept here. */
export const MNEMOCODE_CARD_TEMPLATES: readonly MnemoCodeCardTemplate[] = cardTemplates
  .filter((template) => template.kind === "colors")
  .map(({ id, name }) => ({ id, name }));

/** The page's own name of each of MnemoCode's page sizes; the sizes themselves are MnemoCode's. */
const PAGE_SIZE_NAMES: Readonly<Record<CardPageSize, string>> = {
  a6: "A6 sheet",
  a5: "A5 sheet",
  a4: "A4 sheet",
  business: "Separate business cards",
};

/** MnemoCode's page sizes, its default (SHEET_PAGE_SIZE) first, each with its size in millimetres. */
const ORDERED_PAGE_SIZES: readonly CardPageSize[] = [
  SHEET_PAGE_SIZE,
  ...CARD_PAGE_SIZES.filter((size) => size !== SHEET_PAGE_SIZE),
];
export const MNEMOCODE_CARD_PAGE_SIZES: readonly {
  readonly id: CardPageSize;
  readonly label: string;
}[] = ORDERED_PAGE_SIZES.map((id) => {
  const [width, height] = pageDimensions(id);
  return { id, label: `${PAGE_SIZE_NAMES[id]} · ${width} × ${height} mm` };
});

/** Images have the resolution that MnemoCode itself uses for its image export. */
export const MNEMOCODE_CARD_IMAGE_DPI = IMAGE_DPI;

/** MnemoCode's file formats, the default first, named as the page lists them. */
export const MNEMOCODE_CARD_FILE_FORMATS: readonly {
  readonly id: DocumentFormat;
  readonly label: string;
}[] = DOCUMENT_FORMATS.map((id) => {
  const { name, note } = DOCUMENT_FORMAT_FACTS[id];
  return {
    id,
    label: id === "pdf" ? `${name} document` : `${name} image · ${IMAGE_DPI} dpi · ${note}`,
  };
});
export type MnemoCodeCardFileFormat = DocumentFormat;
export type MnemoCodeCardImageFormat = ImageFormat;

/**
 * Turns every page of a card PDF into a PNG or JPEG image. Only a browser can do this, so
 * the page supplies it; MnemoCode's `export/card-drawing.ts` reads a page into drawing steps.
 */
export type MnemoCodeCardRasterizer = (
  pdf: Uint8Array,
  format: MnemoCodeCardImageFormat,
) => Promise<Uint8Array[]>;

/**
 * MnemoCode decides what a page size means: a sheet size holds the whole collection on
 * one page, a card size gives separate numbered cards.
 */
export function mnemoCodeCardOutput(pageSize: string | undefined): MnemoCodeCardOutput {
  const size = pageSize === undefined || pageSize === "" ? undefined : parsePageSize(pageSize);
  return isCardPageSize(size) ? "individual" : "collection";
}

export type MnemoCodeCardOutput = "collection" | "individual";
/** The representations that print as cards, as MnemoCode's EncodedForm says (its cardKind). */
export type MnemoCodeCardFormat = "unicode" | "colors" | "colors-unicode";

/** Whether a phrase written as `format` prints as cards; MnemoCode's EncodedForm decides. */
export function mnemoCodeFormatHasCards(format: string): format is MnemoCodeCardFormat {
  return isEncodedFormat(format) && EncodedForm.of(format).cardKind === "colors";
}
export type MnemoCodeCardProfile = CardProfile;

export interface MnemoCodeCardRequest {
  readonly mnemonic: string;
  readonly mode: MnemoCodeMode;
  readonly dates: readonly MnemoCodeDate[];
  /** The representation the cards print: colors, or Unicode codes on palette colors. */
  readonly format: MnemoCodeCardFormat;
  readonly template: string;
  /** Decides the result: a sheet size gives one sheet, a card size separate cards. Empty means A6. */
  readonly pageSize?: string | undefined;
  /** Empty or undefined selects the default orientation of the template. */
  readonly orientation?: string | undefined;
  /** One QR code with the complete data; only a sheet can carry it. */
  readonly qr: boolean;
  /** Empty or undefined means PDF. */
  readonly fileFormat?: string | undefined;
  /** The user's own details. Whatever is left out is invented and kept for the session. */
  readonly profile?: MnemoCodeCardProfile | undefined;
  /**
   * The person's own texts around the cards: the studio name, slogan, subtitle and footer of a
   * sheet, the label before a separate card's code. Whatever is left out is invented; "-" leaves
   * a text off (MnemoCode's card copy).
   */
  readonly copy?: CardCopyOverrides | undefined;
  /** The collection title of a sheet (--title); empty or undefined prints the studio name. */
  readonly title?: string | undefined;
}

export interface MnemoCodeCardFile {
  readonly fileName: string;
  /** A document format's MIME type (MnemoCode's DOCUMENT_FORMAT_FACTS), or application/zip. */
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly cards: number;
  /** What is printed, so that the page can show it. None of it depends on the phrase. */
  readonly printed: { readonly name: string; readonly company: string; readonly studio: string };
  /** What the shares in the file are, so that the page says how many restore; absent for a phrase. */
  readonly shares?: MnemoCodeShareCardSet | undefined;
  /**
   * The QR codes printed on the sheets, one per share, so that the page also offers them as
   * images, as MnemoCode saves "cards-qr.png" beside the PDF; absent without a QR code.
   */
  readonly qrCodes?: readonly MnemoCodeCardQrCode[] | undefined;
}

/** A QR code printed on the cards: what it is of, and the text it holds (recovery material). */
export interface MnemoCodeCardQrCode {
  readonly reference: string;
  readonly payload: string;
}

/** The facts of a set of share cards that decide how they are kept. None of them is secret. */
export interface MnemoCodeShareCardSet {
  /** The shares in the file, as UR records: MnemoCode reads their quorum from them. */
  readonly records: readonly string[];
  /** Each share spans several cards, kept in a folder of its own. */
  readonly fragmented: boolean;
  /** The shares hold the masked phrase (decoy) of a Seedshift split: the dates are needed too. */
  readonly masked: boolean;
}

/** What every saved card file must tell, phrase or shares. */
const KEEP_PRIVATE = "keep the file and the prints private.";

/** The note shown once a card file is saved: what it holds and how to keep it. */
export function mnemoCodeCardSavedNote(file: MnemoCodeCardFile): string {
  const zip = file.mimeType === "application/zip";
  const printed = `Printed for ${file.printed.name}, ${file.printed.company}.`;
  const saved = zip
    ? `Saved ${file.fileName} with ${file.cards} cards. ${printed}`
    : `Saved ${file.fileName}. ${printed} Print it at 100% size.`;
  return `${saved} ${keepingAdvice(file.shares, zip)}`;
}

function keepingAdvice(shares: MnemoCodeShareCardSet | undefined, zip: boolean): string {
  if (shares === undefined)
    return zip
      ? `Every card is needed for recovery; ${KEEP_PRIVATE}`
      : `The printed codes can restore the wallet; ${KEEP_PRIVATE}`;
  // MnemoCode's own words for the quorum and the layout of the saved file (sskr-keeping-text.ts).
  const packaging = zip ? (shares.fragmented ? "folders" : "files") : "file";
  return `${shareKeepingNote(shares.records, packaging, shares.masked)} Keep the file and the prints private.`;
}

/** The facts of the checked card set; MnemoCode's keeping note describes its actual groups. */
function shareCardSet(
  { records, masked }: Pick<MnemoCodeShareCardRequest, "records" | "masked">,
  cards: ShareCardSet,
): MnemoCodeShareCardSet {
  // ShareCardSet has checked the imported topology, including sets with several groups.
  return {
    records: [...records],
    fragmented: cards.layout === "individual",
    masked,
  };
}

/** The shared resolved layout, for host hints about whole shares or individual fragments. */
export function mnemoCodeShareCardLayout(selectedPageSize?: string, layout?: "qr"): SskrCardLayout {
  return resolveSskrLayout(layout, parsePageSize(pageSize({ pageSize: selectedPageSize })));
}

function pageSize(request: Pick<MnemoCodeCardRequest, "pageSize">): string | undefined {
  return request.pageSize === undefined || request.pageSize === "" ? undefined : request.pageSize;
}

/** The texts typed, each trimmed; an empty one stays invented. */
function ownCopy(copy: CardCopyOverrides | undefined): CardCopyOverrides {
  const typed = Object.entries(copy ?? {})
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value] as const)
    .filter(([, value]) => value !== "" && value !== undefined);
  return Object.fromEntries(typed) as CardCopyOverrides;
}

/** The texts that `template` prints besides the person's details, as MnemoCode's designs do. */
export function mnemoCodeCardTexts(
  template: string,
  output: MnemoCodeCardOutput,
): readonly (keyof CardCopyOverrides)[] {
  return designTexts(template, output === "collection");
}

function cardContent(request: MnemoCodeCardRequest, session: CardSession): CardContent {
  if (!mnemoCodeFormatHasCards(request.format))
    throw new Error("Cards print the colors or the Unicode codes of a phrase.");
  const encoded = encodeMnemoCode(request.mnemonic, request.mode, request.format, request.dates);
  const orientation: CardOrientation | undefined = parseOrientation(
    request.orientation === undefined || request.orientation === ""
      ? undefined
      : request.orientation,
  );
  const { profile, presentation } = session.settingsFor(
    request.template,
    validateProfile(request.profile ?? {}),
    ownCopy(request.copy),
  );
  // MnemoCode builds the content of a backup's cards, its colours and the codes of its QR code.
  return backupCardContent(EncodedBackup.of(encoded.indexes, encoded.format, encoded.mode), {
    settings: {
      ...(pageSize(request) === undefined ? {} : { pageSize: parsePageSize(pageSize(request)) }),
      ...(orientation === undefined ? {} : { orientation }),
      profile,
      presentation,
      cardQr: request.qr,
    },
    ...titleOf(request),
  });
}

/** Shares to print as cards: the same choices as a phrase's cards, with the shares instead. */
/** As MnemoCode's share commands, share cards take no collection title. */
export interface MnemoCodeShareCardRequest extends Omit<
  MnemoCodeCardRequest,
  "mnemonic" | "mode" | "dates" | "format" | "title"
> {
  /** The shares as SSKR UR records, as a split made them. */
  readonly records: readonly string[];
  /**
   * The split was a Seedshift one: the shares hold the masked phrase (decoy), which the same dates
   * turn back into the wallet's. No record stores the dates or the mode, so the caller says it.
   */
  readonly masked: boolean;
  /** The form the shares are written in; a QR code holds word numbers or Unicode codes as such. */
  readonly shareFormat: ShareFormat;
  /** "qr": one QR card per share, in every size, as MnemoCode prints shares that are not colors. */
  readonly layout?: "qr" | undefined;
}

/** The word counts that sample cards are drawn with (MnemoCode's preview). */
export const MNEMOCODE_SAMPLE_WORD_COUNTS = SAMPLE_WORD_COUNTS;

/**
 * Sample cards drawn with MnemoCode's public test phrase, as `mnemocode preview` draws them: one
 * design, or every design on sheets; separate cards of one design at a card size; as PDF or as
 * images; with the sheet's QR code and title where asked.
 */
export interface MnemoCodeSampleRequest {
  /** A template id, or "" for every design. */
  readonly template: string;
  readonly words: number;
  readonly pageSize?: string | undefined;
  readonly orientation?: string | undefined;
  readonly profile?: MnemoCodeCardProfile | undefined;
  readonly copy?: CardCopyOverrides | undefined;
  /** A QR code of the sample's codes on each sheet (--card-qr). */
  readonly qr?: boolean | undefined;
  /** Empty or undefined means PDF. */
  readonly fileFormat?: string | undefined;
  readonly title?: string | undefined;
}

/** The shared immutable share plan and the details printed by that same plan. */
interface CachedSharePlan {
  readonly cards: ShareCardSet;
  readonly printed: MnemoCodeCardFile["printed"];
}

/**
 * The plan of one layout: the random codes after a backup's own, never the phrase's codes, and the
 * orientation that the plan chose for a sheet where none was asked.
 */
interface DecoyTail {
  readonly colors: readonly string[];
  readonly labels?: readonly string[] | undefined;
  readonly orientation?: CardOrientation | undefined;
}

/** The layout whose decoys a later export of the same cards reuses: everything but the file type. */
function layoutKey(request: MnemoCodeCardRequest, content: CardContent): string {
  // QR geometry and printed text affect capacity too. Content is the renderer owner's complete
  // input and contains no file format, so identical PDF/image exports reuse the same plan.
  return JSON.stringify([request.template, content]);
}

/** The decoys that `planned` adds after the `own` codes of the content it was planned from. */
function decoyTail(planned: CardContent, own: number): DecoyTail | undefined {
  if (planned.kind !== "colors" || planned.decoys === undefined) return undefined;
  return {
    colors: planned.colors.slice(own),
    ...(planned.labels === undefined ? {} : { labels: planned.labels.slice(own) }),
    ...(planned.orientation === undefined ? {} : { orientation: planned.orientation }),
  };
}

/** `content` with the plan of an earlier export of the same layout: its decoys and orientation. */
function withDecoyTail(content: CardContent, tail: DecoyTail): CardContent {
  if (content.kind !== "colors") return content;
  return {
    ...content,
    colors: [...content.colors, ...tail.colors],
    ...(content.labels === undefined || tail.labels === undefined
      ? {}
      : { labels: [...content.labels, ...tail.labels] }),
    decoys: tail.colors.length,
    ...(tail.orientation === undefined ? {} : { orientation: tail.orientation }),
  };
}

/** A fixed timestamp keeps the export time out of every archive. */
const ARCHIVE_TIME = new Date(1980, 0, 1, 0, 0, 0);

/** The title of a request, where one was typed: MnemoCode prints the studio name otherwise. */
/** What a card file prints of the person, for the page to show; none of it is the phrase. */
function printedOf(details: {
  readonly profile?: CardProfile | undefined;
  readonly presentation?: { readonly studioName?: string | undefined } | undefined;
}): MnemoCodeCardFile["printed"] {
  return {
    name: details.profile?.name ?? "",
    company: details.profile?.company ?? "",
    studio: details.presentation?.studioName ?? "",
  };
}

/**
 * Separate card files packed into one archive, which holds its own copy: the files are recovery
 * material and are cleared at once.
 */
function packCards(entries: Record<string, Uint8Array>): Uint8Array {
  try {
    return zipSync(entries, { level: 0, mtime: ARCHIVE_TIME });
  } finally {
    for (const entry of Object.values(entries)) entry.fill(0);
  }
}

function titleOf(request: { readonly title?: string | undefined }): { title?: string } {
  const title = request.title?.trim() ?? "";
  return title === "" ? {} : { title };
}

export interface MnemoCodeCardExporter {
  readonly render: (request: MnemoCodeCardRequest) => Promise<MnemoCodeCardFile>;
  /**
   * The cards of a set of shares (MnemoCode's ShareCardSet): on sheets, one sheet per share in
   * one PDF; as separate cards, each share's cards in a folder of its own, in one ZIP file. The
   * records may come from an imported grouped set; local splitting still makes one group.
   */
  readonly renderShares: (request: MnemoCodeShareCardRequest) => Promise<MnemoCodeCardFile>;
  /** Sample cards with the public test phrase, as `mnemocode preview` draws them; no secret. */
  readonly renderSamples: (request: MnemoCodeSampleRequest) => Promise<MnemoCodeCardFile>;
  /**
   * Forgets the invented person, company and studio. The page calls this when the
   * phrase changes, so another phrase gets other details.
   */
  readonly forgetDetails: () => void;
}

function fileFormat(request: Pick<MnemoCodeCardRequest, "fileFormat">): MnemoCodeCardFileFormat {
  return parseDocumentFormat(request.fileFormat);
}

export function createMnemoCodeCardExporter(
  readAsset: MnemoCodeCardAssetReader,
  rasterize?: MnemoCodeCardRasterizer,
): MnemoCodeCardExporter {
  const renderer = createMnemoCodeCardRenderer(readAsset);
  /** The page's image maker; a build without one saves PDF only. */
  const rasterizer = (): MnemoCodeCardRasterizer => {
    if (rasterize === undefined) throw new Error("Image export is unavailable in this build.");
    return rasterize;
  };
  /** Separate cards as archive entries in the chosen format, each named as MnemoCode names it. */
  const cardEntries = async (
    cards: readonly { readonly name: string; readonly bytes: Uint8Array }[],
    format: MnemoCodeCardFileFormat,
  ): Promise<Record<string, Uint8Array>> => {
    const entries: Record<string, Uint8Array> = {};
    for (const card of cards)
      entries[`${card.name}.${format}`] = await inFormat(card.bytes, format);
    return entries;
  };
  /** The card in the chosen file format. The PDF is recovery material and is cleared once it is drawn. */
  const inFormat = async (
    pdf: Uint8Array,
    format: MnemoCodeCardFileFormat,
  ): Promise<Uint8Array> => {
    if (format === "pdf") return pdf;
    const draw = rasterizer();
    try {
      const images = await draw(pdf, format);
      const [image] = images;
      if (image === undefined || images.length !== 1)
        throw new Error("A card must have exactly one page.");
      return image;
    } finally {
      pdf.fill(0);
    }
  };
  // One session for every export until the page forgets it: every size shows the same details.
  let session: CardSession | undefined;
  // The decoys planned for each layout of the phrase's cards, kept as the details are, so that a
  // PDF and its images saved one after the other show the same cards (plannedCardJob).
  const decoys = new Map<string, DecoyTail>();
  // Keep only the selected share export. Its shared plan owns the decoys; file format changes
  // reuse it, and a new source or setting releases it without retaining earlier share sets.
  let sharePlan: { readonly key: string; readonly pending: Promise<CachedSharePlan> } | undefined;
  /** The cards of `request`, with the decoys its layout had before or newly planned ones. */
  const plannedJob = async (request: MnemoCodeCardRequest, job: CardJob): Promise<CardJob> => {
    const key = layoutKey(request, job.content);
    const known = decoys.get(key);
    if (known !== undefined) return { ...job, content: withDecoyTail(job.content, known) };
    const own = job.content.kind === "colors" ? job.content.colors.length : 0;
    const planned = await plannedCardJob(renderer, job);
    const tail = decoyTail(planned.content, own);
    if (tail !== undefined) decoys.set(key, tail);
    return planned;
  };
  return {
    forgetDetails() {
      session = undefined;
      decoys.clear();
      sharePlan = undefined;
    },
    async renderSamples(request) {
      session ??= createCardSession(renderer.randomInt);
      const format = fileFormat(request);
      const size = pageSize(request);
      const output = mnemoCodeCardOutput(size);
      const every = request.template === "";
      const selection = every ? ({ every: true } as const) : { template: request.template };
      // As the command line: a folder of separate cards holds one design.
      if (output === "individual") CardPreview.assertSeparateCards(selection);
      const orientation =
        request.orientation === undefined || request.orientation === ""
          ? undefined
          : parseOrientation(request.orientation);
      const template = every ? MNEMOCODE_CARD_TEMPLATES[0]!.id : request.template;
      const preview = new CardPreview(renderer, {
        words: request.words,
        settings: {
          ...(size === undefined ? {} : { pageSize: parsePageSize(size) }),
          ...(orientation === undefined ? {} : { orientation }),
          ...session.settingsFor(
            template,
            validateProfile(request.profile ?? {}),
            ownCopy(request.copy),
          ),
          cardQr: request.qr === true,
        },
        ...titleOf(request),
      });
      const printed = { name: "", company: "", studio: "" };
      if (output === "individual") {
        const job = preview.separateCardsJob(selection);
        const cards = await renderIndividualCards(renderer, job.template, job.content);
        const entries = await cardEntries(cards, format);
        return {
          fileName: `${SAMPLE_FILE_BASE}-${parsePageSize(size)}.zip`,
          mimeType: "application/zip",
          bytes: packCards(entries),
          cards: cards.length,
          printed,
        };
      }
      const pdf = every ? await preview.renderAll() : await preview.render(request.template);
      if (format === "pdf")
        return {
          fileName: pageFileName(SAMPLE_FILE_BASE, 0, 1, "pdf"),
          mimeType: "application/pdf",
          bytes: pdf,
          cards: 1,
          printed,
        };
      // Every sheet as an image, as `preview --images-dir` saves them: one file, or a ZIP of them.
      const pages = await rasterizer()(pdf, format);
      if (pages.length === 1)
        return {
          fileName: pageFileName(SAMPLE_FILE_BASE, 0, 1, format),
          mimeType: DOCUMENT_FORMAT_FACTS[format].mimeType,
          bytes: pages[0]!,
          cards: 1,
          printed,
        };
      const entries = Object.fromEntries(
        pages.map((page, index) => [
          pageFileName(SAMPLE_FILE_BASE, index, pages.length, format),
          page,
        ]),
      );
      return {
        fileName: `${SAMPLE_FILE_BASE}.zip`,
        mimeType: "application/zip",
        bytes: packCards(entries),
        cards: pages.length,
        printed,
      };
    },
    async renderShares(request) {
      const { style } = resolveTemplateId(request.template, "colors");
      const format = fileFormat(request);
      const size = pageSize(request);
      const sizeName = parsePageSize(size);
      const orientation =
        request.orientation === undefined || request.orientation === ""
          ? undefined
          : parseOrientation(request.orientation);
      const source = { records: [...request.records], masked: request.masked };
      const profile = validateProfile(request.profile ?? {});
      const copy = ownCopy(request.copy);
      // Include every input to the shared plan and its identity, except the output file format.
      // Sorted fields make equivalent caller objects share the same captured plan.
      const key = JSON.stringify([
        source.records,
        source.masked,
        style,
        sizeName,
        orientation ?? "",
        request.shareFormat,
        request.layout ?? "",
        request.qr === true,
        Object.entries(profile).sort(([left], [right]) => left.localeCompare(right)),
        Object.entries(copy).sort(([left], [right]) => left.localeCompare(right)),
      ]);
      if (sharePlan?.key !== key) {
        session ??= createCardSession(renderer.randomInt);
        const settings = session.settingsFor(request.template, profile, copy);
        const pending = ShareCardSet.create(renderer, source.records, {
          style,
          ...(size === undefined ? {} : { pageSize: sizeName }),
          ...(orientation === undefined ? {} : { orientation }),
          ...settings,
          cardQr: request.qr,
          shareFormat: request.shareFormat,
          ...(request.layout === undefined ? {} : { layout: request.layout }),
        }).then((cards) => ({ cards, printed: printedOf(settings) }));
        // Store the pending plan before awaiting it: forgetDetails can drop it while it settles.
        sharePlan = { key, pending };
      }
      const captured = sharePlan;
      let planned: CachedSharePlan;
      try {
        planned = await captured.pending;
      } catch (cause) {
        if (sharePlan === captured) sharePlan = undefined;
        throw cause;
      }
      const { cards, printed } = planned;
      const set = shareCardSet(source, cards);
      const qrCodes = cards.qrCodes.length === 0 ? {} : { qrCodes: cards.qrCodes };
      // The layout the set resolved to says how its documents are packed (MnemoCode's own rule).
      if (format === "pdf" && cards.layout !== "individual") {
        const bytes = await cards.renderAll();
        return {
          fileName: `share-cards-${sizeName}.pdf`,
          mimeType: "application/pdf",
          bytes,
          cards: cards.shares.length,
          printed,
          shares: set,
          ...qrCodes,
        };
      }
      // Each share apart: its sheet, or its separate cards in a folder of its own.
      const entries: Record<string, Uint8Array> = {};
      try {
        for (const [place, share] of cards.shares.entries())
          for await (const document of cards.documents(place)) {
            const folder = share.folder === undefined ? "" : `${share.folder}/`;
            entries[`${folder}${document.name}.${format}`] = await inFormat(document.bytes, format);
          }
        const bytes = packCards(entries);
        return {
          fileName: `share-cards-${sizeName}.zip`,
          mimeType: "application/zip",
          bytes,
          cards: Object.keys(entries).length,
          printed,
          shares: set,
          ...qrCodes,
        };
      } catch (cause) {
        // packCards clears a successful archive's inputs; a failed or stale image job must also
        // clear the earlier shares it already converted before the later conversion failed.
        for (const entry of Object.values(entries)) entry.fill(0);
        throw cause;
      }
    },
    async render(request) {
      if (!MNEMOCODE_CARD_TEMPLATES.some((template) => template.id === request.template))
        throw new Error("Select a card template.");
      const template = selectTemplate(request.template, "colors");
      // The session draws its random choices from the renderer's platform.
      session ??= createCardSession(renderer.randomInt);
      const format = fileFormat(request);
      const job = await plannedJob(request, { template, content: cardContent(request, session) });
      const { content } = job;
      const size = parsePageSize(pageSize(request));
      const printed = printedOf(content);
      if (mnemoCodeCardOutput(pageSize(request)) === "collection") {
        const bytes = await inFormat(await renderCards(renderer, [job]), format);
        const mimeType = DOCUMENT_FORMAT_FACTS[format].mimeType;
        // A sheet with a QR code holds the cards' payload in it, as MnemoCode's cards-qr.png does.
        const qrCodes =
          content.cardQr === true
            ? { qrCodes: [{ reference: "cards", payload: content.payload }] }
            : {};
        return {
          fileName: `cards-${size}.${format}`,
          mimeType,
          bytes,
          cards: 1,
          printed,
          ...qrCodes,
        };
      }
      const cards = await renderIndividualCards(renderer, job.template, content);
      const bytes = packCards(await cardEntries(cards, format));
      return {
        fileName: `cards-${size}.zip`,
        mimeType: "application/zip",
        bytes,
        cards: cards.length,
        printed,
      };
    },
  };
}

/** One renderer over this build's render platform: the exporter and the checks draw through it. */
export function createMnemoCodeCardRenderer(readAsset: MnemoCodeCardAssetReader): CardRenderer {
  return new CardRenderer(createMnemoCodeCardPlatform(readAsset));
}

/** MnemoCode's self-test check of the card renderers, with this build's render platform. */
export function mnemoCodeCardSelfTest(readAsset: MnemoCodeCardAssetReader): SelfTestCheck {
  return cardExportCheck(createMnemoCodeCardRenderer(readAsset));
}
