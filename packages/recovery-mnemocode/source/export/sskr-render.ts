// Renders existing Shamir shares (SSKR) as cards in a card design: every share in one PDF, or one
// share at a time, whose documents hold that share alone. The shares are checked as one set first
// (Share.readSet), and the design, layout and invented details are settled once for the whole
// set, so that every card of it has the same studio, profile and look.
//
// Needs from the host: its CardRenderer (card-renderer.ts), built with its render platform
// (platform-node.ts in Node.js): its bundled fonts and artwork, the random choice of invented
// details, PNG decoding and encoding for the artwork, and the QR matrices of the cards.
// Does not: make, repair or combine shares, write files or folders, or turn pages into images;
// the command line does that around it (sskr-cards.ts), a page offers the bytes for download.

import {
  Share,
  shareToColors,
  isColorShareFormat,
  type ShareFormat,
  parseShareFormat,
  assertShareFormatHasCards,
  shareFormatHasCards,
} from "../sskr/transport.js";
import { sskrLongVector } from "../sskr/known-answers.js";
import { refusalMessage } from "../core/refusal.js";
import { ExportDetails } from "./export-details.js";
import type { CardSettings } from "./card-settings.js";
import { printedCode, separateCardName } from "./card-codes.js";
import type { UniformChoice } from "./platform.js";
import { catalogSheetShape, renderCatalogDesign, type CardDrawing } from "./templates.js";
import {
  resolveSskrLayout,
  type SskrCardContent,
  type SskrCardLayout,
  parseSskrLayout,
} from "./sskr-content.js";
import { joinedDocuments, type NamedDocument } from "./pdf-documents.js";
import {
  assertSeparateCards,
  designOfStyle,
  type CardStyle,
  type CatalogEntry,
} from "./template-catalog.js";
import { SHEET_PAGE_SIZE } from "./card-settings.js";
import { codeColors } from "./card-palette.js";
import { ownCards } from "./card-decoys.js";
import { withPlannedDecoys, type SheetShaper } from "./card-plan.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.sskr-render", {
  "unsupported-sskr-card-style": () => "Unsupported SSKR card style.",
  "share-cards-cannot-printed-every-seed-phrase-longest": (value0: string) =>
    `These share cards cannot be printed for every seed phrase, the longest of 24 words included: ${value0}`,
  "there-no-share-at-place-set": () => "There is no share at that place in the set.",
});

/**
 * How the cards of shares are drawn: the design, the layout, unless the page size decides it, and
 * the card settings.
 */
export interface SskrRenderOptions extends CardSettings {
  readonly style: CardStyle;
  /** Omitted: decided by the page size. */
  readonly layout?: SskrCardLayout;
  /**
   * The form of the shares: colors, or Unicode codes, which the cards print, one to a card. A QR
   * code holds what the cards print, so that a share read from it comes back as it was written.
   * Word numbers, Bytewords and the UR have no cards (shareFormatHasCards).
   */
  readonly shareFormat?: ShareFormat;
}

/** One share of the set, as its cards are made. */
export interface ShareCardShare {
  /** The share's reference printed on its cards: identifier, group and member, such as 376C-1-2. */
  readonly reference: string;
  /**
   * The base name of the share's output, such as collection-376C-1-2: the file of a whole share,
   * the folder of its fragments, and the QR code image of its sheets.
   */
  readonly name: string;
  /** How many documents its cards take: one per card for separate cards, otherwise one. */
  readonly documents: number;
  /**
   * The folder that keeps its fragments together, such as collection-376C-1-2, or undefined when
   * the share is one document.
   */
  readonly folder: string | undefined;
}

/** One document of a share. */
export type ShareCardDocument = NamedDocument;

type ResolvedOptions = Omit<SskrRenderOptions, "layout"> & { readonly layout: SskrCardLayout };

interface Member {
  readonly share: ShareCardShare;
  readonly memberIndex: number;
  readonly content: SskrCardContent;
}

/**
 * The cards of one set of shares. A class, so that the options, the shares, the invented details
 * and the decoys are checked and settled once, as the set is made (ShareCardSet.create), and every
 * document rendered from it belongs to the same set. It renders on request and keeps no rendered
 * document, only the shares it was given, as text, for as long as it is kept.
 */
export class ShareCardSet {
  readonly #drawing: CardDrawing;
  readonly #options: ResolvedOptions;
  /** The design of the cards, whose family draws them (template-catalog.ts). */
  readonly #design: CatalogEntry;
  readonly #members: readonly Member[];

  private constructor(
    drawing: CardDrawing,
    options: ResolvedOptions,
    design: CatalogEntry,
    members: readonly Member[],
  ) {
    this.#drawing = drawing;
    this.#options = options;
    this.#design = design;
    this.#members = members;
  }

  /**
   * Checks the layout, the style and the shares, settles the details of the cards, which are drawn
   * with `drawing`, the host's CardRenderer, and plans the decoys after each share's codes
   * (withPlannedDecoys). The decoys come from `randomInt`, the renderer's random integers below a
   * limit unless a host, such as its self-test, gives its own.
   */
  static async create(
    drawing: CardDrawing,
    records: readonly string[],
    requested: SskrRenderOptions,
    randomInt: UniformChoice = drawing.randomInt,
  ): Promise<ShareCardSet> {
    parseSskrLayout(requested.layout);
    // Checked before any choice is made: another value would print the colors silently
    // (AUD-012-FUN007).
    const format = requested.shareFormat ?? "colors";
    parseShareFormat(format);
    assertShareFormatHasCards(format);
    const layout = resolveSskrLayout(requested.layout, requested.pageSize);
    const options: ResolvedOptions = {
      ...requested,
      layout,
      // Sheets are A6 when no size is given, in every design, as ordinary cards are (render.ts);
      // separate cards have the business size.
      ...(requested.pageSize === undefined && layout !== "individual"
        ? { pageSize: SHEET_PAGE_SIZE }
        : {}),
    };
    const design = designOfStyle(options.style);
    if (design === undefined) throw ERRORS.create("unsupported-sskr-card-style", []);
    if (layout === "individual") assertSeparateCards(design);
    // The details first, then the shares: the order in which the random choices are made. Copies
    // of what the caller gave (ExportDetails), so that every card rendered later shows them as they
    // were.
    const { presentation, profile } = ExportDetails.of(drawing.randomInt, options, options.style);
    const shares = Share.readSet(records, false);
    const separate = options.layout === "individual";
    const shaper: SheetShaper = (shapeDrawing, cards, pageSize) =>
      catalogSheetShape(design, shapeDrawing, cards, pageSize);
    const members: Member[] = [];
    for (const read of shares) {
      const reference = shareReference(read);
      const cards: SskrCardContent = {
        ...options,
        kind: "sskr",
        ...shareCardFace(read, format),
        collectionReference: reference,
        qrCard: options.layout === "qr",
        cardQr: options.layout === "qr" || options.cardQr === true,
        presentation,
        profile,
      };
      const content = await withPlannedDecoys(shaper, drawing, cards, separate, randomInt);
      const name = `collection-${reference}`;
      const share: ShareCardShare = Object.freeze({
        reference,
        name,
        documents: separate ? content.colors.length : 1,
        folder: separate ? name : undefined,
      });
      members.push({ share, memberIndex: read.info.memberIndex, content });
    }
    return new ShareCardSet(drawing, options, design, members);
  }

  /**
   * The layout the set resolved to (resolveSskrLayout): QR cards, collection sheets or separate
   * cards, so that a host packs the documents as they were made.
   */
  get layout(): SskrCardLayout {
    return this.#options.layout;
  }

  /** The shares, in the order they were given. */
  get shares(): readonly ShareCardShare[] {
    return this.#members.map((member) => member.share);
  }

  /**
   * The QR codes that the sheets print, one for each share in the order given: its reference and
   * the text the code holds, the share in its written form. A host may also save each as an image
   * where the cards go, which a restore reads back. None for separate cards, which never carry
   * one, nor for sheets without a QR code.
   */
  get qrCodes(): readonly ShareQrCode[] {
    if (this.#options.layout === "individual") return [];
    return this.#members
      .filter((member) => member.content.cardQr === true)
      .map((member) =>
        Object.freeze({
          reference: member.share.reference,
          name: member.share.name,
          payload: member.content.payload,
        }),
      );
  }

  /**
   * What the cards of the share at `place` (counted from 0) print, in order, one code to a card:
   * the hex codes of its colors, or its Unicode codes, then the decoys.
   */
  printedCodes(place: number): readonly string[] {
    const { content } = this.#member(place);
    return content.colors.map((_, index) => printedCode(content, index));
  }

  /** How many cards of the share at `place` print the share's own codes, before the decoys. */
  ownCodes(place: number): number {
    return ownCards(this.#member(place).content);
  }

  /** The documents of the share at `place` (counted from 0), rendered one at a time, in order. */
  async *documents(place: number): AsyncGenerator<ShareCardDocument> {
    const member = this.#member(place);
    for (let index = 0; index < member.share.documents; index++) {
      const bytes = await this.#render(member, index);
      yield { name: this.#documentName(member, index), bytes };
    }
  }

  /**
   * Refuses `requested` where the cards of a share of the longest secret, 32 bytes for a 24-word
   * phrase (sskrLongVector, public), cannot be drawn: a typed detail too long for its card, or a
   * material with fewer distinct samples than such a share has codes. A host asks it before any
   * secret is asked, so that it refuses then, not after the shares are made (AUD-022-FUN004).
   * Nothing is kept; the render takes about a second.
   */
  static async assertPrintable(drawing: CardDrawing, requested: SskrRenderOptions): Promise<void> {
    try {
      const set = await ShareCardSet.create(drawing, [...sskrLongVector.shares], requested);
      (await set.renderShare(0)).fill(0);
    } catch (error) {
      throw ERRORS.create("share-cards-cannot-printed-every-seed-phrase-longest", [
        `${refusalMessage(error)}`,
      ]);
    }
  }

  /** One PDF with every page of the share at `place` and of no other share. */
  async renderShare(place: number): Promise<Uint8Array> {
    return this.#combined([this.#member(place)]);
  }

  /** One PDF with every page of every share, in the order they were given. */
  async renderAll(): Promise<Uint8Array> {
    return this.#combined(this.#members);
  }

  #member(place: number): Member {
    const member = Number.isSafeInteger(place) ? this.#members[place] : undefined;
    if (member === undefined) throw ERRORS.create("there-no-share-at-place-set", []);
    return member;
  }

  /**
   * The file name of the document `index` of `member`: a whole share is named after the share, a
   * card after its place, counted from 01, and the code it prints.
   */
  #documentName(member: Member, index: number): string {
    if (member.share.folder === undefined) return member.share.name;
    return separateCardName(member.content, index);
  }

  /** The document `index` of `member`: a separate card, a collection sheet or a QR card. */
  #render(member: Member, index: number): Promise<Uint8Array> {
    const { layout } = this.#options;
    // Only separate cards are asked for by their index; a sheet and a QR card are one document.
    const fragment = layout === "individual" ? index : undefined;
    // On QR cards the mixed style starts each share's sheet at another design, by its member.
    const businessOffset = layout === "qr" ? member.memberIndex : 0;
    return renderCatalogDesign(
      this.#design,
      this.#drawing,
      member.content,
      fragment,
      businessOffset,
    );
  }

  /** The pages of every document of `members`, in order, in one PDF without metadata. */
  #combined(members: readonly Member[]): Promise<Uint8Array> {
    // Each document is drawn only when its pages are joined, so that one at a time is in memory.
    const render = (member: Member, index: number) => this.#render(member, index);
    async function* documents(): AsyncGenerator<Uint8Array> {
      for (const member of members)
        for (let index = 0; index < member.share.documents; index++) yield render(member, index);
    }
    return joinedDocuments(documents());
  }
}

/**
 * How many cards of `record`, a share, print its own codes in `format`, before the decoys: what
 * the sheet for heirs tells (HeirBackup codes); undefined where the form has no cards.
 */
export function ownShareCards(record: string, format: ShareFormat): number | undefined {
  if (!shareFormatHasCards(format)) return undefined;
  return shareCardFace(Share.read(record), format).colors.length;
}

/** The reference that the cards of `share` print: its set, group and member, such as 4BBF-1-2. */
export function shareReference(share: Share): string {
  const { identifier, groupIndex, memberIndex } = share.info;
  return `${identifier.toString(16).padStart(4, "0")}-${groupIndex + 1}-${memberIndex + 1}`.toUpperCase();
}

/**
 * What the cards of a share in `format` print, before their decoys: its colors, which are the
 * share, in a color form; in Unicode codes its codes, one to a card, with a color for each
 * distinct code that only decorates it (codeColors). The QR code holds the share as written, so
 * that a share read from it comes back as it was.
 */
export function shareCardFace(
  share: Share,
  format: ShareFormat,
): { readonly labels?: string[]; readonly colors: string[]; readonly payload: string } {
  const payload = share.write(format);
  if (isColorShareFormat(format)) return { colors: shareToColors(share.ur), payload };
  const labels = payload.split(" ");
  return { labels, colors: codeColors(labels), payload };
}

/** The QR code that the sheets of one share print (ShareCardSet.qrCodes). */
export interface ShareQrCode {
  /** The share's reference, as its cards and file names show it: identifier, group, member. */
  readonly reference: string;
  /** The base name of the share's output (ShareCardShare name), which its image is named after. */
  readonly name: string;
  /** The text the code holds: the share in its written form. */
  readonly payload: string;
}

/**
 * Each page belongs to one share; the combined file contains the complete supplied set, drawn with
 * `drawing`, the host's CardRenderer.
 */
export async function renderSskrPdf(
  drawing: CardDrawing,
  records: readonly string[],
  options: SskrRenderOptions,
): Promise<Uint8Array> {
  return (await ShareCardSet.create(drawing, records, options)).renderAll();
}
