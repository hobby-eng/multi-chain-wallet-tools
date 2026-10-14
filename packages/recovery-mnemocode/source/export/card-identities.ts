import { pickWith, type UniformChoice } from "./platform.js";
import { validateProfile, type BusinessStyle, type CardProfile } from "./card-settings.js";

/**
 * The sector of the invented employer on business cards, which the design suits (sectorForStyle).
 */
export type CompanySector = "it" | "architecture" | "property" | "consulting";

/** Employer names are separate from the print studios used on collection sheets. */
export const employers: Record<CompanySector, readonly string[]> = {
  it: [
    "Norvale Systems",
    "Elmbridge Digital",
    "Rillford Technologies",
    "Ashmere Software",
    "Fenwick Networks",
  ],
  architecture: [
    "Alderwick Architecture",
    "Larchfield Interiors",
    "Merewood Design",
    "Pennfold Spaces",
    "Ashcombe Atelier",
  ],
  property: [
    "Bellmere Property",
    "Oakstead Homes",
    "Wrenford Estates",
    "Alderbridge Realty",
    "Merrow Property",
  ],
  consulting: [
    "Halden Advisory",
    "Norwick Consulting",
    "Fieldmere Partners",
    "Ashford Operations",
    "Elmward Business Services",
  ],
};

/** The roles that an employer of any sector may give the person on the cards. */
export const commonRoles = [
  "Sales Manager",
  "Sales Consultant",
  "Account Manager",
  "Client Advisor",
  "Business Consultant",
  "Business Development Manager",
  "Business Analyst",
  "Senior Business Analyst",
  "Operations Manager",
  "Project Manager",
] as const;

/** The roles that only an employer of each sector gives. */
export const sectorRoles: Record<CompanySector, readonly string[]> = {
  it: [
    "Software Engineer",
    "Solutions Architect",
    "IT Consultant",
    "Technical Director",
    "DevOps Engineer",
    "Senior DevOps Engineer",
  ],
  architecture: ["Architect", "Interior Designer", "Architectural Designer", "Design Director"],
  property: ["Property Consultant", "Real Estate Advisor", "Property Manager"],
  consulting: ["Strategy Consultant", "Management Consultant", "Operations Consultant"],
};

/** Whole names stay together; no random cross-cultural first/surname combinations. */
export const personNames = [
  "Alex Morgan",
  "James Carter",
  "Daniel Brooks",
  "Oliver Reed",
  "Henry Bennett",
  "Thomas Hayes",
  "William Foster",
  "Ethan Clarke",
  "Liam Parker",
  "Samuel Ellis",
  "Emma Collins",
  "Olivia Bennett",
  "Charlotte Reed",
  "Amelia Brooks",
  "Sophia Turner",
  "Grace Morgan",
  "Hannah Clarke",
  "Emily Hayes",
  "Alice Foster",
  "Lucy Parker",
  "Lukas Weber",
  "Anna Fischer",
  "Jonas Bauer",
  "Clara Hoffmann",
  "Julien Moreau",
  "Camille Laurent",
  "Nicolas Martin",
  "Lea Dubois",
  "Matteo Rossi",
  "Giulia Conti",
  "Luca Ferraro",
  "Sofia Ricci",
  "Javier Navarro",
  "Lucia Romero",
  "Ines Costa",
  "Tiago Almeida",
  "Pieter de Vries",
  "Eva van Dijk",
  "Lars Nyberg",
  "Ingrid Berg",
  "Mikkel Larsen",
  "Aino Koskinen",
  "Jakub Nowak",
  "Zofia Kowalska",
  "Tomas Novak",
  "Petra Svobodova",
  "Andrei Popescu",
  "Elena Ionescu",
  "Nikos Papadakis",
  "Eleni Nikolaou",
  "Emre Yilmaz",
  "Selin Kaya",
  "Hana Tanaka",
  "Kenji Mori",
  "Arjun Mehta",
  "Priya Shah",
  "Minjun Kim",
  "Leila Mansour",
  "Omar Haddad",
  "Amina Diallo",
] as const;

const sectors = Object.keys(employers) as CompanySector[];

/** The sector of the employer that suits a business style; the other styles take any. */
const STYLE_SECTORS: Readonly<Partial<Record<BusinessStyle, CompanySector>>> = Object.freeze({
  architect: "architecture",
  it: "it",
  estate: "property",
});

/**
 * The sector of the employer that the cards of `style` print (STYLE_SECTORS), or undefined for a
 * style that suits any: it follows the style of a design, never its place in a list.
 */
export function sectorForStyle(style: string | undefined): CompanySector | undefined {
  return style !== undefined && Object.hasOwn(STYLE_SECTORS, style)
    ? STYLE_SECTORS[style as BusinessStyle]
    : undefined;
}

function knownSector(profile: CardProfile): CompanySector | undefined {
  const company = profile.company?.toLowerCase();
  const byCompany = sectors.find((sector) =>
    employers[sector].some((name) => name.toLowerCase() === company),
  );
  if (byCompany) return byCompany;
  const role = profile.role?.toLowerCase();
  if (role === "senior devops" || role === "devops") return "it";
  return sectors.find((sector) => sectorRoles[sector].some((name) => name.toLowerCase() === role));
}

/**
 * Invented contacts end in .example. That domain is reserved for examples (RFC 2606),
 * so an invented address can never be the mailbox or website of a real company.
 */
const INVENTED_DOMAIN_ENDING = ".example";

/**
 * Longest company part of an invented address. With more letters the email no longer fits
 * the narrowest email line of the cards at a legible size; test/card-identities.test.ts
 * checks this for every built-in employer.
 */
const LONGEST_DOMAIN_LABEL = 18;

/** Letters and digits of one word, as they can appear in a domain name. */
function domainLetters(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

function contactDomain(company: string): string {
  // A long company name keeps its first words only, the way companies shorten their domains.
  let label = "";
  for (const word of company.split(/\s+/u).map(domainLetters)) {
    if (label !== "" && label.length + word.length > LONGEST_DOMAIN_LABEL) break;
    label += word;
  }
  label = label.slice(0, LONGEST_DOMAIN_LABEL);
  return `${label || "company"}${INVENTED_DOMAIN_ENDING}`;
}

/**
 * The phone number of every invented identity: a London number that Ofcom, the UK regulator,
 * keeps for drama and fiction (020 7946 0000 to 0999), so that it rings no one
 * (docs/card-identities.md).
 */
const INVENTED_PHONE = "+44 20 7946 0281";
/** Where an invented identity works when none is given. */
const DEFAULT_LOCATION = "International";

/**
 * The person on the cards: `supplied`, with the rest chosen with `choose`, the host's uniform
 * choice. Selection is independent of secret data; explicit values always win.
 */
export function createCardIdentity(
  choose: UniformChoice,
  supplied: CardProfile = {},
  sectorHint?: CompanySector,
): Required<CardProfile> {
  const profile = validateProfile(supplied);
  const sector = knownSector(profile) ?? sectorHint ?? pickWith(sectors, choose);
  const company = profile.company ?? pickWith(employers[sector], choose);
  const domain = contactDomain(company);
  return {
    name: profile.name ?? pickWith(personNames, choose),
    company,
    role: profile.role ?? pickWith([...sectorRoles[sector], ...commonRoles], choose),
    email: profile.email ?? `contact@${domain}`,
    website: profile.website ?? domain,
    phone: profile.phone ?? INVENTED_PHONE,
    location: profile.location ?? DEFAULT_LOCATION,
  };
}
