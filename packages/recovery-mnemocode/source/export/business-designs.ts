import type { BusinessStyle, CardProfile } from './card-settings.js';

export type PhysicalBusinessStyle = Exclude<BusinessStyle, 'mixed'>;
export const businessStyles: readonly PhysicalBusinessStyle[] = [
  'architect',
  'it',
  'estate',
  'diagonal',
  'contact',
  'curves',
  'facets',
];
export interface BusinessField {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  preferred: number;
  minimum: number;
  dark?: boolean;
}
export function physicalStyle(style: BusinessStyle, index: number): PhysicalBusinessStyle {
  return style === 'mixed' ? businessStyles[index % businessStyles.length]! : style;
}
export const businessTitles: Readonly<Record<BusinessStyle, string>> = {
  architect: 'ARCHITECTURE / CARD COLLECTION',
  it: 'IT BUSINESS CARD COLLECTION',
  estate: 'PRIVATE REAL ESTATE / COLLECTION',
  diagonal: 'CITY / CARD COLLECTION',
  contact: 'CONTACT / CARD COLLECTION',
  curves: 'SIGNATURE / CARD COLLECTION',
  facets: 'GEOMETRY / CARD COLLECTION',
  mixed: 'BUSINESS CARD COLLECTION',
};
export const hueOrigins: Readonly<Record<PhysicalBusinessStyle, number>> = {
  architect: 0.56,
  it: 0.56,
  estate: 0.56,
  diagonal: 0.09,
  contact: 0.5,
  curves: 0.12,
  facets: 0.39,
};
/**
 * Positions are shares of the card width and height; `y` is the top of the line box.
 * They are measured from the artwork: a single line is centred on its icon or logo,
 * and a role starts at least 0.6 mm below the name above it.
 */
export function businessFields(
  style: PhysicalBusinessStyle,
  p: Required<CardProfile>,
): BusinessField[] {
  const field = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    preferred: number,
    dark = false,
  ): BusinessField => ({
    label,
    value,
    x,
    y,
    width,
    preferred,
    minimum: label === 'Name' ? 6 : 4,
    dark,
  });
  if (style === 'it')
    return [
      field('Company', p.company, 0.17, 0.123, 0.36, 7.8),
      field('Name', p.name, 0.08, 0.265, 0.43, 10),
      field('Role', p.role, 0.08, 0.36, 0.41, 6),
      field('Email', p.email, 0.16, 0.518, 0.32, 6.2),
      field('Website', p.website, 0.16, 0.664, 0.34, 6.2),
      field('Location', p.location, 0.16, 0.812, 0.37, 6.2),
    ];
  if (style === 'architect')
    return [
      field('Company', p.company, 0.17, 0.123, 0.36, 7.8),
      field('Name', p.name, 0.08, 0.268, 0.43, 10),
      field('Role', p.role, 0.08, 0.368, 0.41, 6),
      field('Email', p.email, 0.16, 0.514, 0.32, 6.2),
      field('Website', p.website, 0.16, 0.657, 0.34, 6.2),
      field('Location', p.location, 0.16, 0.8, 0.37, 6.2),
    ];
  if (style === 'estate')
    return [
      field('Company', p.company, 0.2, 0.13, 0.29, 9),
      field('Name', p.name, 0.071, 0.32, 0.4, 10.5),
      field('Role', p.role, 0.071, 0.408, 0.4, 7),
      field('Email', p.email, 0.14, 0.528, 0.33, 6.4),
      field('Phone', p.phone, 0.14, 0.604, 0.33, 6.4),
      field('Website', p.website, 0.14, 0.68, 0.33, 6.4),
      field('Location', p.location, 0.14, 0.749, 0.33, 6.4),
    ];
  if (style === 'diagonal')
    return [
      // The photograph narrows the free space towards the top, so the line is kept shorter.
      field('Company', p.company, 0.18, 0.122, 0.285, 9),
      field('Name', p.name, 0.065, 0.35, 0.42, 10),
      field('Role', p.role, 0.065, 0.435, 0.42, 6.8),
      field('Email', p.email, 0.065, 0.58, 0.41, 6.4),
      field('Website', p.website, 0.065, 0.66, 0.41, 6.4),
      field('Phone', p.phone, 0.065, 0.74, 0.41, 6.4),
    ];
  if (style === 'contact')
    return [
      field('Company', p.company, 0.065, 0.78, 0.34, 9, true),
      field('Name', p.name, 0.54, 0.085, 0.41, 9),
      field('Role', p.role, 0.54, 0.161, 0.41, 6),
      field('Phone', p.phone, 0.54, 0.357, 0.41, 7),
      field('Email', p.email, 0.54, 0.56, 0.41, 6.5),
      field('Website', p.website, 0.54, 0.62, 0.41, 6.5),
      field('Location', p.location, 0.54, 0.816, 0.41, 6.5),
    ];
  if (style === 'curves')
    return [
      field('Company', p.company, 0.06, 0.29, 0.31, 9),
      field('Name', p.name, 0.45, 0.163, 0.46, 10, true),
      field('Role', p.role, 0.45, 0.246, 0.46, 6.5, true),
      field('Phone', p.phone, 0.44, 0.49, 0.47, 7),
      field('Email', p.email, 0.44, 0.59, 0.47, 6.5),
      field('Website', p.website, 0.44, 0.69, 0.47, 6.5),
      field('Location', p.location, 0.44, 0.79, 0.47, 6.5),
    ];
  return [
    field('Company', p.company, 0.245, 0.125, 0.5, 10, true),
    field('Name', p.name, 0.245, 0.262, 0.52, 10, true),
    field('Role', p.role, 0.245, 0.345, 0.52, 6.5, true),
    field('Phone', p.phone, 0.245, 0.5, 0.52, 6.8, true),
    field('Email', p.email, 0.245, 0.585, 0.52, 6.5, true),
    field('Website', p.website, 0.245, 0.67, 0.52, 6.5, true),
  ];
}
