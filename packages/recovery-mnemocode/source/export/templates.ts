import { renderMaterialCard } from './material-cards.js';
import { renderGlassCards } from './glass-cards.js';
import type { DateShiftDate } from '../core.js';
import type { CardSettings } from './card-settings.js';
import { renderBusinessCards } from './business-cards.js';

export type CardKind = 'colors' | 'unicode';
export type CardContent = CardSettings &
  (
    | {
        readonly kind: 'colors';
        readonly colors: readonly string[];
        readonly payload: string;
        readonly title?: string;
      }
    | {
        readonly kind: 'unicode';
        readonly dates: readonly DateShiftDate[];
        readonly eventLabels: readonly string[];
        readonly payload: string;
        readonly title?: string;
      }
  );

export interface CardTemplate {
  readonly id: string;
  readonly kind: CardKind;
  readonly name: string;
  readonly description: string;
  /** The same renderer is used for preview and ordinary export. */
  readonly render: (content: CardContent) => Promise<Uint8Array>;
  readonly renderIndividual?: (content: CardContent, index: number) => Promise<Uint8Array>;
  readonly referencesPerCard?: number;
}

// Each design was approved before installation. Keep IDs stable for recorded commands.
export const businessTemplateStyles = {
  'business-architect': 'architect',
  'business-it': 'it',
  'business-estate': 'estate',
  'business-diagonal': 'diagonal',
  'business-contact': 'contact',
  'business-curves': 'curves',
  'business-facets': 'facets',
  'business-mixed': 'mixed',
} as const;
type BusinessStyle = (typeof businessTemplateStyles)[keyof typeof businessTemplateStyles];
const businessNames: Record<BusinessStyle, string> = {
  architect: 'Architecture',
  it: 'IT',
  estate: 'Property consultant',
  diagonal: 'Diagonal city',
  contact: 'Light contact blocks',
  curves: 'Signature curves',
  facets: 'Light geometric',
  mixed: 'Mixed design',
};
const businessTemplates: readonly CardTemplate[] = Object.entries(businessTemplateStyles).map(
  ([id, style]) => ({
    id,
    kind: 'colors',
    name: `${businessNames[style]} card collection`,
    description:
      style === 'mixed'
        ? 'One identity across all approved designs; A6, A4 or individual cards.'
        : 'Editable contact details; A6 collection, A4 sheets or individual 90 x 50 mm cards.',
    render: (content) => renderBusinessCards(style, content),
    renderIndividual: (content, cardIndex) => renderBusinessCards(style, content, cardIndex),
  }),
);

export const materialTemplateStyles = {
  'material-vehicle': 'vehicle',
  'material-enclosure': 'enclosure',
  'material-tile': 'tile',
  'material-switch': 'switch',
  'material-kitchen': 'kitchen',
} as const;
export const allTemplateStyles = {
  ...businessTemplateStyles,
  ...materialTemplateStyles,
  'business-glass-4in1': 'glass-4in1',
  'business-glass-6in1': 'glass-6in1',
  'business-glass-8in1': 'glass-8in1',
} as const;
export const cardTemplates: readonly CardTemplate[] = [
  ...businessTemplates,
  ...Object.entries(materialTemplateStyles).map(([id, style]): CardTemplate => ({
    id,
    kind: 'colors',
    name: `${style[0]!.toUpperCase()}${style.slice(1)} finish selection`,
    description:
      'Photographic material samples with finish names and exact references; optional collection QR. All page sizes and individual fragments.',
    render: (content) => renderMaterialCard(style, content),
    renderIndividual: (content, individualIndex) =>
      renderMaterialCard(style, content, { individualIndex }),
  })),
  ...([4, 6, 8] as const).map((referencesPerCard): CardTemplate => ({
    id: `business-glass-${referencesPerCard}in1`,
    kind: 'colors',
    name: `Frosted glass / ${referencesPerCard}-reference palette`,
    description: `${referencesPerCard} ordered references per card; all page sizes and individual files. Optional QR is reserved for the collection study.`,
    referencesPerCard,
    render: (content) => renderGlassCards(content, undefined, referencesPerCard),
    renderIndividual: (content, index) => renderGlassCards(content, index, referencesPerCard),
  })),
];

export function selectTemplate(id?: string, kind?: CardKind): CardTemplate {
  const available = cardTemplates.filter((item) => kind === undefined || item.kind === kind);
  if (available.length === 0) {
    throw new Error(
      'No installed card template supports this kind of card. Dated Unicode cards (format 3) have no template yet; use format 4 or 5.',
    );
  }
  let selected = id === undefined ? available[0] : available.find((item) => item.id === id);
  if (selected === undefined && id !== undefined && /^[1-9][0-9]*$/u.test(id)) {
    selected = available[Number(id) - 1];
  }
  if (selected === undefined)
    throw new Error(
      `The card template “${id}” is unknown or incompatible. List the available preview templates and choose one of them.`,
    );
  return selected;
}
