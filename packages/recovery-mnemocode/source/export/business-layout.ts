import { pageDimensions, resolvePageSize, type CardSettings } from "./card-settings.js";

// Points in a millimetre (page-units.ts), here too for the card layouts that take it with CardBox.
export { MM } from "./page-units.js";

/** A rectangle in millimetres, measured from the top left of the page. */
export interface MmRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Coordinates in millimetres, measured from the top left, of card `index`. */
export interface CardBox extends MmRect {
  index: number;
}

/**
 * The size of each of `count` cells that fill `span` with `gap` between neighbours. Every grid of
 * cards and sheet columns divides its room so.
 */
export function runCellSize(span: number, count: number, gap: number): number {
  return (span - (count - 1) * gap) / count;
}

/**
 * Where a run of `count` cells of `size`, `gap` apart, starts so that it is centred in `span`:
 * an incomplete last row of a grid, or the rows of a grid on a page.
 */
export function centredRunStart(span: number, count: number, size: number, gap: number): number {
  return (span - count * size - (count - 1) * gap) / 2;
}

/** Where a separate card lies on its page, in millimetres from the top left (separateCardPage). */
export interface SeparateCardPage {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly top: number;
  readonly scale: number;
}

/**
 * The page of a separate card of `cardWidth` x `cardHeight` millimetres and where the card lies on
 * it: the size and the orientation that `settings` ask for, the business size by default, checked
 * as every family checks them (pageDimensions); the card centred, and drawn smaller only where the
 * page is smaller than the card. The business cards place their separate cards so.
 */
export function separateCardPage(
  settings: Pick<CardSettings, "pageSize" | "orientation">,
  cardWidth: number,
  cardHeight: number,
): SeparateCardPage {
  const [width, height] = pageDimensions(
    resolvePageSize(settings.pageSize, true),
    settings.orientation,
  );
  const scale = Math.min(1, width / cardWidth, height / cardHeight);
  return {
    width,
    height,
    x: (width - cardWidth * scale) / 2,
    top: (height - cardHeight * scale) / 2,
    scale,
  };
}
