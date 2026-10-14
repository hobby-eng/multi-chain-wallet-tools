// What sets each business design apart, in one descriptor per design (businessDesigns): the hue
// of its photograph, how strongly its artwork takes a reference's colour, the ink of its text, its
// reference line, the theme of its sheet and where it prints the person's details. The renderer
// and the artwork ask the descriptor instead of testing a design's name, so a new design's
// behaviour is one entry here, which the compiler requires to be complete. The design also needs
// its style in template-catalog.ts, its name in templates.ts and its photograph
// images/business-<style>-v1.png.
// Plain data: the colours that the tones name stay with the renderer (business-cards.ts).

import {
  profileFieldLabel,
  type BusinessStyle,
  type CardProfile,
  type ProfileField,
} from "./card-settings.js";
import { BUSINESS_STYLES, type PhysicalBusinessStyle } from "./template-catalog.js";

export type { PhysicalBusinessStyle };
/** The business designs with artwork of their own, in the catalog's order: "mixed" draws them. */
export const businessStyles: readonly PhysicalBusinessStyle[] = Object.freeze(
  BUSINESS_STYLES.filter((style): style is PhysicalBusinessStyle => style !== "mixed"),
);

/** One detail of the person on a card, with its place and sizes. */
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

/**
 * Where a design prints one detail of the person: `x` and `width` are shares of the card width,
 * `y` the top of the line box as a share of its height, `preferred` the size in points on a card.
 */
interface FieldPlace {
  readonly field: ProfileField;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly preferred: number;
  /** In dark ink, on a light part of the artwork; white otherwise. */
  readonly dark: boolean;
}

/** How strongly the artwork takes a reference's colour (business-tint.ts names the factors). */
export type BusinessTint = "vivid" | "muted";

/** The reference line of a separate card. */
export interface ReferenceLine {
  /** Where the line may end, in millimetres from the left edge of the card. */
  readonly end: number;
  /** Whether the line starts at REFERENCE_MARGIN or ends at `end`. */
  readonly align: "start" | "end";
  /** Its size in points, from which a long line shrinks. */
  readonly preferredSize: number;
  /** Dark ink on a light edge of the artwork, or a light grey on a dark one. */
  readonly tone: "dark" | "light";
}

/** One business design. */
export interface BusinessDesign {
  /** The hue of the photograph's coloured parts, from 0 to 1, which a reference's hue replaces. */
  readonly hueOrigin: number;
  readonly tint: BusinessTint;
  /**
   * The ink of the dark fields: always the dark ink, or chosen against the reference's colour where
   * those fields lie on it (the curves design).
   */
  readonly darkFieldInk: "fixed" | "contrast";
  readonly reference: ReferenceLine;
  /** The theme of a sheet of its cards alone: the IT design's dark artwork has its own. */
  readonly studyTheme: BusinessStudyTheme;
  /**
   * The person's details, measured from the artwork: a single line is centred on its icon or
   * logo, and a role starts at least 0.6 mm below the name above it.
   */
  readonly fields: readonly FieldPlace[];
}

/** The themes of a sheet of business cards (collection-sheet.ts StudyTheme). */
export type BusinessStudyTheme = "cool" | "noir";
/** The theme of a sheet of mixed designs. */
const MIXED_STUDY_THEME: BusinessStudyTheme = "cool";

/** Where the reference line of a separate card starts, in millimetres from the left edge. */
export const REFERENCE_MARGIN = 7.2;
/** How long the reference line may be, in millimetres. */
const REFERENCE_WIDTH = 76;
/** Where the IT design ends its reference line, clear of its artwork, in millimetres. */
const IT_REFERENCE_END = 55.5;
/** The reference line of most designs: from the margin, light grey, 6.3 pt. */
const STANDARD_REFERENCE: ReferenceLine = Object.freeze({
  end: REFERENCE_MARGIN + REFERENCE_WIDTH,
  align: "start",
  preferredSize: 6.3,
  tone: "light",
});

/** The least size of a name, in points on a card. */
const NAME_MINIMUM_SIZE = 6;
/** The least size of every other detail, in points on a card. */
const FIELD_MINIMUM_SIZE = 4;

function place(
  field: ProfileField,
  x: number,
  y: number,
  width: number,
  preferred: number,
  dark = false,
): FieldPlace {
  return Object.freeze({ field, x, y, width, preferred, dark });
}

/**
 * A design frozen all the way down, with its reference line and its fields: every card reads the
 * same descriptor, so no importer may change the approved layout at run time.
 */
function design(entry: BusinessDesign): BusinessDesign {
  Object.freeze(entry.fields);
  Object.freeze(entry.reference);
  return Object.freeze(entry);
}

export const businessDesigns: Readonly<Record<PhysicalBusinessStyle, BusinessDesign>> =
  Object.freeze({
    architect: design({
      hueOrigin: 0.56,
      tint: "muted",
      darkFieldInk: "fixed",
      reference: STANDARD_REFERENCE,
      studyTheme: "cool",
      fields: [
        place("company", 0.17, 0.123, 0.36, 7.8),
        place("name", 0.08, 0.268, 0.43, 10),
        place("role", 0.08, 0.368, 0.41, 6),
        place("email", 0.16, 0.514, 0.32, 6.2),
        place("website", 0.16, 0.657, 0.34, 6.2),
        place("location", 0.16, 0.8, 0.37, 6.2),
      ],
    }),
    it: design({
      hueOrigin: 0.56,
      tint: "muted",
      darkFieldInk: "fixed",
      // The line ends clear of the artwork and is set flush right against it.
      reference: { ...STANDARD_REFERENCE, end: IT_REFERENCE_END, align: "end" },
      studyTheme: "noir",
      fields: [
        place("company", 0.17, 0.123, 0.36, 7.8),
        place("name", 0.08, 0.265, 0.43, 10),
        place("role", 0.08, 0.36, 0.41, 6),
        place("email", 0.16, 0.518, 0.32, 6.2),
        place("website", 0.16, 0.664, 0.34, 6.2),
        place("location", 0.16, 0.812, 0.37, 6.2),
      ],
    }),
    estate: design({
      hueOrigin: 0.56,
      tint: "vivid",
      darkFieldInk: "fixed",
      reference: STANDARD_REFERENCE,
      studyTheme: "cool",
      fields: [
        place("company", 0.2, 0.13, 0.29, 9),
        place("name", 0.071, 0.32, 0.4, 10.5),
        place("role", 0.071, 0.408, 0.4, 7),
        place("email", 0.14, 0.528, 0.33, 6.4),
        place("phone", 0.14, 0.604, 0.33, 6.4),
        place("website", 0.14, 0.68, 0.33, 6.4),
        place("location", 0.14, 0.749, 0.33, 6.4),
      ],
    }),
    diagonal: design({
      hueOrigin: 0.09,
      tint: "vivid",
      darkFieldInk: "fixed",
      reference: STANDARD_REFERENCE,
      studyTheme: "cool",
      fields: [
        // The photograph narrows the free space towards the top, so the line is kept shorter.
        place("company", 0.18, 0.122, 0.285, 9),
        place("name", 0.065, 0.35, 0.42, 10),
        place("role", 0.065, 0.435, 0.42, 6.8),
        place("email", 0.065, 0.58, 0.41, 6.4),
        place("website", 0.065, 0.66, 0.41, 6.4),
        place("phone", 0.065, 0.74, 0.41, 6.4),
      ],
    }),
    contact: design({
      hueOrigin: 0.5,
      tint: "vivid",
      darkFieldInk: "fixed",
      reference: { ...STANDARD_REFERENCE, preferredSize: 4.6, tone: "dark" },
      studyTheme: "cool",
      fields: [
        place("company", 0.065, 0.78, 0.34, 9, true),
        place("name", 0.54, 0.085, 0.41, 9),
        place("role", 0.54, 0.161, 0.41, 6),
        place("phone", 0.54, 0.357, 0.41, 7),
        place("email", 0.54, 0.56, 0.41, 6.5),
        place("website", 0.54, 0.62, 0.41, 6.5),
        place("location", 0.54, 0.816, 0.41, 6.5),
      ],
    }),
    curves: design({
      hueOrigin: 0.12,
      tint: "vivid",
      darkFieldInk: "contrast",
      reference: STANDARD_REFERENCE,
      studyTheme: "cool",
      fields: [
        // Above the logo, on the plain background: lower down, the curve runs under the line.
        place("company", 0.06, 0.095, 0.31, 9),
        place("name", 0.45, 0.163, 0.46, 10, true),
        place("role", 0.45, 0.246, 0.46, 6.5, true),
        place("phone", 0.44, 0.49, 0.47, 7),
        place("email", 0.44, 0.59, 0.47, 6.5),
        place("website", 0.44, 0.69, 0.47, 6.5),
        place("location", 0.44, 0.79, 0.47, 6.5),
      ],
    }),
    facets: design({
      hueOrigin: 0.39,
      tint: "vivid",
      darkFieldInk: "fixed",
      reference: { ...STANDARD_REFERENCE, tone: "dark" },
      studyTheme: "cool",
      fields: [
        place("company", 0.245, 0.125, 0.5, 10, true),
        place("name", 0.245, 0.262, 0.52, 10, true),
        place("role", 0.245, 0.345, 0.52, 6.5, true),
        place("phone", 0.245, 0.5, 0.52, 6.8, true),
        place("email", 0.245, 0.585, 0.52, 6.5, true),
        place("website", 0.245, 0.67, 0.52, 6.5, true),
      ],
    }),
  });

/** The design that card `index` of `style` shows: "mixed" takes the designs in turn. */
export function physicalStyle(style: BusinessStyle, index: number): PhysicalBusinessStyle {
  return style === "mixed" ? businessStyles[index % businessStyles.length]! : style;
}

/** The theme of a sheet of `style`: the design's own, or the mixed sheet's. */
export function studyThemeOf(style: BusinessStyle): BusinessStudyTheme {
  return style === "mixed" ? MIXED_STUDY_THEME : businessDesigns[style].studyTheme;
}

/** The person's details as `style` prints them; a refusal names each by profileFieldLabel. */
export function businessFields(
  style: PhysicalBusinessStyle,
  profile: Required<CardProfile>,
): BusinessField[] {
  return businessDesigns[style].fields.map(({ field, x, y, width, preferred, dark }) => ({
    label: profileFieldLabel(field),
    value: profile[field],
    x,
    y,
    width,
    preferred,
    minimum: field === "name" ? NAME_MINIMUM_SIZE : FIELD_MINIMUM_SIZE,
    dark,
  }));
}
