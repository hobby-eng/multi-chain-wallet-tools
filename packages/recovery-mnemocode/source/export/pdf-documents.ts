// The PDF documents of every export: a new one with the bundled font, and one made of the pages of
// several, and a document saved without its metadata. Each family of cards and the sheet for heirs
// draw on the first; the export of cards and of shares joins their documents with the second. A
// document whose metadata is cleared just before it is saved is saved by savedWithoutMetadata;
// the renderers that clear it when they create the document keep doing so (document-metadata.ts).

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont } from "pdf-lib";
import { clearDocumentMetadata } from "./document-metadata.js";
import { readRenderAsset, type AssetSource } from "./platform.js";

/** One document of an export: its PDF, and the name of its file without the extension. */
export interface NamedDocument {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The font of every card and sheet: DejaVu Sans, cut to the characters that MnemoCode prints. */
const UI_FONT = "fonts/DejaVuSans-UI.ttf";

/**
 * A new PDF with the UI font, read from the host's `assets`, embedded, only the characters drawn
 * kept in the file.
 */
export async function documentWithFont(
  assets: AssetSource,
): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readRenderAsset(assets, UI_FONT), { subset: true });
  return { doc, font };
}

/** The bytes of `doc` with its metadata cleared first (clearDocumentMetadata). */
export function savedWithoutMetadata(doc: PDFDocument): Promise<Uint8Array> {
  clearDocumentMetadata(doc);
  return doc.save();
}

/**
 * One PDF of every page of `documents`, in their order and each in its own page order, without
 * metadata. The documents may come one at a time, made only when their pages are copied.
 */
export async function joinedDocuments(
  documents: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const joined = await PDFDocument.create();
  for await (const bytes of documents) {
    const source = await PDFDocument.load(bytes);
    for (const page of await joined.copyPages(source, source.getPageIndices()))
      joined.addPage(page);
  }
  return savedWithoutMetadata(joined);
}
