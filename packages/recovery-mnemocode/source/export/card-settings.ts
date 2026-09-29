/** Print layout is independent of the visual template and the encoded format. */
export type CardPageSize = 'a6' | 'a4' | 'business';
export type CardOrientation = 'portrait' | 'landscape';
export interface CardProfile {
  readonly name?: string;
  readonly role?: string;
  readonly company?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly website?: string;
  readonly location?: string;
}
export interface CardPresentation {
  readonly studioName: string;
  readonly slogan: string;
  readonly subtitle: string;
  readonly footer: string;
  readonly referenceLabel: string;
}
export interface CardSettings {
  readonly pageSize?: CardPageSize;
  readonly orientation?: CardOrientation;
  readonly profile?: CardProfile;
  readonly presentation?: CardPresentation;
  readonly cardQr?: boolean;
}
export const profileFields = [
  'name',
  'role',
  'company',
  'email',
  'phone',
  'website',
  'location',
] as const;
export type BusinessStyle =
  'architect' | 'it' | 'estate' | 'diagonal' | 'contact' | 'curves' | 'facets' | 'mixed';

export function parsePageSize(value: string | undefined): CardPageSize {
  if (value === undefined) return 'a6';
  if (!['a6', 'a4', 'business'].includes(value))
    throw new Error('Page size must be a6, a4 or business.');
  return value as CardPageSize;
}

/** Width and height in millimetres, in the natural orientation of each size. */
const PAGE_DIMENSIONS: Readonly<Record<CardPageSize, readonly [number, number]>> = {
  a4: [210, 297],
  a6: [148, 105],
  business: [90, 50],
};

/** Page width and height in millimetres; an orientation turns the page when it has to. */
export function pageDimensions(
  size: CardPageSize,
  orientation?: CardOrientation,
): [number, number] {
  const [width, height] = PAGE_DIMENSIONS[size];
  const turn =
    (orientation === 'portrait' && width > height) ||
    (orientation === 'landscape' && width < height);
  return turn ? [height, width] : [width, height];
}

/**
 * The business size is the size of a real card, so every card becomes its own numbered
 * page. A6 and A4 are sheets that hold the whole collection on one page.
 */
export function isCardPageSize(size: CardPageSize | undefined): size is 'business' {
  return size === 'business';
}

export function parseOrientation(value: string | undefined): CardOrientation | undefined {
  if (value === undefined || value === 'portrait' || value === 'landscape') return value;
  throw new Error('Orientation must be portrait or landscape.');
}

export function validateProfile(profile: CardProfile = {}): CardProfile {
  const result: Record<string, string> = {};
  for (const field of profileFields) {
    const text = profile[field];
    if (text === undefined) continue;
    if (typeof text !== 'string' || !text.trim() || /[\p{Cc}\p{Cf}]/u.test(text)) {
      throw new Error(
        `Card ${field} must be non-empty text on one line, without control characters.`,
      );
    }
    if ([...text].length > 100)
      throw new Error(`Card ${field} is too long (maximum 100 characters).`);
    const normalized = text.trim().normalize('NFC');
    if (
      field === 'name' &&
      (!/\p{Script=Latin}/u.test(normalized) ||
        !/^[\p{Script=Latin}\p{M} .’'‐-]+$/u.test(normalized))
    ) {
      throw new Error(
        'Card name must use Latin letters only (spaces, apostrophes and hyphens are allowed).',
      );
    }
    result[field] = normalized;
  }
  return result;
}

function defaultEmployer(
  style: BusinessStyle,
): Pick<Required<CardProfile>, 'role' | 'company' | 'email' | 'website' | 'location'> {
  if (style === 'architect') {
    return {
      role: 'ARCHITECT',
      company: 'VECTOR STUDIO',
      email: 'alex@vector.example',
      website: 'vector.example',
      location: 'Remote / Worldwide',
    };
  }
  if (style === 'it') {
    return {
      role: 'IT SOLUTIONS DIRECTOR',
      company: 'VECTOR SYSTEMS',
      email: 'alex@vector.example',
      website: 'vector.example',
      location: 'Remote / Worldwide',
    };
  }
  return {
    role: 'Property Consultant',
    company: 'NORTHLINE',
    email: 'alex@northline.example',
    website: 'northline.example',
    location: 'London / International',
  };
}

export function resolveProfile(
  style: BusinessStyle,
  supplied?: CardProfile,
): Required<CardProfile> {
  return {
    name: 'Alex Morgan',
    phone: '+44 20 7946 0281',
    ...defaultEmployer(style),
    ...validateProfile(supplied),
  };
}
