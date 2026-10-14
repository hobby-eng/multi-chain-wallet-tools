import { rgb, type PDFPage } from "pdf-lib";
import { MM } from "./business-layout.js";
import { pdfPoint, pdfRect } from "./business-render-primitives.js";

/**
 * Pages behind a material's design study, each from the world the material belongs to: a car
 * showroom, an exposed concrete wall, a tiled bathroom wall and an oak floor. They are drawn
 * lightly, as a premium paper would carry them, so that the samples stay in front.
 */
export type MaterialBackdrop = "studio" | "concrete" | "tiled" | "parquet";

type Color = ReturnType<typeof rgb>;

/**
 * The pitch of the cards on a sheet, in millimetres from the top left corner of the page: the
 * middle of the gap before the first column and above the first row, and how far one column or
 * one row is from the next. A backdrop lays its joints out by it, so that they run between the
 * cards and every card sits in the middle of its own panel or tile: joints laid out by the page
 * alone ran along the edges of some samples, and a panel two cards wide held each of them off its
 * middle, which made the samples look shifted (owner, 2026-10-13).
 */
export interface CardGrid {
  readonly left: number;
  readonly top: number;
  readonly columnPitch: number;
  readonly rowPitch: number;
}

/** Where a run of `step` that has a joint at `joint` starts, at or before the page's edge. */
function runStart(joint: number, step: number): number {
  return joint - Math.ceil(joint / step) * step;
}

const mix = (a: Color, b: Color, t: number): Color =>
  rgb(
    a.red + (b.red - a.red) * t,
    a.green + (b.green - a.green) * t,
    a.blue + (b.blue - a.blue) * t,
  );

/**
 * A fixed shade from -1 to 1 for the item in column i and row j of a pattern, so that panels,
 * tiles and planks vary a little, the same way on every page.
 */
function shade(i: number, j: number): number {
  const hash = (Math.imul(i + 101, 73856093) ^ Math.imul(j + 211, 19349663)) >>> 0;
  return (hash % 2001) / 1000 - 1;
}

/** A polygon given in millimetres from the top left corner of the page. */
function polygon(
  page: PDFPage,
  points: readonly (readonly [number, number])[],
  fill: Color,
  edge?: { readonly color: Color; readonly width: number; readonly opacity: number },
): void {
  const path =
    points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x * MM} ${y * MM}`).join(" ") + " Z";
  page.drawSvgPath(path, {
    x: 0,
    y: page.getHeight(),
    color: fill,
    ...(edge === undefined
      ? {}
      : { borderColor: edge.color, borderWidth: edge.width, borderOpacity: edge.opacity }),
  });
}

/** A straight line in millimetres from the top left corner of the page. */
function line(
  page: PDFPage,
  from: readonly [number, number],
  to: readonly [number, number],
  color: Color,
  width: number,
  opacity: number,
): void {
  page.drawLine({
    start: pdfPoint(page, ...from),
    end: pdfPoint(page, ...to),
    color,
    thickness: width,
    opacity,
  });
}

// Horizontal bands that make up a smooth vertical gradient; each overlaps the next a little, so
// that no hairline of the page shows between them.
const GRADIENT_BANDS = 160;
const BAND_OVERLAP_MM = 0.2;

/** Fills the page from top to bottom through colour stops at shares of its height. */
function verticalGradient(
  page: PDFPage,
  width: number,
  height: number,
  stops: readonly (readonly [number, Color])[],
): void {
  const colourAt = (share: number): Color => {
    const next = stops.findIndex(([position]) => position >= share);
    if (next <= 0) return stops[Math.max(next, 0)]![1];
    const [from, start] = stops[next - 1]!;
    const [to, end] = stops[next]!;
    return mix(start, end, (share - from) / (to - from));
  };
  const band = height / GRADIENT_BANDS;
  for (let i = 0; i < GRADIENT_BANDS; i++) {
    page.drawRectangle({
      ...pdfRect(page, { x: 0, y: i * band, width, height: band + BAND_OVERLAP_MM }),
      color: colourAt((i + 0.5) / GRADIENT_BANDS),
    });
  }
}

/**
 * A showroom: a pale wall with a soft light on it, meeting a polished grey floor that reflects
 * the light in a band along the horizon. It has no joints, so it follows no grid.
 */
function drawStudio(page: PDFPage, width: number, height: number): void {
  // Where the wall meets the floor, as a share of the height from the top.
  const horizon = 0.62;
  verticalGradient(page, width, height, [
    [0, rgb(0.9, 0.905, 0.915)],
    [horizon - 0.02, rgb(0.8, 0.81, 0.825)],
    [horizon, rgb(0.66, 0.675, 0.695)],
    [horizon + 0.06, rgb(0.74, 0.75, 0.765)],
    [1, rgb(0.6, 0.615, 0.635)],
  ]);
  // The light on the wall behind the samples: rings of white, each a little stronger inside.
  const rings = 8;
  for (let k = 0; k < rings; k++) {
    const share = 1 - k / rings;
    page.drawEllipse({
      ...pdfPoint(page, width / 2, height * 0.3),
      xScale: width * 0.5 * share * MM,
      yScale: height * 0.28 * share * MM,
      color: rgb(1, 1, 1),
      opacity: 0.05,
    });
  }
  // The edge of the floor catches the light.
  line(page, [0, height * horizon], [width, height * horizon], rgb(1, 1, 1), 0.5, 0.55);
}

/**
 * Exposed concrete: formwork panels with their joints, one panel behind each card, and the holes of
 * the form ties where the joints cross, in the gaps between the cards.
 */
function drawConcrete(page: PDFPage, width: number, height: number, grid: CardGrid): void {
  const panelWidth = grid.columnPitch;
  const panelHeight = grid.rowPitch;
  const left = runStart(grid.left, panelWidth);
  const top = runStart(grid.top, panelHeight);
  const columns = Math.ceil((width - left) / panelWidth);
  const rows = Math.ceil((height - top) / panelHeight);
  const base = rgb(0.8, 0.79, 0.765);
  const joint = rgb(0.6, 0.59, 0.57);
  const light = rgb(0.9, 0.89, 0.87);
  const hole = rgb(0.6, 0.59, 0.57);
  // Small enough to stay within the gaps between the cards.
  const radius = Math.min(panelWidth, panelHeight) * 0.02;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = left + column * panelWidth;
      const y = top + row * panelHeight;
      const tone = mix(
        base,
        shade(column, row) > 0 ? light : joint,
        Math.abs(shade(column, row)) * 0.08,
      );
      page.drawRectangle({
        ...pdfRect(page, { x, y, width: panelWidth, height: panelHeight }),
        color: tone,
      });
    }
  }
  // The joints: a dark line with a light one beside it, as an edge that catches the light.
  for (let column = 1; column < columns; column++) {
    const x = left + column * panelWidth;
    line(page, [x, 0], [x, height], joint, 0.5, 0.45);
    line(page, [x + 0.35, 0], [x + 0.35, height], light, 0.4, 0.6);
  }
  for (let row = 1; row < rows; row++) {
    const y = top + row * panelHeight;
    line(page, [0, y], [width, y], joint, 0.5, 0.45);
    line(page, [0, y + 0.35], [width, y + 0.35], light, 0.4, 0.6);
  }
  // The ties, over the crossings of the joints.
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const centre = pdfPoint(page, left + column * panelWidth, top + row * panelHeight);
      page.drawCircle({ ...centre, size: radius * 1.35 * MM, color: light, opacity: 0.4 });
      page.drawCircle({ ...centre, size: radius * MM, color: hole, opacity: 0.4 });
    }
  }
}

/**
 * A wall of large limestone-coloured tiles with light grout, stacked, one tile behind each card: a
 * running bond would move every other row's joints through the cards.
 */
function drawTiles(page: PDFPage, width: number, height: number, grid: CardGrid): void {
  const tileWidth = grid.columnPitch;
  const tileHeight = grid.rowPitch;
  const grout = tileWidth * 0.012;
  const base = rgb(0.85, 0.83, 0.8);
  const light = rgb(0.92, 0.905, 0.88);
  const dark = rgb(0.74, 0.72, 0.69);
  const left = runStart(grid.left, tileWidth);
  const top = runStart(grid.top, tileHeight);
  const rows = Math.ceil((height - top) / tileHeight);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; left + column * tileWidth < width; column++) {
      const x = left + column * tileWidth + grout / 2;
      const y = top + row * tileHeight + grout / 2;
      const w = tileWidth - grout;
      const h = tileHeight - grout;
      const s = shade(column, row);
      page.drawRectangle({
        ...pdfRect(page, { x, y, width: w, height: h }),
        color: mix(base, s > 0 ? light : dark, Math.abs(s) * 0.12),
      });
      // A glaze catches the light along the top edge and darkens along the bottom one.
      line(page, [x, y + 0.2], [x + w, y + 0.2], rgb(1, 1, 1), 0.45, 0.55);
      line(page, [x, y + h - 0.2], [x + w, y + h - 0.2], dark, 0.45, 0.35);
    }
  }
}

/**
 * A light oak floor laid in chevron: planks cut at an angle and meeting along straight seams, in
 * columns of about a sixth of the page that divide a column of cards evenly.
 */
function drawParquet(page: PDFPage, width: number, height: number, grid: CardGrid): void {
  const columnWidth = grid.columnPitch / Math.max(1, Math.round(grid.columnPitch / (width / 6)));
  const start = runStart(grid.left, columnWidth);
  const half = columnWidth / 2;
  // Planks meet at 45 degrees, so each half column rises by its own width.
  const rise = half;
  const plank = columnWidth * 0.2;
  const base = rgb(0.86, 0.8, 0.71);
  const light = rgb(0.9, 0.85, 0.77);
  const dark = rgb(0.78, 0.71, 0.61);
  const edge = { color: rgb(0.62, 0.55, 0.45), width: 0.3, opacity: 0.45 };
  const rows = Math.ceil((height + rise) / plank) + 1;
  for (let column = 0; start + column * columnWidth < width; column++) {
    const left = start + column * columnWidth;
    const middle = left + half;
    const right = left + columnWidth;
    for (let row = -1; row < rows; row++) {
      const top = row * plank - rise;
      const tone = (i: number) => {
        const s = shade(2 * column + i, row);
        return mix(base, s > 0 ? light : dark, Math.abs(s) * 0.5);
      };
      polygon(
        page,
        [
          [left, top + rise],
          [middle, top],
          [middle, top + plank],
          [left, top + rise + plank],
        ],
        tone(0),
        edge,
      );
      polygon(
        page,
        [
          [middle, top],
          [right, top + rise],
          [right, top + rise + plank],
          [middle, top + plank],
        ],
        tone(1),
        edge,
      );
    }
  }
}

const PAINTERS: Readonly<
  Record<MaterialBackdrop, (page: PDFPage, width: number, height: number, grid: CardGrid) => void>
> = {
  studio: drawStudio,
  concrete: drawConcrete,
  tiled: drawTiles,
  parquet: drawParquet,
};

/**
 * Draws a material's backdrop over the whole page, its joints between the cards of `grid`; width
 * and height are in millimetres.
 */
export function drawMaterialBackdrop(
  page: PDFPage,
  backdrop: MaterialBackdrop,
  width: number,
  height: number,
  grid: CardGrid,
): void {
  PAINTERS[backdrop](page, width, height, grid);
}
