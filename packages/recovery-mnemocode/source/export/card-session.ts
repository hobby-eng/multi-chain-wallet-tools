import { resolveCardPresentation, type CardCopyOverrides } from './card-copy.js';
import { createCardIdentity, sectorForTemplate, type CompanySector } from './card-identities.js';
import {
  validateProfile,
  type CardPresentation,
  type CardProfile,
  type CardSettings,
} from './card-settings.js';

/**
 * Remembers the random choices of one working session.
 *
 * Without a session every export picks a new person, company and studio. A host that
 * lets the user export the same phrase several times, for example first as separate
 * cards and then as an A4 sheet, keeps one session so that every export shows the same
 * details. A new session gives new details. Nothing here depends on the mnemonic.
 */
export interface CardSession {
  /** Details for one export. Values supplied by the user always replace the remembered ones. */
  readonly settingsFor: (
    template: string,
    supplied?: CardProfile,
    copy?: CardCopyOverrides,
  ) => Required<Pick<CardSettings, 'profile' | 'presentation'>>;
}

interface Employment {
  readonly company: string;
  readonly role: string;
}

export function createCardSession(): CardSession {
  let name: string | undefined;
  let presentation: CardPresentation | undefined;
  // The employer suits the design, so it is remembered for each sector separately.
  const employments = new Map<CompanySector | 'any', Employment>();

  return {
    settingsFor(template, supplied = {}, copy = {}) {
      const sector = sectorForTemplate(template);
      const key = sector ?? 'any';
      let employment = employments.get(key);
      if (employment === undefined) {
        const chosen = createCardIdentity({}, sector);
        name ??= chosen.name;
        employment = { company: chosen.company, role: chosen.role };
        employments.set(key, employment);
      }
      presentation ??= resolveCardPresentation().presentation;
      const own = validateProfile(supplied);
      // The name was chosen together with the first employment.
      if (name === undefined) throw new Error('The card session has no name.');
      return {
        // Email and website follow the company that is finally printed.
        profile: createCardIdentity({ name, ...employment, ...own }, sector),
        presentation: resolveCardPresentation(
          {},
          {
            studioName: copy.studioName ?? presentation.studioName,
            slogan: copy.slogan ?? presentation.slogan,
            subtitle: copy.subtitle ?? presentation.subtitle,
            footer: copy.footer ?? presentation.footer,
            referenceLabel: copy.referenceLabel ?? presentation.referenceLabel,
          },
        ).presentation,
      };
    },
  };
}
