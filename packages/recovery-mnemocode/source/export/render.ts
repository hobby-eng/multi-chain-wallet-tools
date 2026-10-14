import { ExportDetails } from "./export-details.js";
import {
  assertPageSettings,
  assertSheetQr,
  isCardPageSize,
  assertSeparateCardSize,
  SHEET_PAGE_SIZE,
  type CardOrientation,
} from "./card-settings.js";
import { PDFDocument } from "pdf-lib";
import type { CardContent } from "./backup-cards.js";
import type { CardDrawing, CardTemplate } from "./templates.js";
import { separateCardName } from "./card-codes.js";
import { joinedDocuments, savedWithoutMetadata, type NamedDocument } from "./pdf-documents.js";
import { assertColorCardContent, EMPTY_CARD_COLLECTION } from "./card-content.js";
import { withPlannedDecoys } from "./card-plan.js";
import { SHEETS_ONLY, sheetsOnly } from "./template-catalog.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog, suppliedMessage } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.render", {
  "no-approved-card-templates-installed-yet": () => "No approved card templates are installed yet.",
  "template-does-not-support": (value0: string, value1: string) =>
    `Template ${value0} does not support ${value1}.`,
  "template-rendered-empty-document": (value0: string) =>
    `Template ${value0} rendered an empty document.`,
  "assert-individual-template-refused": suppliedMessage,
  "no-individual-cards": () => NO_INDIVIDUAL_CARDS,
  "empty-card-collection": () => EMPTY_CARD_COLLECTION,
});

/** One card output: the design that draws it and the content it draws. */
export interface CardJob {
  readonly template: CardTemplate;
  readonly content: CardContent;
}

/** A separate card, named by its position and the reference it prints. */
export type RenderedCard = NamedDocument;

/**
 * `content` with the decoys that `template` plans for it (withPlannedDecoys): for `separate`
 * cards, or for its sheet. A design that a host made without a sheet shape adds none.
 */
function plannedContent(
  drawing: CardDrawing,
  template: CardTemplate,
  content: CardContent,
  separate: boolean,
): Promise<CardContent> {
  const { sheetShape } = template;
  if (sheetShape === undefined) return Promise.resolve(content);
  return withPlannedDecoys(sheetShape, drawing, content, separate);
}

/**
 * `job` with the decoys that its template plans (plannedContent): for separate cards where its
 * page has a card size. A host that saves one export in several files, such as a PDF and its page
 * images, plans it once and passes it to each, so that every file shows the same cards.
 */
export async function plannedCardJob(drawing: CardDrawing, job: CardJob): Promise<CardJob> {
  assertPageSettings(job.content);
  const separate = isCardPageSize(job.content.pageSize);
  return { ...job, content: await plannedContent(drawing, job.template, job.content, separate) };
}

/**
 * `job`, planned for a sheet (plannedCardJob), as separate cards draw it: its cards and decoys
 * kept, its orientation the one the person gave, never the one the sheet plan chose, which turns a
 * sheet, not the page of one card (AUD-022-FUN002).
 */
export function separateCardJob(job: CardJob, orientation: CardOrientation | undefined): CardJob {
  const { orientation: _planned, ...content } = job.content;
  return { ...job, content: orientation === undefined ? content : { ...content, orientation } };
}

/**
 * Preview and encode share this path; no simplified preview renderer exists.
 * A sheet size gives one page per template. A card size gives one page per card. Every card is
 * drawn with `drawing`, the host's CardRenderer.
 */
export async function renderCards(
  drawing: CardDrawing,
  jobs: readonly CardJob[],
): Promise<Uint8Array> {
  if (jobs.length === 0) throw ERRORS.create("no-approved-card-templates-installed-yet", []);
  // Every page setting is checked before any choice is made or any template draws
  // (AUD-012-FUN006), and so is every design that a card page size draws as separate cards.
  for (const { template, content } of jobs) {
    assertPageSettings(content);
    if (content.kind === "colors" && isCardPageSize(content.pageSize))
      assertIndividualTemplate(template, jobs.length > 1);
  }
  // One person and one set of texts for every design; the employer suits the first.
  const details = ExportDetails.of(
    drawing.randomInt,
    defined(jobs[0]).content,
    defined(jobs[0]).template.style,
  );
  const pages: Uint8Array[] = [];
  for (const { template, content } of jobs) {
    if (template.kind !== content.kind)
      throw ERRORS.create("template-does-not-support", [
        `${template.id}`,
        `${String(content.kind)}`,
      ]);
    // A design's own texts and details print over those of the export.
    const resolved: CardContent = {
      ...content,
      presentation: content.presentation ?? details.presentation,
      profile: { ...details.profile, ...content.profile },
      cardQr: content.cardQr === true,
    };
    assertSheetQr(resolved);
    if (resolved.kind === "colors" && isCardPageSize(resolved.pageSize)) {
      for (const card of await renderIndividualCards(drawing, template, resolved))
        pages.push(card.bytes);
      continue;
    }
    const planned = await plannedContent(drawing, template, resolved, false);
    // Without a page size every template uses the A6 sheet.
    const bytes = await template.render(drawing, {
      ...planned,
      pageSize: planned.pageSize ?? SHEET_PAGE_SIZE,
    });
    const source = await PDFDocument.load(bytes);
    if (source.getPageCount() === 0)
      throw ERRORS.create("template-rendered-empty-document", [`${template.id}`]);
    pages.push(bytes);
  }
  if (pages.length === 1) {
    return savedWithoutMetadata(await PDFDocument.load(defined(pages[0])));
  }
  return joinedDocuments(pages);
}

/** Why content cannot be drawn as separate cards. */
const NO_INDIVIDUAL_CARDS = "Only color codes are drawn as individual business cards.";

/**
 * Refuses a template that draws no separate cards, such as a design printed on sheets only
 * (SHEETS_ONLY): also before any content exists. `named`: the design is one of several drawn
 * together, and the refusal names it.
 */
export function assertIndividualTemplate(template: CardTemplate, named = false): void {
  if (!template.renderIndividual)
    throw ERRORS.create("assert-individual-template-refused", [
      named ? sheetsOnly(`The design "${template.name}"`) : SHEETS_ONLY,
    ]);
}

/**
 * Refuses what cannot be drawn as separate cards: content that is no colors, or whose colors are
 * not the backup that its QR code holds (assertColorCardContent), a template without separate
 * cards, no card at all, a page setting that no card family prints, or a sheet size. The export
 * of a folder of cards checks it before any file is touched, and the drawing of the cards again
 * (AUD-012-ARC007).
 */
export function assertIndividualCards(template: CardTemplate, content: CardContent): void {
  assertIndividualTemplate(template);
  if (content.kind !== "colors") throw ERRORS.create("no-individual-cards", []);
  if (!content.colors.length) throw ERRORS.create("empty-card-collection", []);
  assertColorCardContent(content);
  assertPageSettings(content);
  assertSeparateCardSize(content.pageSize);
}

/** One document per card, all sharing one identity, drawn with `drawing`. */
export async function renderIndividualCards(
  drawing: CardDrawing,
  template: CardTemplate,
  content: CardContent,
): Promise<RenderedCard[]> {
  assertIndividualCards(template, content);
  // Checked by assertIndividualCards.
  const renderIndividual = defined(template.renderIndividual);
  const { profile, presentation } = ExportDetails.of(drawing.randomInt, content, template.style);
  const resolvedContent = await plannedContent(
    drawing,
    template,
    { ...content, presentation, profile, cardQr: content.cardQr === true },
    true,
  );
  const cards: RenderedCard[] = [];
  for (let index = 0; index < resolvedContent.colors.length; index++) {
    cards.push({
      name: separateCardName(resolvedContent, index),
      bytes: await renderIndividual(drawing, resolvedContent, index),
    });
  }
  return cards;
}
