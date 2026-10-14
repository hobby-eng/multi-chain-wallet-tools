// The texts of a card design besides the person's details: the invented studio name, slogan,
// subtitle and footer of the frame of a design study, and the label before a card's code. Which of
// them a design prints (designTexts), the pools they are drawn from, the checks of a text that the
// person gives instead, and the drawing of the rest (resolveCardPresentation), which
// export-details.ts does once per export, so that every page and output format of one export
// shows the same.
//
// Needs from the host: a uniform random choice, passed as `choose`, such as the randomInt of its
// render platform (export/platform.ts, a CardRenderer's).
// Does not: draw cards, choose the person's details (card-identities.ts), or hold any secret: the
// texts are independent of every seed phrase and share.

import { pickWith, type UniformChoice } from "./platform.js";
import { type CardPresentation, cardText, COPY_FIELDS, type CopyField } from "./card-settings.js";

/** The names of the invented print studios that a collection sheet names as its maker. */
export const studioNames = [
  "Alder & Vale",
  "Luma Ridge Studio",
  "Stillform Atelier",
  "Orven Studio",
  "Moss & Grain",
  "Quiet Arc Studio",
  "Vellin Works",
  "Sable Row",
  "Neral Studio",
  "Cinder & Loom",
  "Avenfold",
  "Morrow Form",
  "Rillstone Studio",
  "Pale Oak Works",
  "Veyra Form",
  "Linden Trace",
  "Oriel Grain",
  "Arven Line",
  "Softline Atelier",
  "Wren & Slate",
  "Greyfold Press",
  "Slate Row Studio",
  "Harbor & Pine",
  "Ashgrove Creative",
  "Elmstead Design",
  "Paperfold Studio",
  "Marlow Type & Print",
  "Wexford Design Co.",
  "Oakline Creative",
  "Kestrel Print Studio",
  "Halden & Roe",
  "Millbrook Design",
  "Crossfield Creative",
  "Cobblestone Print Works",
  "Ridgeway Studio",
  "Larch & Lane Design",
  "Fallow & Reed",
] as const;

/** The slogans that a card design may print, one chosen at random unless given. */
export const cardSlogans = [
  "Print, done properly.",
  "Small studio. Careful work.",
  "Considered design for everyday business.",
  "Identity, set in ink.",
  "Good paper. Better first impressions.",
  "Designed to be handed over.",
  "Clarity, printed.",
  "Made to be kept.",
  "Quiet design, lasting impression.",
  "Detail is the whole point.",
  "Ink, paper, and a little patience.",
  "Craft you can hold.",
  "Print with a point of view.",
  "Simple, sharp, memorable.",
  "First impressions, considered.",
  "Designed in-house, printed with care.",
  "Less noise. More paper.",
  "Built on good typography.",
  "From sketch to press.",
  "Honest work on good stock.",
  "Colour, weight, finish. Nothing else.",
  "Small runs, real care.",
  "Precision from the first proof.",
  "We sweat the small print.",
  "Paper with personality.",
  "Details, deliberately.",
  "Every card tells a story.",
  "Thoughtful print for thoughtful people.",
  "Form that fits in a pocket.",
] as const;

/** The footers of a collection sheet, one chosen at random unless given. */
export const cardFooters = [
  "PROOF SHEET",
  "CLIENT REVIEW",
  "SAMPLE SET",
  "COLOUR OPTIONS",
  "PRINT PROOF",
  "SELECTION SHEET",
] as const;

/** The subtitles of a collection sheet, one chosen at random unless given. */
export const cardSubtitles = [
  "Colour options for review.",
  "Proof set, first round.",
  "Finishes and colourways.",
  "Client selection sheet.",
  "Sample set for approval.",
] as const;

/** Texts given for a design, each in place of the one chosen at random. */
export type CardCopyOverrides = Partial<CardPresentation>;

/** Each text of a design: its name in a refusal, and what it is when none is given. */
const COPY_TEXTS: Readonly<
  Record<
    CopyField,
    { readonly label: string; readonly fallback: (choose: UniformChoice) => string }
  >
> = {
  studioName: { label: "studio name", fallback: (choose) => pickWith(studioNames, choose) },
  slogan: { label: "slogan", fallback: (choose) => pickWith(cardSlogans, choose) },
  subtitle: { label: "subtitle", fallback: (choose) => pickWith(cardSubtitles, choose) },
  footer: { label: "footer", fallback: (choose) => pickWith(cardFooters, choose) },
  referenceLabel: { label: "reference label", fallback: () => "Ref." },
};

/**
 * The texts that a design prints besides the person's details, in the order in which a host asks
 * for them: every sheet has the frame of a design study with the studio name, slogan, subtitle and
 * footer (drawStudyFrame, collection-sheet.ts); a separate card, which only a business design
 * makes (assertIndividualTemplate, render.ts), prints the label before its code
 * (business-cards.ts). `sheets`: the cards are printed on sheets, not as separate cards.
 */
export function designTexts(sheets: boolean): readonly (keyof CardCopyOverrides)[] {
  return sheets ? ["studioName", "slogan", "subtitle", "footer"] : ["referenceLabel"];
}

export type { UniformChoice };

function copyValue(value: string | undefined, fallback: () => string, label: string): string {
  if (value === undefined) return fallback();
  // A "-" hides the line, which card text never is otherwise.
  if (value === "-") return "";
  return cardText(value, label, "; use - to hide it.");
}
/**
 * The texts of a design: those of `copy`, checked, and the rest chosen with `choose`. An export
 * settles them once (ExportDetails, export-details.ts); independent of all mnemonic data.
 */
export function resolveCardPresentation(
  choose: UniformChoice,
  copy: CardCopyOverrides = {},
): CardPresentation {
  // In the order of COPY_FIELDS, which is the order of the random choices.
  return Object.fromEntries(
    COPY_FIELDS.map((field) => {
      const { label, fallback } = COPY_TEXTS[field];
      return [field, copyValue(copy[field], () => fallback(choose), label)];
    }),
  ) as CardPresentation;
}
