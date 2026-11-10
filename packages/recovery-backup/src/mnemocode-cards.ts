// MnemoCode's cards as the Deriver saves them: a backup's codes printed on one sheet or on separate
// cards in one of MnemoCode's designs, the cards of a set of shares, and sample cards, as PDF or as
// images. MnemoCode's WebAssembly draws them (CardExport, CardSession, CardDocuments); this module
// turns its documents into the one file the page saves, a PDF, an image or a ZIP of them.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { ZipArchive } from "@ckd/export/zip-archive.js";
import type { CardExport, CardPlan } from "@ckd/mnemocode-wasm/mnemocode.js";
import { mnemocode, type MnemoCodeBinding } from "./mnemocode-engine.js";
import { encodeMnemoCode, type MnemoCodeDates, type MnemoCodeMode } from "./mnemocode.js";
import type { ShareFormat } from "./mnemocode-facts.js";

/** One of MnemoCode's card designs. */
export interface MnemoCodeCardTemplate {
  readonly id: string;
  readonly name: string;
  /** Whether it draws separate cards as well as sheets. */
  readonly separateCards: boolean;
}

/** The designs of this page's MnemoCode, in its order. */
export function cardTemplates(binding: MnemoCodeBinding): readonly MnemoCodeCardTemplate[] {
  return Array.from({ length: binding.cardDesignCount() }, (_, at) => {
    using design = binding.cardDesign(at);
    return {
      id: design?.id ?? "",
      name: design?.name ?? "",
      separateCards: design?.drawsSeparateCards ?? false,
    };
  });
}

/** MnemoCode's page sizes, its default first, as the page names them. */
export const MNEMOCODE_CARD_PAGE_SIZES = Object.freeze([
  { id: "a6", label: "A6 sheet · 148 × 105 mm" },
  { id: "a5", label: "A5 sheet · 148 × 210 mm" },
  { id: "a4", label: "A4 sheet · 210 × 297 mm" },
  { id: "business", label: "Separate business cards · 90 × 50 mm" },
] as const);

/** The page size where none is chosen: MnemoCode's sheet. */
const DEFAULT_PAGE_SIZE = "a6";
/** The name of a card file of `pageSize`. */
const cardsName = (pageSize: string | undefined): string =>
  `cards-${pageSize === undefined || pageSize === "" ? DEFAULT_PAGE_SIZE : pageSize}`;

/** The resolution of MnemoCode's card images. */
const IMAGE_DPI = 300;
export const MNEMOCODE_CARD_FILE_FORMATS = Object.freeze([
  { id: "pdf", label: "PDF document" },
  { id: "png", label: `PNG image · ${IMAGE_DPI} dpi · transparent corners` },
  { id: "jpg", label: `JPEG image · ${IMAGE_DPI} dpi · white corners` },
] as const);
export type MnemoCodeCardFileFormat = (typeof MNEMOCODE_CARD_FILE_FORMATS)[number]["id"];

/** The lengths of a sample phrase. */
export const MNEMOCODE_SAMPLE_WORD_COUNTS = Object.freeze([12, 15, 18, 21, 24] as const);

/** What a sheet's QR code holds, as MnemoCode says it. */
export const SHEET_QR_HOLDS = "the codes of the backup, without the extra cards";
/** How MnemoCode plans a sheet when no orientation is chosen. */
export const SHEET_PLAN_TEXT = "at least three rows, the largest cards";

/** The person's details a card may print, as MnemoCode names them. */
export const PROFILE_FIELDS = Object.freeze([
  "name",
  "role",
  "company",
  "email",
  "phone",
  "website",
  "location",
] as const);
export type MnemoCodeCardProfile = Partial<Record<(typeof PROFILE_FIELDS)[number], string>>;

/** The texts of a design, as MnemoCode names them; "-" hides a line. */
export type MnemoCodeCardCopyKey =
  "studioName" | "slogan" | "subtitle" | "footer" | "referenceLabel";
export type MnemoCodeCardCopy = Partial<Record<MnemoCodeCardCopyKey, string>>;

export type MnemoCodeCardOutput = "collection" | "individual";
/** The representations that print as cards. */
export type MnemoCodeCardFormat = "unicode" | "colors" | "colors-unicode";

/** A business card size gives separate cards; a sheet size one sheet. */
export function mnemoCodeCardOutput(pageSize: string | undefined): MnemoCodeCardOutput {
  return pageSize === "business" ? "individual" : "collection";
}

/** How share cards are laid out: a whole-share QR card each, or as the page size says. */
export function mnemoCodeShareCardLayout(
  pageSize: string | undefined,
  layout?: "qr",
): MnemoCodeCardOutput | "qr" {
  return layout ?? mnemoCodeCardOutput(pageSize);
}

/** The texts a design prints in `output`: its sheet's lines, or a separate card's reference. */
export function mnemoCodeCardTexts(output: MnemoCodeCardOutput): readonly MnemoCodeCardCopyKey[] {
  return output === "collection"
    ? ["studioName", "slogan", "subtitle", "footer"]
    : ["referenceLabel"];
}

/** Whether a phrase written as `format` prints as cards: colours, or Unicode codes on colours. */
export function mnemoCodeFormatHasCards(format: string): format is MnemoCodeCardFormat {
  return format === "unicode" || format === "colors" || format === "colors-unicode";
}

/** Whether shares written as `form` print as cards. */
export function shareFormatHasCards(form: ShareFormat): boolean {
  return form === "unicode" || form === "colors" || form === "colors-unicode";
}

/** What every export takes. */
interface CardSettings {
  readonly template: string;
  readonly pageSize?: string | undefined;
  readonly orientation?: string | undefined;
  readonly qr: boolean;
  /**
   * The sheet's QR shows the printed contact to ordinary scanners and keeps the record in its
   * hidden bytes (MnemoCode docs/HIDDEN_QR.md); the page then offers no QR image of its own.
   */
  readonly hiddenQr?: boolean;
  readonly fileFormat: string;
  readonly profile?: MnemoCodeCardProfile;
  readonly copy?: MnemoCodeCardCopy;
  readonly title?: string;
}

export interface MnemoCodeCardRequest extends CardSettings {
  readonly mnemonic: string;
  readonly mode: MnemoCodeMode;
  readonly dates: MnemoCodeDates;
  readonly format: MnemoCodeCardFormat;
}

export interface MnemoCodeShareCardRequest extends CardSettings {
  /** The shares as SSKR UR records. */
  readonly records: readonly string[];
  readonly shareFormat: ShareFormat;
  readonly layout?: "qr";
}

export interface MnemoCodeSampleRequest extends CardSettings {
  readonly words: number;
}

/** A QR code printed on a sheet, which the page also offers as an image. */
export interface PrintedQr {
  readonly reference: "cards" | number;
  readonly payload: string;
}

export interface MnemoCodeCardFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  /** The documents in the file. */
  readonly cards: number;
  /** Whether the file holds shares. */
  readonly shares: boolean;
  readonly qrCodes?: readonly PrintedQr[];
}

const KEEP_PRIVATE = "keep the file and the prints private.";

/** The note shown once a card file is saved: what it holds and how to keep it. */
export function mnemoCodeCardSavedNote(file: MnemoCodeCardFile): string {
  const zip = file.mimeType === "application/zip";
  const saved = zip
    ? `Saved ${file.fileName} with ${file.cards} documents.`
    : `Saved ${file.fileName}. Print it at 100% size.`;
  const keeping = file.shares
    ? `Each share's cards restore that share only; keep the shares apart, and ${KEEP_PRIVATE}`
    : zip
      ? `Every card is needed for recovery; ${KEEP_PRIVATE}`
      : `The printed codes can restore the wallet; ${KEEP_PRIVATE}`;
  return `${saved} ${keeping}`;
}

type Documents = ReturnType<InstanceType<MnemoCodeBinding["CardExport"]>["preview"]>;

const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" } as const;

/** The documents as files: each PDF, or each page as an image. */
function files(documents: Documents, format: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (let at = 0; at < documents.count; at++) {
    const name = documents.name(at);
    if (format === "pdf") {
      out.set(`${name}.pdf`, documents.pdf(at));
      continue;
    }
    const pages = documents.pageCount(at);
    for (let page = 0; page < pages; page++)
      out.set(
        `${name}${pages === 1 ? "" : `-${page + 1}`}.${format}`,
        documents.image(at, page, format),
      );
  }
  return out;
}

/**
 * One file of `parts`, named `name` as MnemoCode's command line names a card file (cards-a6.pdf):
 * the file itself where there is one, or a ZIP of them.
 */
function oneFile(
  parts: Map<string, Uint8Array>,
  format: string,
  name: string,
  shares: boolean,
  qrCodes?: readonly PrintedQr[],
): MnemoCodeCardFile {
  const extras = qrCodes === undefined || qrCodes.length === 0 ? {} : { qrCodes };
  const [only] = parts;
  if (parts.size === 1 && only !== undefined) {
    const [, bytes] = only;
    return {
      fileName: `${name}.${format}`,
      mimeType: MIME[format as keyof typeof MIME] ?? MIME.pdf,
      bytes,
      cards: 1,
      shares,
      ...extras,
    };
  }
  try {
    return {
      fileName: `${name}.zip`,
      mimeType: "application/zip",
      bytes: ZipArchive.pack(Object.fromEntries(parts)),
      cards: parts.size,
      shares,
      ...extras,
    };
  } finally {
    for (const bytes of parts.values()) bytes.fill(0);
  }
}

/** The cards of a backup as planned, with the export that planned them and their key. */
interface PlannedCards {
  readonly key: string;
  readonly exporter: CardExport;
  readonly plan: CardPlan;
}

/**
 * The card exports of one working session: the details MnemoCode invents for a design (a person
 * and an employer) are chosen once and kept across exports until forgotten, so that every file
 * shows the same cards. The cards of a backup, decoys included, are planned once and kept while the
 * same backup is saved again in the same design, so that its PDF and its images show the same
 * cards; only a SHA-256 of the backup and the settings tells it.
 */
export class MnemoCodeCardExporter {
  #session: InstanceType<MnemoCodeBinding["CardSession"]> | undefined;
  #planned: PlannedCards | undefined;

  /** Forgets the invented details and the planned cards: the next export makes new ones. */
  forgetDetails(): void {
    this.#forgetPlan();
    this.#session?.free();
    this.#session = undefined;
  }

  #forgetPlan(): void {
    const planned = this.#planned;
    this.#planned = undefined;
    planned?.plan.free();
    planned?.exporter.free();
  }

  #export(settings: CardSettings) {
    const binding = mnemocode();
    const exporter = new binding.CardExport(
      settings.template === "" ? undefined : settings.template,
      settings.pageSize === "" ? undefined : settings.pageSize,
      settings.orientation === "" ? undefined : settings.orientation,
      settings.qr,
    );
    try {
      if (settings.qr && settings.hiddenQr === true) exporter.setHiddenQr(true);
      this.#session ??= new binding.CardSession();
      exporter.useSession(this.#session);
      for (const [field, value] of Object.entries(settings.profile ?? {}))
        if (value !== undefined && value !== "") exporter.setDetail(field, value);
      for (const [part, value] of Object.entries(settings.copy ?? {}))
        if (value !== undefined && value !== "") exporter.setText(part, value);
      if (settings.title !== undefined && settings.title.trim() !== "")
        exporter.setTitle(settings.title.trim());
      return exporter;
    } catch (cause) {
      exporter.free();
      throw cause;
    }
  }

  /** The cards of a seed phrase encoded in `format`, `mode` and `dates`. */
  render(request: MnemoCodeCardRequest): MnemoCodeCardFile {
    const encoded = encodeMnemoCode(request.mnemonic, request.mode, request.format, request.dates);
    const { plan } = this.#plan(request, encoded);
    const separate = mnemoCodeCardOutput(request.pageSize) === "individual";
    using documents = separate ? plan.separate() : plan.sheets();
    // A hidden QR's visible contact is MnemoCode's: the page draws no image of it.
    const qrCodes: PrintedQr[] =
      request.qr && request.hiddenQr !== true && !separate
        ? [{ reference: "cards", payload: encoded.payload }]
        : [];
    return oneFile(
      files(documents, request.fileFormat),
      request.fileFormat,
      cardsName(request.pageSize),
      false,
      qrCodes,
    );
  }

  /** The plan of the cards of `encoded`, the one kept where the backup and the design are the same. */
  #plan(request: MnemoCodeCardRequest, encoded: ReturnType<typeof encodeMnemoCode>): PlannedCards {
    const { mnemonic: _mnemonic, dates: _dates, fileFormat: _fileFormat, ...design } = request;
    const key = bytesToHex(
      sha256(utf8ToBytes(JSON.stringify([design, encoded.payload, encoded.format, encoded.mode]))),
    );
    if (this.#planned?.key === key) return this.#planned;
    this.#forgetPlan();
    const exporter = this.#export(request);
    try {
      const plan = exporter.backup(encoded.payload, encoded.format, encoded.mode);
      this.#planned = { key, exporter, plan };
      return this.#planned;
    } catch (cause) {
      exporter.free();
      throw cause;
    }
  }

  /** The cards of a set of shares, each share's documents in the file. */
  renderShares(request: MnemoCodeShareCardRequest): MnemoCodeCardFile {
    using exporter = this.#export(request);
    const layout = mnemoCodeShareCardLayout(request.pageSize, request.layout);
    using cards = exporter.shares([...request.records], request.shareFormat, layout);
    const parts = new Map<string, Uint8Array>();
    const qrCodes: PrintedQr[] = [];
    for (let share = 0; share < cards.count; share++) {
      using documents = cards.documents(share);
      for (const [name, bytes] of files(documents, request.fileFormat))
        parts.set(`share-${share + 1}/${name}`, bytes);
      const payload = request.qr && request.hiddenQr !== true ? cards.qrPayload(share) : undefined;
      if (payload !== undefined) qrCodes.push({ reference: share + 1, payload });
    }
    return oneFile(
      parts,
      request.fileFormat,
      `share-${cardsName(request.pageSize)}`,
      true,
      qrCodes,
    );
  }

  /** Sample cards of a random phrase of `words` words, of one design or of every design. */
  renderSamples(request: MnemoCodeSampleRequest): MnemoCodeCardFile {
    using exporter = this.#export(request);
    using documents = exporter.preview(request.words, request.template === "");
    return oneFile(
      files(documents, request.fileFormat),
      request.fileFormat,
      `sample-${cardsName(request.pageSize)}`,
      false,
    );
  }
}
