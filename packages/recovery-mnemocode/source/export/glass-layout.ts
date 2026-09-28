import { pageDimensions, parsePageSize, type CardSettings } from './card-settings.js';
export const GLASS_CARD = { width: 90, height: 50, gap: 5 } as const;
export const GLASS_SHEET = { top: 20, bottom: 12, side: 5 } as const;
const CARD = GLASS_CARD;
const SHEET = GLASS_SHEET;
export interface GlassPageLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  scale: number;
  top: number;
  bottom: number;
  studioSheet: boolean;
}
export function glassPageLayout(
  content: CardSettings,
  individual: boolean,
  cardWidth: number,
  cardHeight: number,
  count: number,
): GlassPageLayout {
  const size = parsePageSize(
    content.pageSize ?? (individual ? (cardWidth === 85.6 ? 'wallet' : 'business') : 'a6'),
  );

  const [width, height] = pageDimensions(size, content.orientation);
  const small = size === 'wallet' || size === 'business';
  const studioSheet = !individual && !small;
  const columns =
    individual || small
      ? 1
      : size === 'a4'
        ? Math.max(1, Math.floor((width - 6) / 96))
        : width > height
          ? 2
          : 1;
  let scale = small
    ? Math.min(1, width / cardWidth, height / cardHeight)
    : size === 'a6'
      ? Math.min(1, (width - 10 - (columns - 1) * CARD.gap) / columns / cardWidth)
      : 1;
  const top = studioSheet ? SHEET.top : 0;
  const bottom = height - (studioSheet ? SHEET.bottom : 0);
  if (size === 'a6' && !individual) {
    const targetRows = Math.ceil(count / columns);
    scale = Math.min(scale, (bottom - top - (targetRows - 1) * CARD.gap) / targetRows / cardHeight);
  }
  const rows =
    individual || small
      ? 1
      : Math.max(1, Math.floor((bottom - top + CARD.gap) / (cardHeight * scale + CARD.gap)));
  return { width, height, columns, rows, scale, top, bottom, studioSheet };
}
