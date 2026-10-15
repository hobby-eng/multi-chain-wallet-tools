import { zipSync } from "fflate";
import { ErrorCatalog } from "../../recovery-mnemocode/source/core/error-catalog.js";
import { ExportFileName } from "../../recovery-mnemocode/source/export/file-name.js";
import type {
  DocumentFormat,
  ImageFormat,
} from "../../recovery-mnemocode/source/export/document-formats.js";

const ERRORS = new ErrorCatalog("mnemocode.card-files", {
  "image-unavailable": () => "Image export is unavailable in this build.",
  "one-page-required": () => "A card must have exactly one page.",
});
const ARCHIVE_TIME = new Date(1980, 0, 1, 0, 0, 0);
type Rasterizer = (pdf: Uint8Array, format: ImageFormat) => Promise<readonly Uint8Array[]>;

/** Owns fresh card output during conversion and clears partially made files on refusal. */
export class MnemoCodeCardFiles {
  readonly #rasterize: Rasterizer | undefined;

  constructor(rasterize?: Rasterizer) {
    this.#rasterize = rasterize;
  }

  /** Converts an owned PDF to owned pages, clearing the PDF even if conversion fails. */
  async pages(pdf: Uint8Array, format: ImageFormat): Promise<readonly Uint8Array[]> {
    try {
      if (this.#rasterize === undefined) throw ERRORS.create("image-unavailable", []);
      return await this.#rasterize(pdf, format);
    } finally {
      pdf.fill(0);
    }
  }

  /** Transfers an owned PDF, or converts it to one page and clears rejected page buffers. */
  async single(pdf: Uint8Array, format: DocumentFormat): Promise<Uint8Array> {
    if (format === "pdf") return pdf;
    const images = await this.pages(pdf, format);
    const [image] = images;
    if (image !== undefined && images.length === 1) return image;
    for (const page of images) page.fill(0);
    throw ERRORS.create("one-page-required", []);
  }

  /** Admits each component and converts a set; failure clears all inputs and previous outputs. */
  async entries(
    cards: readonly { readonly name: string; readonly bytes: Uint8Array }[],
    format: DocumentFormat,
  ): Promise<Record<string, Uint8Array>> {
    const entries: Record<string, Uint8Array> = {};
    try {
      for (const card of cards) {
        const name = `${ExportFileName.checked(card.name)}.${format}`;
        entries[name] = await this.single(card.bytes, format);
      }
      return entries;
    } catch (cause) {
      for (const card of cards) card.bytes.fill(0);
      for (const bytes of Object.values(entries)) bytes.fill(0);
      throw cause;
    }
  }

  /** Makes an archive with its own bytes and clears all completed entry buffers in finally. */
  static pack(entries: Record<string, Uint8Array>): Uint8Array {
    try {
      return zipSync(entries, { level: 0, mtime: ARCHIVE_TIME });
    } finally {
      for (const entry of Object.values(entries)) entry.fill(0);
    }
  }
}
