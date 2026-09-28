import { pageDimensions, type CardPageSize, type CardOrientation } from './card-settings.js';

const WALLET = { width: 85.6, height: 54 } as const;
const GRID = {
  portraitColumns: 3,
  landscapeColumns: 4,
  margin: 3.5,
  gap: 1.4,
  top: 12.3,
  bottom: 5,
} as const;

export function materialPageLayout(size: CardPageSize, orientation?: CardOrientation) {
  // Rotate the physical sheet, never stretch the photographed finishes.
  if (orientation !== undefined && orientation !== 'portrait' && orientation !== 'landscape')
    throw new Error('Orientation must be portrait or landscape.');
  // Material sheets lie on their long side unless portrait is asked for.
  const [width, height] = pageDimensions(size, orientation ?? 'landscape');
  const portrait = height > width;
  const scale = portrait
    ? Math.min(width / WALLET.height, height / WALLET.width)
    : Math.min(width / WALLET.width, height / WALLET.height);
  return { width, height, portrait, scale };
}

export function materialGridLayout(
  width: number,
  height: number,
  scale: number,
  portrait: boolean,
  count: number,
  individual?: number,
) {
  const columns =
    individual === undefined ? (portrait ? GRID.portraitColumns : GRID.landscapeColumns) : 1;
  const rows = Math.ceil(count / columns);
  const margin = GRID.margin * scale;
  const gap = GRID.gap * scale;
  const areaTop = GRID.top * scale;
  const areaBottom = height - GRID.bottom * scale;
  const cellHeight = (areaBottom - areaTop) / rows;
  const cellWidth = (width - 2 * margin - (columns - 1) * gap) / columns;
  return { columns, rows, cellHeight, cellWidth, gap, areaTop };
}
