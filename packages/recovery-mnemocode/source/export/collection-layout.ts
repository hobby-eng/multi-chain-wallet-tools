// The layout of a collection sheet, in millimetres: how many cards fit a page of a size and in
// which grid, where each card and its caption go, and the plan of the pages of a set of cards.
// collection-sheet.ts draws the sheet that it lays out.

import { type PDFFont } from "pdf-lib";
import { MM, centredRunStart, runCellSize, type CardBox } from "./business-layout.js";
import { numberWord } from "../core/prose.js";
import { qrSizeForModuleMm } from "./card-qr.js";
import type { QrModules } from "./platform.js";
import {
  CARD_ORIENTATIONS,
  pageDimensions,
  parseOrientation,
  parsePageSize,
  type CardOrientation,
  type CardSettings,
  type CardPageSize,
  isCardPageSize,
} from "./card-settings.js";
import { type CardGrid, type MaterialBackdrop } from "./study-backdrops.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.collection-layout", {
  "qr-cannot-fit-on-design-study-choose-larger": () =>
    "The QR cannot fit on the design study; choose a larger page size.",
  "no-room": () => NO_ROOM,
  "sheet-holds-at-most-cards": (value0: string) => `A sheet holds at most ${value0} cards.`,
  "invalid-design-study-layout": () => "Invalid design study layout.",
});

/** Where one card of a sheet goes, and where its caption goes below it, in millimetres. */
export interface StudyBox extends CardBox {
  readonly captionTop: number;
  readonly captionWidth: number;
  readonly captionX: number;
}

/**
 * The measures of a sheet of one page size, in millimetres and points (STUDY_METRICS): its room,
 * its text and its heading. The frame and the layout read every per-size value from it.
 */
export interface StudySheetMetrics {
  /** The margin on each side, and the heights of the heading and of the footer, in millimetres. */
  readonly margin: number;
  readonly headingHeight: number;
  readonly footer: number;
  /** The size of the captions in points, and the height of one caption line in millimetres. */
  readonly fontSize: number;
  readonly lineHeight: number;
  /** The room between two cards, and between the cards and the QR code, in millimetres. */
  readonly gap: number;
  /** The room that a caption adds below its lines, and its distance below the card. */
  readonly captionPad: number;
  readonly captionOffset: number;
  /** The tops of the heading's lines and of the rule under it, from the top edge. */
  readonly rows: {
    readonly title: number;
    readonly kind: number;
    readonly subtitle: number;
    /** Absent where the heading has no rule under it: a card-sized page has no room for one. */
    readonly rule?: number;
  };
  /** The size of the title, in points. */
  readonly titleSize: number;
  /** The heading's two smaller lines and the footer, at these shares of the caption size. */
  readonly headingScale: number;
  readonly footerScale: number;
  /** The top of the footer line, from the bottom edge. */
  readonly footerBaseline: number;
  /** The least size of the heading and the footer, in points. */
  readonly frameMinimumFont: number;
}

/**
 * The layout of a collection sheet: its size, the grid of its cards, the box of each card and the
 * place of its QR code, in millimetres.
 */
export interface StudyLayout {
  readonly width: number;
  readonly height: number;
  /** The cards in a row, and the rows. */
  readonly columns: number;
  readonly rows: number;
  /** The measures of the sheet's page size. */
  readonly metrics: StudySheetMetrics;
  /** Where the cards may start: below the heading, or below the QR code and its caption. */
  readonly header: number;
  /** A card-sized page: the heading sits beside the QR code, and there is no rule or slogan. */
  readonly compact: boolean;
  readonly cards: readonly StudyBox[];
  /** The pitch of the cards, which a material's backdrop lays its pattern out by. */
  readonly grid: CardGrid;
  readonly qr?: { readonly x: number; readonly y: number; readonly size: number };
}

/** The backdrop of a design study: one of the three plain themes, or a material's own. */
export type StudyTheme = "cool" | "warm" | "noir" | MaterialBackdrop;

/** The side of one module of a sheet's QR code, in millimetres. */
export const COLLECTION_QR_MODULE_MM = 0.3;

/**
 * The least side of a sheet's QR code, in millimetres: its caption, COLLECTION QR, is 11.5 mm wide
 * at the least size that a sheet prints (MINIMUM_FONT), and the code of 24 Unicode codes is
 * smaller than that (a test keeps the caption within it).
 */
const COLLECTION_QR_MINIMUM_MM = 12;

/**
 * The smallest size, in points, that a sheet prints: the captions, the QR caption and the frame of
 * a card-sized page. studyCaptionWidth measures captions at it, so that a column the layout accepts
 * never refuses its caption.
 */
export const MINIMUM_FONT = 4;

/**
 * Millimetres added to a caption's measured width, so that turning the column's millimetres back
 * into points for fit() never leaves the caption a rounding error below MINIMUM_FONT.
 */
const CAPTION_WIDTH_SLACK_MM = 0.1;

/** The smallest size of the frame of a sheet of A size, in points. */
const SHEET_FRAME_MINIMUM_FONT = 4.5;

/** How far the plate behind the QR code reaches beyond it on each side, in millimetres. */
export const QR_PLATE_MARGIN = 0.6;

/** The least height of a card's picture on a sheet, in millimetres: below it no design shows. */
const MINIMUM_CARD_HEIGHT = 2;

/**
 * The measures of a sheet of each page size. A card-sized page is laid out tighter than a sheet,
 * an A4 sheet larger; the approved sheets were drawn with these numbers. Keyed by every size, so
 * that a new size cannot be printed before its row is written.
 */
const STUDY_METRICS: Readonly<Record<CardPageSize, StudySheetMetrics>> = Object.freeze({
  business: {
    margin: 3,
    headingHeight: 11,
    footer: 4.5,
    fontSize: 4.3,
    lineHeight: 2.1,
    gap: 1.5,
    captionPad: 0.6,
    captionOffset: 0.5,
    rows: { title: 1.8, kind: 5.4, subtitle: 7.5 },
    titleSize: 8,
    // A card-sized page already prints its frame at the caption size, the smallest legible one.
    headingScale: 1,
    footerScale: 1,
    footerBaseline: 3,
    frameMinimumFont: MINIMUM_FONT,
  },
  a6: {
    margin: 5,
    headingHeight: 23,
    footer: 9,
    fontSize: 6,
    lineHeight: 3,
    gap: 3,
    captionPad: 1.2,
    captionOffset: 1,
    rows: { title: 5.5, kind: 12, subtitle: 15.4, rule: 19.4 },
    titleSize: 13,
    headingScale: 0.95,
    footerScale: 0.9,
    footerBaseline: 5.2,
    frameMinimumFont: SHEET_FRAME_MINIMUM_FONT,
  },
  // Between A6 and A4, as A5 lies between them (owner, 2026-10-13).
  a5: {
    margin: 7,
    headingHeight: 28,
    footer: 11,
    fontSize: 7,
    lineHeight: 3.5,
    gap: 4.5,
    captionPad: 1.2,
    captionOffset: 1,
    rows: { title: 7.2, kind: 15.2, subtitle: 19.4, rule: 23.7 },
    titleSize: 16,
    headingScale: 0.95,
    footerScale: 0.9,
    footerBaseline: 6.3,
    frameMinimumFont: SHEET_FRAME_MINIMUM_FONT,
  },
  a4: {
    margin: 10,
    headingHeight: 33,
    footer: 13,
    fontSize: 8,
    lineHeight: 4,
    gap: 6,
    captionPad: 1.2,
    captionOffset: 1,
    rows: { title: 9, kind: 18.5, subtitle: 23.5, rule: 28 },
    titleSize: 19,
    headingScale: 0.95,
    footerScale: 0.9,
    footerBaseline: 7.5,
    frameMinimumFont: SHEET_FRAME_MINIMUM_FONT,
  },
});

/**
 * The most cards that one sheet lays out, one box per card: more than the 33 Unicode codes of the
 * longest share with MAX_DECOYS decoys (card-decoys.ts; a test checks it).
 */
export const MAX_SHEET_CARDS = 64;

/** The most cards in one row of a sheet. */
const MAX_COLUMNS = 10;

/**
 * The fewest rows of a sheet where they fit, even where fewer rows would give larger cards: two
 * long rows leave the page empty above and below them (owner, 2026-10-13). A card-sized page has
 * no such rule (hasEnoughRows).
 */
export const MIN_SHEET_ROWS = 3;

/**
 * The order in which a sheet's plan prefers grids, as a person is told it (planCollectionSheet).
 */
export const SHEET_PLAN_TEXT = `at least ${numberWord(MIN_SHEET_ROWS)} rows, the largest cards`;

/**
 * Whether a grid of `rows` rows has enough of them (MIN_SHEET_ROWS): always on a card-sized page
 * (`compact`), which has no such rule.
 */
function hasEnoughRows(rows: number, compact: boolean): boolean {
  return compact || rows >= MIN_SHEET_ROWS;
}

/**
 * How much larger, as a share of its area, a card of one plan must be to win over another: less
 * is a rounding error, and then more cards, which fill more of the page, and the page's own
 * orientation win.
 */
const LARGER_CARD = 0.001;

/** Why no layout fits the cards on a page. */
const NO_ROOM =
  "The cards and their codes cannot fit legibly on this page; choose a larger page size, such as A6.";

/**
 * The lines that each caption is given room for: a count, or the count in a column `width` mm wide
 * at the sheet's caption size `size` in points, where long lines take two (StudyCaptions).
 */
export type CaptionLines = number | ((width: number, size: number) => number);

/**
 * A grid of a sheet: its columns and rows, the width of a cell, and its card's and caption's
 * height.
 */
interface SheetGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly imageHeight: number;
  readonly captionHeight: number;
}

/**
 * Where the sheet's QR code goes, if it prints one, and the room that is left for the cards on a
 * page `width` by `height` mm: below the code, or beside it on a card-sized page that is wide.
 */
function roomForCards(
  [width, height]: readonly [number, number],
  metrics: StudySheetMetrics,
  compact: boolean,
  code: QrModules | undefined,
): {
  qr: StudyLayout["qr"];
  availableWidth: number;
  availableHeight: number;
  contentTop: number;
} {
  const { margin, headingHeight, footer, lineHeight, gap } = metrics;
  const qrSize =
    code === undefined
      ? 0
      : qrSizeForModuleMm(code, COLLECTION_QR_MINIMUM_MM, COLLECTION_QR_MODULE_MM);
  const qr =
    code === undefined
      ? undefined
      : {
          x: width - margin - qrSize,
          // Raised into the corner of the heading, so that the code and its caption end above the
          // cards where they fit: below the full margin, they pushed the cards down by a few
          // millimetres, and a low sheet, such as A6 in landscape, then showed two long rows with
          // empty bands above and below (owner, 2026-10-13).
          y: margin / 2,
          size: qrSize,
        };
  let availableWidth = width - margin * 2;
  let availableHeight = height - headingHeight - footer;
  let contentTop = headingHeight;
  if (qr) {
    if (qr.x < margin || qr.y + qr.size + lineHeight >= height - footer)
      throw ERRORS.create("qr-cannot-fit-on-design-study-choose-larger", []);
    if (compact && width >= height) {
      // A card-sized page is too low to place the cards below the QR code; they sit beside it.
      availableWidth -= qrSize + gap * 2;
    } else {
      // The cards start below the QR code, so they stay centred under the heading.
      contentTop = Math.max(headingHeight, qr.y + qrSize + lineHeight + gap);
      availableHeight = height - contentTop - footer;
    }
  }
  return { qr, availableWidth, availableHeight, contentTop };
}

/**
 * The grid of `count` cards of `aspect` with the largest cards in the room that is left, wide by
 * high in mm, in the order of preference that collectionSheetLayout names; NO_ROOM where none fits.
 */
function largestGrid(
  count: number,
  aspect: number,
  [availableWidth, availableHeight]: readonly [number, number],
  sheet: {
    readonly metrics: StudySheetMetrics;
    readonly compact: boolean;
    readonly linesIn: (width: number, size: number) => number;
    readonly minimumCaptionWidth: number;
  },
): SheetGrid {
  const { metrics, compact, linesIn, minimumCaptionWidth } = sheet;
  const { gap, lineHeight } = metrics;
  const grids: SheetGrid[] = [];
  for (let columns = 1; columns <= Math.min(count, MAX_COLUMNS); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = runCellSize(availableWidth, columns, gap);
    if (cellWidth < minimumCaptionWidth) continue;
    // The narrower the column, the more caption lines may take two lines each.
    const captionHeight = linesIn(cellWidth, metrics.fontSize) * lineHeight + metrics.captionPad;
    const imageHeight = Math.min(
      cellWidth / aspect,
      runCellSize(availableHeight, rows, gap) - captionHeight,
    );
    if (imageHeight > MINIMUM_CARD_HEIGHT)
      grids.push({ columns, rows, cellWidth, imageHeight, captionHeight });
  }
  const full = grids.filter((grid) => count % grid.columns === 0);
  const tall = full.filter((grid) => hasEnoughRows(grid.rows, compact));
  // The largest card, the first such grid on a tie; every card has the same aspect.
  const best = (tall.length > 0 ? tall : full.length > 0 ? full : grids).reduce<
    SheetGrid | undefined
  >(
    (chosen, grid) =>
      chosen === undefined || grid.imageHeight > chosen.imageHeight ? grid : chosen,
    undefined,
  );
  if (!best) throw ERRORS.create("no-room", []);
  return best;
}

/**
 * A collection is a single design proposal, never a stack of duplex print cards. `code` is the QR
 * code that the sheet prints, if any, whose size the layout makes room for. The grid with the
 * largest cards, in this order of preference: of the column counts whose rows are all full and
 * that have at least MIN_SHEET_ROWS rows (any number on a card-sized page, hasEnoughRows); else of
 * those whose rows are all full, since a sheet whose last row is short looks unfinished (owner,
 * 2026-10-13); and only where no such count fits, of any.
 */
export function collectionSheetLayout(
  settings: CardSettings,
  count: number,
  aspect: number,
  captionLines: CaptionLines,
  code?: QrModules,
  minimumCaptionWidth = 0,
): StudyLayout {
  if (Number.isInteger(count) && count > MAX_SHEET_CARDS)
    throw ERRORS.create("sheet-holds-at-most-cards", [`${MAX_SHEET_CARDS}`]);
  const linesIn = typeof captionLines === "number" ? () => captionLines : captionLines;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    aspect <= 0 ||
    (typeof captionLines === "number" && captionLines < 1)
  )
    throw ERRORS.create("invalid-design-study-layout", []);
  const size = parsePageSize(settings.pageSize);
  const [width, height] = pageDimensions(size, settings.orientation);
  // Ordinary cards of the business size are separate cards and never come here. The compact
  // sheet exists for the QR card of one Shamir share, which is offered in every size.
  const compact = isCardPageSize(size);
  const metrics = STUDY_METRICS[size];
  const { margin, gap } = metrics;
  const { qr, availableWidth, availableHeight, contentTop } = roomForCards(
    [width, height],
    metrics,
    compact,
    code,
  );
  const best = largestGrid(count, aspect, [availableWidth, availableHeight], {
    metrics,
    compact,
    linesIn,
    minimumCaptionWidth,
  });
  const { columns, rows, cellWidth, imageHeight, captionHeight } = best;
  const cellHeight = imageHeight + captionHeight;
  // The columns share the width out in equal cells. The rows share the height out evenly: the room
  // left beyond the rows and the least gap between them goes in equal parts above, between and
  // below them, so that the cards fill the page symmetrically rather than stand as one block in
  // its middle (owner, 2026-10-13).
  const spare = Math.max(0, availableHeight - rows * cellHeight - (rows - 1) * gap);
  const rowGap = gap + spare / (rows + 1);
  const top = contentTop + spare / (rows + 1);
  const cards = Array.from({ length: count }, (_, index): StudyBox => {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    const captionX =
      margin +
      centredRunStart(availableWidth, rowCount, cellWidth, gap) +
      (index % columns) * (cellWidth + gap);
    const y = top + row * (cellHeight + rowGap);
    const cardWidth = imageHeight * aspect;
    return {
      index,
      x: captionX + (cellWidth - cardWidth) / 2,
      y,
      width: cardWidth,
      height: imageHeight,
      captionX,
      captionWidth: cellWidth,
      captionTop: y + imageHeight + metrics.captionOffset,
    };
  });
  return {
    width,
    height,
    columns,
    rows,
    metrics,
    header: contentTop,
    compact,
    cards,
    // The middle of the gap before the first full row's first card and above the first row.
    grid: {
      left: margin + centredRunStart(availableWidth, columns, cellWidth, gap) - gap / 2,
      top: top - rowGap / 2,
      columnPitch: cellWidth + gap,
      rowPitch: cellHeight + rowGap,
    },
    ...(qr === undefined ? {} : { qr }),
  };
}

/** What the sheet of a design is planned from: its font, the shape of a card and the captions. */
export interface SheetShape {
  readonly font: PDFFont;
  /** The shape of a card's box, width over height. */
  readonly aspect: number;
  /**
   * The lines under each of the first `count` cards; throws why the design cannot show so many,
   * such as more codes than a material has samples.
   */
  readonly captions: (count: number) => readonly (readonly string[])[];
}

/** How many cards a sheet holds, decoys included, and how it is turned (planCollectionSheet). */
export interface SheetPlan {
  readonly count: number;
  readonly orientation: CardOrientation;
}

/** The orientation in which a page of `size` is first listed (pageDimensions). */
function ownOrientation(size: CardPageSize): CardOrientation {
  const [width, height] = pageDimensions(size);
  return width >= height ? "landscape" : "portrait";
}

/**
 * The sheet for `own` codes of a backup in the design `shape`, on the page size of `settings`:
 * at least one decoy, at most as many as give `most` cards in all, all rows full, at least
 * MIN_SHEET_ROWS rows where they fit, and the largest cards (owner, 2026-10-13). The orientation
 * is the one given, or the one whose plan wins by the same rules: enough rows first, then the
 * larger cards, the page's own on a tie; on a tie of sizes, more cards, which fill more of the
 * page. `code` is the QR code it prints.
 */
export function planCollectionSheet(
  settings: Pick<CardSettings, "pageSize" | "orientation">,
  own: number,
  most: number,
  shape: SheetShape,
  code?: QrModules,
): SheetPlan {
  const size = parsePageSize(settings.pageSize);
  const given = parseOrientation(settings.orientation);
  const first = ownOrientation(size);
  const orientations =
    given === undefined
      ? [first, ...CARD_ORIENTATIONS.filter((orientation) => orientation !== first)]
      : [given];
  let best: (SheetPlan & { readonly area: number; readonly tall: boolean }) | undefined;
  let refusal: unknown;
  for (const orientation of orientations)
    for (let count = own + 1; count <= Math.min(most, MAX_SHEET_CARDS); count++) {
      let layout: StudyLayout;
      try {
        // Measured as the sheet measures them (drawCollectionStudy), so that it draws this plan.
        const room = new StudyCaptions(shape.font, shape.captions(count));
        layout = collectionSheetLayout(
          { pageSize: size, orientation },
          count,
          shape.aspect,
          (width, lineSize) => room.lines(width, lineSize),
          code,
          room.minimumWidth,
        );
      } catch (error) {
        refusal ??= error;
        continue;
      }
      if (count % layout.columns !== 0) continue;
      const area = defined(layout.cards[0]).width * defined(layout.cards[0]).height;
      // A sheet of enough rows wins over one of fewer whatever their cards (MIN_SHEET_ROWS).
      const tall = hasEnoughRows(layout.rows, layout.compact);
      // Of cards as large, the plan with more of them, which fills more of the page, also across
      // its width (owner, 2026-10-13).
      const larger = best !== undefined && area > best.area * (1 + LARGER_CARD);
      const asLarge = best !== undefined && !larger && area >= best.area * (1 - LARGER_CARD);
      if (
        best === undefined ||
        (tall && !best.tall) ||
        (tall === best.tall && (larger || (asLarge && count > best.count)))
      )
        best = { count, orientation, area, tall };
    }
  if (best === undefined) throw refusal instanceof Error ? refusal : ERRORS.create("no-room", []);
  return { count: best.count, orientation: best.orientation };
}

/**
 * The width in millimetres that the caption `lines` take at the smallest size of a caption, with
 * room to spare.
 */
export function studyCaptionWidth(font: PDFFont, lines: readonly string[]): number {
  const widest = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, MINIMUM_FONT)));
  return widest / MM + CAPTION_WIDTH_SLACK_MM;
}

/** One line of a caption, measured in points at 1 pt, and the halves it may be split into. */
interface MeasuredLine {
  readonly text: string;
  readonly width: number;
  /**
   * The two halves that balance best, split at a space, and the wider half's width; none if one
   * word.
   */
  readonly halves?: { readonly texts: readonly [string, string]; readonly width: number };
}

/** `text` with the two halves that balance best, split at a space, as `measure` measures them. */
function measuredLine(text: string, measure: (text: string) => number): MeasuredLine {
  const words = text.split(" ").filter((word) => word !== "");
  let halves: MeasuredLine["halves"];
  for (let cut = 1; cut < words.length; cut++) {
    const texts = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")] as const;
    const width = Math.max(...texts.map(measure));
    if (halves === undefined || width < halves.width) halves = { texts, width };
  }
  return { text, width: measure(text), ...(halves === undefined ? {} : { halves }) };
}

/**
 * The captions under the cards of one sheet, measured once in its font: how many lines each takes
 * in a column of a given width, and those lines. The first line of a caption, the card's number and
 * its code, always stays one line; a later one, such as the name of a finish, that would print
 * smaller than the sheet's caption size is split in two at the space that balances the halves best
 * (owner, 2026-10-13: two lines rather than small print, in every design). A class, so that each
 * text is measured once while a layout tries its columns, and the sheet draws what it measured.
 */
export class StudyCaptions {
  readonly #captions: readonly (readonly MeasuredLine[])[];
  readonly #minimumWidth: number;

  /** The captions `captions`, one list of lines per card, in the order of the cards. */
  constructor(font: PDFFont, captions: readonly (readonly string[])[]) {
    // Widths at 1 pt, which grow in proportion to the size.
    const widths = new Map<string, number>();
    const measure = (text: string): number => {
      let width = widths.get(text);
      if (width === undefined) widths.set(text, (width = font.widthOfTextAtSize(text, 1)));
      return width;
    };
    this.#captions = captions.map((lines) => lines.map((line) => measuredLine(line, measure)));
    // The narrowest column that still prints every line, split where it may be, at MINIMUM_FONT.
    const narrowest = this.#captions.flatMap((lines) =>
      lines.map((line, index) =>
        index === 0 || line.halves === undefined || line.width <= line.halves.width
          ? [line.text]
          : line.halves.texts,
      ),
    );
    this.#minimumWidth = studyCaptionWidth(font, narrowest.flat());
  }

  /** The least width of a column in millimetres, below which a caption would not print. */
  get minimumWidth(): number {
    return this.#minimumWidth;
  }

  /** The most lines that a caption takes in a column `width` mm wide at `size` points. */
  lines(width: number, size: number): number {
    return Math.max(1, ...this.#captions.map((lines) => this.#split(lines, width, size).length));
  }

  /** The lines of the caption of card `index` in a column `width` mm wide at `size` points. */
  wrapped(index: number, width: number, size: number): string[] {
    return this.#split(this.#captions[index] ?? [], width, size);
  }

  #split(lines: readonly MeasuredLine[], width: number, size: number): string[] {
    const room = width * MM;
    return lines.flatMap((line, index) =>
      index === 0 || line.halves === undefined || line.width * size <= room
        ? [line.text]
        : [...line.halves.texts],
    );
  }
}
