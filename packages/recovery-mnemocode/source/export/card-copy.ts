import { renderPlatform } from './platform.js';
import {
  validateProfile,
  type CardProfile,
  type CardPresentation,
  type CardSettings,
} from './card-settings.js';

export const studioNames = [
  'Alder & Vale',
  'Luma Ridge Studio',
  'Stillform Atelier',
  'Orven Studio',
  'Moss & Grain',
  'Quiet Arc Studio',
  'Vellin Works',
  'Sable Row',
  'Neral Studio',
  'Cinder & Loom',
  'Avenfold',
  'Morrow Form',
  'Rillstone Studio',
  'Pale Oak Works',
  'Veyra Form',
  'Linden Trace',
  'Oriel Grain',
  'Arven Line',
  'Softline Atelier',
  'Wren & Slate',
  'Greyfold Press',
  'Slate Row Studio',
  'Harbor & Pine',
  'Ashgrove Creative',
  'Elmstead Design',
  'Paperfold Studio',
  'Marlow Type & Print',
  'Wexford Design Co.',
  'Oakline Creative',
  'Kestrel Print Studio',
  'Halden & Roe',
  'Millbrook Design',
  'Crossfield Creative',
  'Cobblestone Print Works',
  'Ridgeway Studio',
  'Larch & Lane Design',
  'Fallow & Reed',
] as const;

export const cardSlogans = [
  'Print, done properly.',
  'Small studio. Careful work.',
  'Considered design for everyday business.',
  'Identity, set in ink.',
  'Good paper. Better first impressions.',
  'Designed to be handed over.',
  'Clarity, printed.',
  'Made to be kept.',
  'Quiet design, lasting impression.',
  'Detail is the whole point.',
  'Ink, paper, and a little patience.',
  'Craft you can hold.',
  'Print with a point of view.',
  'Simple, sharp, memorable.',
  'First impressions, considered.',
  'Designed in-house, printed with care.',
  'Your name, well set.',
  'Less noise. More paper.',
  'Built on good typography.',
  'From sketch to press.',
  'Honest work on good stock.',
  'Colour, weight, finish. Nothing else.',
  'Small runs, real care.',
  'Precision from the first proof.',
  'We sweat the small print.',
  'Paper with personality.',
  'Details, deliberately.',
  'Every card tells a story.',
  'Thoughtful print for thoughtful people.',
  'Form that fits in a pocket.',
] as const;

export const cardFooters = [
  'PROOF SHEET',
  'CLIENT REVIEW',
  'SAMPLE SET',
  'COLOUR OPTIONS',
  'PRINT PROOF',
  'SELECTION SHEET',
] as const;

export const cardSubtitles = [
  'Colour options for review.',
  'Proof set, first round.',
  'Finishes and colourways.',
  'Client selection sheet.',
  'Sample set for approval.',
] as const;

export interface CardCopyOverrides {
  readonly studioName?: string;
  readonly slogan?: string;
  readonly subtitle?: string;
  readonly footer?: string;
  readonly referenceLabel?: string;
}
export interface ResolvedCardPresentation {
  readonly profile: CardProfile;
  readonly presentation: CardPresentation;
}
export type UniformChoice = (upperExclusive: number) => number;

const presentationCache = new WeakMap<CardSettings, CardPresentation>();

/** Export boundaries share this result across pages and output formats. */
export function resolvePresentationFor(settings: CardSettings): CardPresentation {
  if (settings.presentation) return settings.presentation;
  let presentation = presentationCache.get(settings);
  if (!presentation) {
    presentation = resolveCardPresentation().presentation;
    presentationCache.set(settings, presentation);
  }
  return presentation;
}

function pick(pool: readonly string[], choose: UniformChoice): string {
  const index = choose(pool.length);
  if (!Number.isInteger(index) || index < 0 || index >= pool.length)
    throw new Error('Invalid random presentation selection.');
  return pool[index]!;
}

function copyValue(value: string | undefined, fallback: () => string, label: string): string {
  if (value === undefined) return fallback();
  if (value === '-') return '';
  if (typeof value !== 'string' || !value.trim() || /[\p{Cc}\p{Cf}]/u.test(value))
    throw new Error(`Card ${label} must be non-empty text on one line; use - to hide it.`);
  if ([...value].length > 100)
    throw new Error(`Card ${label} is too long (maximum 100 characters).`);
  return value.trim().normalize('NFC');
}
/** Resolve exactly once at the export boundary; independent of all mnemonic data. */
export function resolveCardPresentation(
  supplied: CardProfile = {},
  copy: CardCopyOverrides = {},
  choose: UniformChoice = (upperExclusive) => renderPlatform().randomInt(upperExclusive),
): ResolvedCardPresentation {
  const profile = validateProfile(supplied);
  return {
    profile,
    presentation: {
      studioName: copyValue(copy.studioName, () => pick(studioNames, choose), 'studio name'),
      slogan: copyValue(copy.slogan, () => pick(cardSlogans, choose), 'slogan'),
      subtitle: copyValue(copy.subtitle, () => pick(cardSubtitles, choose), 'subtitle'),
      footer: copyValue(copy.footer, () => pick(cardFooters, choose), 'footer'),
      referenceLabel: copyValue(copy.referenceLabel, () => 'Ref.', 'reference label'),
    },
  };
}
