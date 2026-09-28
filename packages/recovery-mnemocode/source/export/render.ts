import { resolveIdentityFor, sectorForTemplate } from './card-identities.js';
import { resolvePresentationFor } from './card-copy.js';
import { isCardPageSize } from './card-settings.js';
import { clearDocumentMetadata } from './document-metadata.js';
import { PDFDocument } from 'pdf-lib';
import type { CardContent, CardTemplate } from './templates.js';

export interface CardJob {
  readonly template: CardTemplate;
  readonly content: CardContent;
}

export interface RenderedCard {
  /** File name without extension: position and the first reference of the card. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * Preview and encode share this path; no simplified preview renderer exists.
 * A sheet size gives one page per template. A card size gives one page per card.
 */
export async function renderCards(jobs: readonly CardJob[]): Promise<Uint8Array> {
  if (jobs.length === 0) throw new Error('No approved card templates are installed yet.');
  const presentation = resolvePresentationFor(jobs[0]!.content);
  const profile = resolveIdentityFor(jobs[0]!.content, sectorForTemplate(jobs[0]!.template.id));
  const pages: Uint8Array[] = [];
  for (const { template, content } of jobs) {
    if (template.kind !== content.kind)
      throw new Error(`Template ${template.id} does not support ${content.kind}.`);
    const resolved: CardContent = {
      ...content,
      presentation: content.presentation ?? presentation,
      profile: { ...profile, ...content.profile },
      cardQr: content.cardQr === true,
    };
    if (resolved.kind === 'colors' && isCardPageSize(resolved.pageSize)) {
      if (resolved.cardQr)
        throw new Error(
          'A QR code is printed on a sheet only. Choose the A6 or A4 size for a QR code; separate cards never carry one.',
        );
      for (const card of await renderIndividualCards(template, resolved)) pages.push(card.bytes);
      continue;
    }
    // Without a page size every template uses the A6 sheet.
    const bytes = await template.render({ ...resolved, pageSize: resolved.pageSize ?? 'a6' });
    const source = await PDFDocument.load(bytes);
    if (source.getPageCount() === 0)
      throw new Error(`Template ${template.id} rendered an empty document.`);
    pages.push(bytes);
  }
  if (pages.length === 1) {
    const document = await PDFDocument.load(pages[0]!);
    clearDocumentMetadata(document);
    return document.save();
  }
  const merged = await PDFDocument.create();
  for (const bytes of pages) {
    const source = await PDFDocument.load(bytes);
    for (const page of await merged.copyPages(source, source.getPageIndices()))
      merged.addPage(page);
  }
  clearDocumentMetadata(merged);
  return merged.save();
}

/** One document per card or reference group, all sharing one identity. */
export async function renderIndividualCards(
  template: CardTemplate,
  content: CardContent,
): Promise<RenderedCard[]> {
  if (content.kind !== 'colors' || !template.renderIndividual)
    throw new Error('This template does not support individual business cards.');
  if (!content.colors.length) throw new Error('The card collection is empty.');
  if (content.pageSize !== undefined && !isCardPageSize(content.pageSize))
    throw new Error(
      'Separate cards need a card size. Choose the wallet or business size, or leave the size out.',
    );
  const resolvedContent: CardContent = {
    ...content,
    presentation: resolvePresentationFor(content),
    profile: resolveIdentityFor(content, sectorForTemplate(template.id)),
    cardQr: content.cardQr === true,
  };
  const perCard = template.referencesPerCard ?? 1;
  const count = Math.ceil(content.colors.length / perCard);
  const cards: RenderedCard[] = [];
  for (let index = 0; index < count; index++) {
    const code = content.colors[index * perCard]!.replace(/^#/u, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/u.test(code)) throw new Error('Invalid RGB reference.');
    cards.push({
      name: `${String(index + 1).padStart(2, '0')}-${code}`,
      bytes: await template.renderIndividual(resolvedContent, index),
    });
  }
  return cards;
}
