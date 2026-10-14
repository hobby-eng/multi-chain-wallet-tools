import { resolveCardPresentation, type CardCopyOverrides } from "./card-copy.js";
import { ExportDetails } from "./export-details.js";
import { createCardIdentity, sectorForStyle, type CompanySector } from "./card-identities.js";
import { findTemplate } from "./template-catalog.js";
import {
  validateProfile,
  type CardPresentation,
  type CardProfile,
  type CardSettings,
  COPY_FIELDS,
  type CopyField,
} from "./card-settings.js";
import type { UniformChoice } from "./platform.js";

/**
 * Remembers the random choices of one working session.
 *
 * Without a session every export picks a new person, company and studio. A host that
 * lets the user export the same phrase several times, for example first as separate
 * cards and then as an A4 sheet, keeps one session so that every export shows the same
 * details. A new session gives new details, chosen with the host's uniform choice, such as the
 * randomInt of its CardRenderer. Nothing here depends on the mnemonic. Unlike the
 * details of one export (ExportDetails), which keep one employer for all its designs, a session
 * keeps one employer for each sector, so that each design gets one that suits it.
 */
export interface CardSession {
  /** Details for one export. Values supplied by the user always replace the remembered ones. */
  readonly settingsFor: (
    template: string,
    supplied?: CardProfile,
    copy?: CardCopyOverrides,
  ) => Required<Pick<CardSettings, "profile" | "presentation">>;
}

interface Employment {
  readonly company: string;
  readonly role: string;
}

/**
 * The texts given, each over the one remembered. A loop, not a spread: a host may pass a text as
 * undefined, which must not hide the remembered one.
 */
function ownCopy(copy: CardCopyOverrides, remembered: CardPresentation): CardCopyOverrides {
  const merged: Partial<Record<CopyField, string>> = {};
  for (const field of COPY_FIELDS) merged[field] = copy[field] ?? remembered[field];
  return merged;
}

export function createCardSession(choose: UniformChoice): CardSession {
  let name: string | undefined;
  let presentation: CardPresentation | undefined;
  // The employer suits the design, so it is remembered for each sector separately.
  const employments = new Map<CompanySector | "any", Employment>();

  return {
    settingsFor(template, supplied = {}, copy = {}) {
      // A design not installed suits any employer, as a style without a sector does.
      const style = findTemplate(template)?.style;
      const sector = sectorForStyle(style);
      const key = sector ?? "any";
      let employment = employments.get(key);
      if (employment === undefined) {
        const chosen = createCardIdentity(choose, {}, sector);
        name ??= chosen.name;
        employment = { company: chosen.company, role: chosen.role };
        employments.set(key, employment);
      }
      presentation ??= resolveCardPresentation(choose);
      const own = validateProfile(supplied);
      // The name was chosen together with the first employment.
      if (name === undefined) throw new Error("The card session has no name.");
      // Email and website follow the company that is finally printed.
      const details = ExportDetails.drawn(
        choose,
        { name, ...employment, ...own },
        ownCopy(copy, presentation),
        style,
      );
      return { profile: details.profile, presentation: details.presentation };
    },
  };
}
