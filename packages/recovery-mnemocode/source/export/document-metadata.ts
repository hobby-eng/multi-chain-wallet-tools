import type { PDFDocument } from 'pdf-lib';

/** Keep contact data, references and application branding out of PDF metadata. */
export function clearDocumentMetadata(document: PDFDocument): void {
  document.setTitle('');
  document.setAuthor('');
  document.setSubject('');
  document.setKeywords([]);
  document.setCreator('');
  document.setProducer('');
}
