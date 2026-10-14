import { PDFRef, type PDFDocument } from "pdf-lib";

/**
 * Keeps contact data, references, application branding and the time of an export out of a PDF:
 * its document information dictionary is removed whole. pdf-lib fills one with its own name and
 * the time whenever a document is made or loaded (CreationDate, ModDate), which would tell when a
 * backup was printed (owner, 2026-10-13). The dictionary is deleted from the file too, not only
 * unlinked from its trailer, so that no copy of it is written.
 */
export function clearDocumentMetadata(document: PDFDocument): void {
  const { context } = document;
  const info = context.trailerInfo.Info;
  if (info instanceof PDFRef) context.delete(info);
  delete context.trailerInfo.Info;
}
