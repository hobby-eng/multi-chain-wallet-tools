import { renderPlatform } from './platform.js';
import { validateProfile, type CardProfile, type CardSettings } from './card-settings.js';

export type CompanySector = 'it' | 'architecture' | 'property' | 'consulting';

/** Employer names are separate from the print studios used on collection sheets. */
export const employers: Record<CompanySector, readonly string[]> = {
  it: [
    'Norvale Systems',
    'Elmbridge Digital',
    'Rillford Technologies',
    'Ashmere Software',
    'Fenwick Networks',
  ],
  architecture: [
    'Alderwick Architecture',
    'Larchfield Interiors',
    'Merewood Design',
    'Pennfold Spaces',
    'Ashcombe Atelier',
  ],
  property: [
    'Bellmere Property',
    'Oakstead Homes',
    'Wrenford Estates',
    'Alderbridge Realty',
    'Merrow Property',
  ],
  consulting: [
    'Halden Advisory',
    'Norwick Consulting',
    'Fieldmere Partners',
    'Ashford Operations',
    'Elmward Business Services',
  ],
};

export const commonRoles = [
  'Sales Manager',
  'Sales Consultant',
  'Account Manager',
  'Client Advisor',
  'Business Consultant',
  'Business Development Manager',
  'Business Analyst',
  'Senior Business Analyst',
  'Operations Manager',
  'Project Manager',
] as const;

export const sectorRoles: Record<CompanySector, readonly string[]> = {
  it: [
    'Software Engineer',
    'Solutions Architect',
    'IT Consultant',
    'Technical Director',
    'DevOps Engineer',
    'Senior DevOps Engineer',
  ],
  architecture: ['Architect', 'Interior Designer', 'Architectural Designer', 'Design Director'],
  property: ['Property Consultant', 'Real Estate Advisor', 'Property Manager'],
  consulting: ['Strategy Consultant', 'Management Consultant', 'Operations Consultant'],
};

/** Whole names stay together; no random cross-cultural first/surname combinations. */
export const personNames = [
  'Alex Morgan',
  'James Carter',
  'Daniel Brooks',
  'Oliver Reed',
  'Henry Bennett',
  'Thomas Hayes',
  'William Foster',
  'Ethan Clarke',
  'Liam Parker',
  'Samuel Ellis',
  'Emma Collins',
  'Olivia Bennett',
  'Charlotte Reed',
  'Amelia Brooks',
  'Sophia Turner',
  'Grace Morgan',
  'Hannah Clarke',
  'Emily Hayes',
  'Alice Foster',
  'Lucy Parker',
  'Lukas Weber',
  'Anna Fischer',
  'Jonas Bauer',
  'Clara Hoffmann',
  'Julien Moreau',
  'Camille Laurent',
  'Nicolas Martin',
  'Lea Dubois',
  'Matteo Rossi',
  'Giulia Conti',
  'Luca Ferraro',
  'Sofia Ricci',
  'Javier Navarro',
  'Lucia Romero',
  'Ines Costa',
  'Tiago Almeida',
  'Pieter de Vries',
  'Eva van Dijk',
  'Lars Nyberg',
  'Ingrid Berg',
  'Mikkel Larsen',
  'Aino Koskinen',
  'Jakub Nowak',
  'Zofia Kowalska',
  'Tomas Novak',
  'Petra Svobodova',
  'Andrei Popescu',
  'Elena Ionescu',
  'Nikos Papadakis',
  'Eleni Nikolaou',
  'Emre Yilmaz',
  'Selin Kaya',
  'Hana Tanaka',
  'Kenji Mori',
  'Arjun Mehta',
  'Priya Shah',
  'Minjun Kim',
  'Leila Mansour',
  'Omar Haddad',
  'Amina Diallo',
] as const;

const sectors = Object.keys(employers) as CompanySector[];
type Choice = (upperExclusive: number) => number;
const identities = new WeakMap<CardSettings, Required<CardProfile>>();

function pick<T>(values: readonly T[], choose: Choice): T {
  const index = choose(values.length);
  if (!Number.isInteger(index) || index < 0 || index >= values.length)
    throw new Error('Invalid random identity selection.');
  return values[index]!;
}

export function sectorForTemplate(template?: string): CompanySector | undefined {
  if (template === 'it' || template === 'business-it' || template === '2') return 'it';
  if (template === 'architect' || template === 'business-architect' || template === '1')
    return 'architecture';
  if (template === 'estate' || template === 'business-estate' || template === '3')
    return 'property';
  return undefined;
}

function knownSector(profile: CardProfile): CompanySector | undefined {
  const company = profile.company?.toLowerCase();
  const byCompany = sectors.find((sector) =>
    employers[sector].some((name) => name.toLowerCase() === company),
  );
  if (byCompany) return byCompany;
  const role = profile.role?.toLowerCase();
  if (role === 'senior devops' || role === 'devops') return 'it';
  return sectors.find((sector) => sectorRoles[sector].some((name) => name.toLowerCase() === role));
}

/**
 * Invented contacts end in .example. That domain is reserved for examples (RFC 2606),
 * so an invented address can never be the mailbox or website of a real company.
 */
const INVENTED_DOMAIN_ENDING = '.example';

function contactDomain(company: string): string {
  const label = company
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .slice(0, 63);
  return `${label || 'company'}${INVENTED_DOMAIN_ENDING}`;
}

/** Selection is independent of secret data; explicit values always win. */
export function createCardIdentity(
  supplied: CardProfile = {},
  sectorHint?: CompanySector,
  choose: Choice = (upperExclusive) => renderPlatform().randomInt(upperExclusive),
): Required<CardProfile> {
  const profile = validateProfile(supplied);
  const sector = knownSector(profile) ?? sectorHint ?? pick(sectors, choose);
  const company = profile.company ?? pick(employers[sector], choose);
  const domain = contactDomain(company);
  return {
    name: profile.name ?? pick(personNames, choose),
    company,
    role: profile.role ?? pick([...sectorRoles[sector], ...commonRoles], choose),
    email: profile.email ?? `contact@${domain}`,
    website: profile.website ?? domain,
    phone: profile.phone ?? '+44 20 7946 0281',
    location: profile.location ?? 'International',
  };
}

/** Reuse an identity across all pages, formats and shares in one export. */
export function resolveIdentityFor(
  settings: CardSettings,
  sector?: CompanySector,
): Required<CardProfile> {
  let profile = identities.get(settings);
  if (!profile) {
    profile = createCardIdentity(settings.profile, sector);
    identities.set(settings, profile);
  }
  return profile;
}
