import type { StudyTheme } from "./collection-layout.js";
import { channelsHex, rgbChannels } from "./color-math.js";
import { isRgbReference, rgbReferenceDigits } from "../core/colors.js";
import type { MaterialStyle } from "./card-settings.js";
import { capitalized } from "../core/prose.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.material-artwork", {
  "material-reference-contain-exactly-six-hexadecimal-digits": () =>
    "Material reference must contain exactly six hexadecimal digits.",
  "material-offers-only-distinct-samples": (value0: string, value1: string) =>
    `The ${value0} material offers only ${value1} distinct samples.`,
});

// The styles are named with the other card settings, which the template catalog reads without
// this artwork.
export type { MaterialStyle };

/** RGB entries describe the artwork, never the encoded reference. */
export interface MaterialFinish {
  readonly name: string;
  readonly color: string;
  readonly crop: readonly [number, number, number, number];
  /**
   * The surface word of a tinted sample's label, such as "glaze" in "Sage glaze". Only a finish
   * with one carries catalogue colours; wood, stone and glass are shown only as photographed.
   */
  readonly surface?: string;
  /**
   * Where the material's outline lies on this photograph, as scale, x shift and y shift: the
   * outline point (x, y) lies at (x * scale + x shift, y * scale + y shift) of the crop.
   */
  readonly outlineFit?: readonly [number, number, number];
  /** Shown only under a tint, because as photographed it looks too much like another finish. */
  readonly onlyTinted?: boolean;
}
/** A colour of a material's catalogue: its name and its #RRGGBB code. */
export interface CatalogueColour {
  readonly name: string;
  readonly color: string;
}
/** The colours a material really comes in, and how they are laid over its photographs. */
export interface MaterialCatalogue {
  readonly colours: readonly CatalogueColour[];
  /** How much of a reference's colourfulness counts when its sample is chosen. */
  readonly chromaScale: number;
  /** Whether a tinted label starts with the surface ("Satin signal red") or ends with it. */
  readonly surfaceFirst: boolean;
  /**
   * The part of a crop that a tint covers, as rings of x, y pairs in fractions of the crop with y
   * downwards: the object, then any hole in it such as a screw. scripts/trace-material-outlines.py
   * traces it on one photograph and fits it to every other.
   */
  readonly outline: readonly (readonly number[])[];
}
/**
 * The artwork of a material design: the title and backdrop of its study, whether it is dark, its
 * background colour, its finishes and its catalogue of colours.
 */
export interface MaterialArtwork {
  readonly title: string;
  /** The page of the design study: a backdrop from the material's own world. */
  readonly studyTheme: StudyTheme;
  readonly dark: boolean;
  readonly background: readonly [number, number, number];
  readonly finishes: readonly MaterialFinish[];
  readonly catalogue: MaterialCatalogue;
}
/**
 * The optional details of a finish row: those of MaterialFinish beyond its name, colour and crop.
 */
type FinishDetails = Pick<MaterialFinish, "surface" | "outlineFit" | "onlyTinted">;
/** A finish photographed for its material: its name, colour, crop in pixels and details. */
type FinishRow = (
  name: string,
  color: string,
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
  details?: FinishDetails,
) => MaterialFinish;
/**
 * The finishes of one photograph of `sourceWidth` x `sourceHeight` pixels, which `rows` writes
 * one `finish` row each, its crop in pixels of the photograph. The size is stated once per
 * material; scripts/trace-material-outlines.py reads it and the rows from here.
 */
function photographed(
  sourceWidth: number,
  sourceHeight: number,
  rows: (finish: FinishRow) => MaterialFinish[],
): MaterialFinish[] {
  return rows((name, color, x, y, cropWidth, cropHeight, details = {}) => ({
    name,
    color,
    crop: [x / sourceWidth, y / sourceHeight, cropWidth / sourceWidth, cropHeight / sourceHeight],
    ...details,
  }));
}
/**
 * The details of a finish that takes the catalogue colours: the word of its surface, and the
 * scale and shift that lay the material's outline on its photograph (outlineFit).
 */
function surfaced(surface: string, scale: number, x: number, y: number): FinishDetails {
  return { surface, outlineFit: [scale, x, y] };
}
const colours = (entries: Record<string, string>): CatalogueColour[] =>
  Object.entries(entries).map(([name, color]) => ({ name, color }));
/** The artwork of each material design. */
export const materialArtwork: Record<MaterialStyle, MaterialArtwork> = {
  kitchen: {
    title: "KITCHEN / MATERIAL SELECTION",
    studyTheme: "parquet",
    dark: false,
    background: [0.928, 0.915, 0.886],
    finishes: photographed(1580, 996, (finish) => [
      finish("Ivory limestone", "E3DCCF", 49, 186, 346, 250),
      finish("Smoked walnut", "795A42", 427, 187, 346, 250),
      finish("Cashmere matte", "AAA092", 807, 186, 346, 250, surfaced("matte", 0.99, 0.008, 0.009)),
      finish("Graphite matte", "383C3D", 1191, 185, 346, 250, surfaced("matte", 1, 0, 0)),
      finish(
        "Champagne satin",
        "A89273",
        48,
        506,
        346,
        250,
        surfaced("satin", 0.995, 0.005, 0.002),
      ),
      finish(
        "Olive lacquer",
        "747968",
        428,
        505,
        346,
        250,
        surfaced("lacquer", 1.005, 0.003, 0.006),
      ),
      finish("Warm travertine", "D2C0A2", 807, 509, 346, 250),
      finish("Smoked glass", "87928F", 1191, 508, 346, 250),
    ]),
    // Lacquer colours of kitchen fronts, quiet enough for a kitchen; walnut, stone and glass are
    // shown only as photographed.
    catalogue: {
      colours: colours({
        Navy: "263A5C",
        Denim: "56708F",
        "Sky blue": "8FAAC2",
        Teal: "2F6766",
        Petrol: "2E5560",
        "Forest green": "2F4A38",
        Sage: "8E9B7E",
        Pistachio: "B9C47E",
        Mint: "9DC0A8",
        Mustard: "B8952F",
        Ochre: "B9873E",
        Terracotta: "B4653F",
        Burgundy: "6E2F35",
        Plum: "5E3F58",
        Mauve: "A47488",
        "Dusty pink": "C49A96",
        Lavender: "9D93B5",
        Heather: "76689A",
        Chocolate: "4A3329",
        Caramel: "A87A50",
        Indigo: "3A3A6E",
        Moss: "5E6B3E",
        Aqua: "86B7B9",
        Fern: "6F8F5E",
        Jade: "5E8E78",
        Amethyst: "9A7FB8",
        Violet: "6B4FA0",
        Cobalt: "4A68A8",
      }),
      chromaScale: 0.55,
      surfaceFirst: false,
      outline: [
        [
          0.031, 0.043, 0.966, 0.043, 0.969, 0.072, 0.975, 0.08, 0.969, 0.097, 0.969, 0.953, 0.96,
          0.961, 0.058, 0.961, 0.046, 0.977, 0.04, 0.977, 0.025, 0.953, 0.025, 0.051,
        ],
      ],
    },
  },
  vehicle: {
    title: "VEHICLE WRAP / FINISH SELECTION",
    studyTheme: "studio",
    dark: false,
    background: [0.916, 0.904, 0.875],
    finishes: photographed(1536, 1024, (finish) => [
      finish(
        "Matte charcoal",
        "35383B",
        82,
        251,
        335,
        232,
        surfaced("matte", 1.005, -0.002, -0.002),
      ),
      finish("Satin black", "181B20", 430, 249, 335, 232, surfaced("satin", 1, 0, 0)),
      finish("Cement gray", "8A9094", 776, 249, 335, 232, surfaced("matte", 1.005, -0.002, -0.002)),
      finish("Ivory white", "E8E4DC", 1121, 248, 335, 232, surfaced("satin", 0.98, 0.01, 0.014)),
      finish("Desert sand", "BAA17C", 82, 549, 335, 233, surfaced("matte", 1.015, -0.007, -0.003)),
      finish("Army olive", "59624B", 431, 547, 335, 233, surfaced("matte", 1.015, -0.007, -0.003)),
      finish(
        "Midnight blue",
        "263E59",
        776,
        547,
        335,
        233,
        surfaced("satin", 1.015, -0.007, -0.003),
      ),
      finish("Warm taupe", "8D8073", 1122, 547, 335, 233, surfaced("matte", 1.015, -0.007, -0.003)),
    ]),
    // Wrap film colours; cars carry them far more vividly than tiles or switches.
    catalogue: {
      colours: colours({
        "Cherry red": "6B1F26",
        "Racing green": "1F3D2C",
        "Deep purple": "3A2550",
        "Signal red": "A52A2A",
        "Royal blue": "2A4A9A",
        Teal: "1F6E6E",
        Emerald: "1E6B48",
        Violet: "5A3A80",
        Berry: "8A2F5A",
        Copper: "8C5A3C",
        "Burnt orange": "B4561F",
        "Steel blue": "4C6E8F",
        "Sky blue": "7FA7C9",
        Lavender: "9A8FBF",
        Rose: "C08A93",
        Mint: "9CC7B0",
        Lime: "8DA33A",
        Magenta: "B03A7A",
        Turquoise: "3A9A9A",
        Mustard: "B8902A",
        "Racing yellow": "D9B526",
        Orange: "D9822B",
        Coral: "D97B66",
        "Pastel yellow": "F0E2A0",
        "Ice blue": "C8DDF0",
        Pistachio: "D5E6C0",
        "Kelly green": "4C9A50",
        "Apple green": "7DB45A",
        Amethyst: "8A6BB0",
        Aqua: "8FE0E0",
        Lilac: "D2B8E6",
      }),
      chromaScale: 0.85,
      surfaceFirst: true,
      outline: [
        [
          0.87, 0.054, 0.876, 0.054, 0.885, 0.071, 0.93, 0.213, 0.936, 0.256, 0.942, 0.343, 0.942,
          0.593, 0.936, 0.662, 0.927, 0.709, 0.891, 0.782, 0.852, 0.838, 0.831, 0.851, 0.796, 0.89,
          0.721, 0.925, 0.569, 0.942, 0.407, 0.938, 0.246, 0.916, 0.19, 0.877, 0.151, 0.838, 0.091,
          0.756, 0.07, 0.713, 0.058, 0.631, 0.058, 0.39, 0.067, 0.231, 0.112, 0.08, 0.127, 0.058,
          0.237, 0.097, 0.333, 0.114, 0.431, 0.123, 0.566, 0.123, 0.727, 0.101, 0.834, 0.071,
        ],
      ],
    },
  },
  enclosure: {
    title: "ENCLOSURE FINISH SELECTION",
    // Anodised boxes sit well on the dark page of the business cards.
    studyTheme: "warm",
    dark: true,
    background: [0.1, 0.105, 0.11],
    finishes: photographed(1578, 997, (finish) => [
      finish("Deep blue", "304C68", 50, 148, 356, 294, surfaced("anodised", 1.005, -0.005, -0.009)),
      finish("Petrol teal", "35666B", 424, 148, 356, 294, surfaced("anodised", 1, 0, 0)),
      finish("Smoked violet", "514757", 798, 148, 356, 294, surfaced("anodised", 1, 0, 0)),
      finish("Sage anodised", "76816D", 1173, 148, 356, 294, surfaced("anodised", 1.01, 0.001, 0)),
      finish("Bronze gold", "827445", 50, 509, 356, 294, surfaced("anodised", 1, -0.003, 0.01)),
      finish("Burgundy", "783E49", 424, 509, 356, 294, surfaced("anodised", 1, 0, 0.007)),
      finish("Champagne", "B1A69A", 798, 509, 356, 294, surfaced("anodised", 1.005, 0.003, 0.012)),
      finish("Graphite", "555B60", 1173, 509, 356, 294, surfaced("anodised", 1, -0.003, 0.01)),
    ]),
    // Anodised aluminium colours of instrument cases.
    catalogue: {
      colours: colours({
        "Signal red": "A82A2A",
        Orange: "C8642A",
        Gold: "C49A3A",
        Lime: "8FB03A",
        "Racing green": "2E5A3C",
        Emerald: "2A8A5A",
        Turquoise: "2C8F8F",
        "Ice blue": "8FB8D8",
        Cobalt: "2B4E96",
        "Royal blue": "3A5CC0",
        Purple: "4E3478",
        Lilac: "A890D0",
        Magenta: "9A2F72",
        Pink: "D07A9A",
        "Rose gold": "C48C80",
        Copper: "9A5A3C",
        Olive: "646238",
        Mint: "8CC8A8",
        "Sky blue": "5A9AD0",
        Plum: "5A2A4A",
        "Spring green": "7FD08A",
        Lemon: "E0D040",
        Aqua: "6ACACA",
        "Apple green": "6AA040",
      }),
      chromaScale: 0.75,
      surfaceFirst: false,
      // The box without the floor below it, the frame around the photograph and the steel screw.
      outline: [
        [
          0.045, 0.009, 0.149, 0.016, 0.845, 0.012, 0.958, 0.016, 0.97, 0.023, 0.99, 0.047, 0.99,
          0.096, 0.984, 0.114, 0.984, 0.135, 0.993, 0.152, 0.981, 0.344, 0.984, 0.677, 0.97, 0.694,
          0.958, 0.698, 0.929, 0.722, 0.921, 0.719, 0.883, 0.753, 0.857, 0.757, 0.837, 0.778, 0.802,
          0.792, 0.79, 0.806, 0.776, 0.809, 0.764, 0.823, 0.738, 0.834, 0.724, 0.851, 0.721, 0.848,
          0.715, 0.855, 0.707, 0.855, 0.698, 0.865, 0.684, 0.869, 0.672, 0.883, 0.646, 0.886, 0.629,
          0.907, 0.614, 0.911, 0.605, 0.921, 0.597, 0.921, 0.577, 0.942, 0.565, 0.942, 0.559, 0.949,
          0.551, 0.942, 0.539, 0.953, 0.525, 0.953, 0.51, 0.967, 0.475, 0.981, 0.449, 0.981, 0.429,
          0.967, 0.406, 0.96, 0.354, 0.925, 0.316, 0.907, 0.302, 0.893, 0.218, 0.851, 0.152, 0.806,
          0.134, 0.802, 0.1, 0.778, 0.03, 0.743, 0.016, 0.726, 0.013, 0.684, 0.013, 0.054, 0.019,
          0.037,
        ],
        [
          0.423, 0.509, 0.441, 0.512, 0.461, 0.526, 0.478, 0.547, 0.484, 0.565, 0.49, 0.61, 0.481,
          0.638, 0.47, 0.652, 0.432, 0.652, 0.397, 0.607, 0.392, 0.544, 0.403, 0.523,
        ],
      ],
    },
  },
  tile: {
    title: "BATHROOM TILE SELECTION",
    studyTheme: "tiled",
    dark: true,
    background: [0.235, 0.228, 0.209],
    finishes: photographed(1578, 996, (finish) => [
      finish("Travertine", "BDA78B", 72, 123, 336, 319),
      finish("Ivory limestone", "D4C6AD", 437, 123, 336, 319),
      finish("White marble", "DAD8D0", 803, 123, 336, 319),
      finish("Black marble", "383A39", 1171, 124, 336, 319),
      finish("Olive glaze", "81856A", 72, 497, 336, 319, surfaced("glaze", 1.01, -0.005, -0.005)),
      finish(
        "Petrol glaze",
        "335D64",
        437,
        497,
        336,
        319,
        surfaced("glaze", 0.995, -0.001, -0.004),
      ),
      finish("Terracotta", "A66E52", 803, 498, 336, 319, surfaced("clay", 1.005, -0.006, -0.006)),
      // As photographed it is too close to Travertine; it carries the light catalogue colours.
      finish("Fluted sand", "B4AA98", 1171, 498, 336, 319, {
        ...surfaced("fluted tile", 1.015, -0.007, -0.004),
        onlyTinted: true,
      }),
    ]),
    // Colours that glazed and clay tiles are really made in, after tile catalogues: far quieter
    // than most codes, so that the sheet stays one a bathroom planner could hand out.
    catalogue: {
      colours: colours({
        Burgundy: "6E2F35",
        Moss: "4F5A30",
        Teal: "2A6A5A",
        Navy: "253A5E",
        Indigo: "3A3A6E",
        Plum: "6B4A68",
        Rose: "C07A80",
        Ochre: "C08A3E",
        Olive: "7D7A45",
        Jade: "5E8A74",
        Denim: "5A7A9C",
        Heather: "8A72A8",
        Mauve: "9C7A8F",
        "Dusty pink": "C7A29C",
        Mustard: "B8952F",
        Pistachio: "B5BD86",
        Celadon: "92BFA0",
        "Sky blue": "8FAEC2",
        Lavender: "9D93B5",
        Aqua: "8EC5C8",
      }),
      chromaScale: 0.45,
      surfaceFirst: false,
      // The tile without the dark wall around it.
      outline: [
        [
          0.063, 0.037, 0.937, 0.037, 0.943, 0.044, 0.94, 0.94, 0.925, 0.956, 0.91, 0.953, 0.876,
          0.96, 0.846, 0.96, 0.836, 0.953, 0.506, 0.953, 0.479, 0.96, 0.424, 0.953, 0.31, 0.953,
          0.298, 0.96, 0.231, 0.953, 0.164, 0.96, 0.075, 0.956, 0.06, 0.963, 0.054, 0.956, 0.054,
          0.063, 0.057, 0.044,
        ],
      ],
    },
  },
  switch: {
    title: "SWITCH FINISH SELECTION",
    studyTheme: "concrete",
    dark: false,
    background: [0.934, 0.927, 0.899],
    finishes: photographed(1579, 996, (finish) => [
      finish(
        "Brushed brass",
        "B8A078",
        73,
        138,
        320,
        303,
        surfaced("brushed", 1.005, 0.001, 0.001),
      ),
      finish(
        "Brushed silver",
        "AAA9A0",
        447,
        137,
        320,
        303,
        surfaced("brushed", 0.985, 0.014, 0.021),
      ),
      finish("Graphite", "414548", 820, 139, 320, 303, surfaced("matte", 1.01, -0.008, -0.012)),
      finish("Porcelain", "E5E3DC", 1187, 137, 320, 303, surfaced("matte", 1, 0.01, -0.003)),
      finish("Aged bronze", "6B5940", 76, 504, 320, 303, surfaced("brushed", 1, -0.003, 0.003)),
      finish("Ocean blue", "315969", 447, 504, 320, 303, surfaced("matte", 1, 0, 0)),
      finish("Sage green", "798267", 820, 503, 320, 303, surfaced("matte", 1.01, -0.008, -0.002)),
      finish("Copper", "B68161", 1189, 503, 320, 303, surfaced("brushed", 1.01, -0.008, -0.002)),
    ]),
    // Colours of designer switch ranges, in brushed metal or matte lacquer.
    catalogue: {
      colours: colours({
        "Signal red": "A8322D",
        Burgundy: "6E2A33",
        "Brick red": "9A4436",
        "Rose pink": "D99AA8",
        Mustard: "B8923A",
        Olive: "6E6B3E",
        "Forest green": "2F4A38",
        Mint: "98D4B4",
        Teal: "2E6A68",
        "Sky blue": "7FB3DE",
        Navy: "24334F",
        Indigo: "3E3C6E",
        Lavender: "A08CC8",
        Plum: "5E3A58",
        Mauve: "9B7A8E",
        Orange: "D07A35",
        Lemon: "E3CF6A",
        "Leaf green": "5E9550",
        Pistachio: "BFD39A",
        Aqua: "6CC9C9",
        Cobalt: "2F4F95",
        Violet: "6A4A92",
        Fuchsia: "A8457E",
        Coral: "D88A78",
        Butter: "EFE3B0",
        "Powder blue": "C3D6E6",
        "Spring green": "8CCB8A",
        Lime: "B5D36A",
      }),
      chromaScale: 0.7,
      surfaceFirst: true,
      outline: [
        [
          0.121, 0.053, 0.86, 0.053, 0.883, 0.059, 0.908, 0.083, 0.912, 0.503, 0.905, 0.592, 0.912,
          0.622, 0.912, 0.832, 0.905, 0.91, 0.895, 0.92, 0.879, 0.934, 0.867, 0.937, 0.214, 0.941,
          0.098, 0.934, 0.076, 0.914, 0.072, 0.1, 0.076, 0.08, 0.095, 0.059,
        ],
      ],
    },
  },
};

// sRGB transfer curve and D65 XYZ-to-Lab conversion. Distances choose decoration only;
// the original hexadecimal reference remains untouched and fully recoverable.
function lab(hex: string): [number, number, number] {
  const channels = rgbChannels(hex).map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  const [r, g, b] = channels as [number, number, number];
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * A sample of a material that a card shows for a code: the finish, the catalogue colour laid over
 * it if any, its label and how it looks.
 */
export interface MaterialSample {
  readonly finish: MaterialFinish;
  /** The catalogue colour laid over the photograph; none for a finish as photographed. */
  readonly tint?: string;
  readonly label: string;
  /** How the sample looks: the photograph's colour under its tint. */
  readonly look: string;
}

/**
 * How strongly a tint covers its photograph; the little of the photograph's own colour that shows
 * through keeps the surface natural.
 */
export const TINT_OPACITY = 0.85;
// Codes are far more colourful than any real finish: their colourfulness is scaled per material,
// then capped near that of the most colourful samples, so that the hue decides the match.
const CHROMA_CAP = 45;
// Lightness counts half when a sample is matched to a code: the photographs offer only a few
// steps of lightness, and the direction of the colour matters most.
const MATCH_LIGHTNESS_WEIGHT = 0.5;

/**
 * How a photograph of colour `base` looks under a tint, as the PDF "Color" blend mode paints it
 * (ISO 32000-1, 11.3.5.3): the tint's hue and saturation at the photograph's luminosity, mixed
 * with the photograph by TINT_OPACITY.
 */
export function tintedLook(base: string, tint: string): string {
  const luminosity = ([r, g, b]: number[]) =>
    0.3 * defined(r) + 0.59 * defined(g) + 0.11 * defined(b);
  const backdrop: number[] = rgbChannels(base);
  const light = luminosity(backdrop);
  const shifted = rgbChannels(tint).map((v, _, all) => v + light - luminosity(all));
  // ClipColor: pulls the channels toward the luminosity until they fit between 0 and 1.
  const low = Math.min(...shifted);
  const high = Math.max(...shifted);
  const clipped = shifted.map((v) => {
    if (low < 0) v = light + ((v - light) * light) / (light - low);
    if (high > 1) v = light + ((v - light) * (1 - light)) / (high - light);
    return v;
  });
  return channelsHex(
    backdrop.map((v, i) => (1 - TINT_OPACITY) * v + TINT_OPACITY * defined(clipped[i])),
  );
}

/**
 * Every sample a material can show: its finishes as photographed and each catalogue colour,
 * laid over the tintable photograph of nearest lightness, since the tint keeps the photograph's
 * light, shading and texture.
 */
export function materialSamples(style: MaterialStyle): MaterialSample[] {
  const { finishes, catalogue } = materialArtwork[style];
  const photographed = finishes
    .filter((finish) => !finish.onlyTinted)
    .map((finish) => ({ finish, label: finish.name, look: finish.color }));
  const tintable = finishes.filter((finish) => finish.surface !== undefined);
  const tinted = catalogue.colours.map(({ name, color }) => {
    const lightness = lab(color)[0];
    const finish = tintable.reduce((best, candidate) =>
      Math.abs(lab(candidate.color)[0] - lightness) < Math.abs(lab(best.color)[0] - lightness)
        ? candidate
        : best,
    );
    const surface = defined(finish.surface);
    const label = catalogue.surfaceFirst
      ? `${capitalized(surface)} ${name.toLowerCase()}`
      : `${name} ${surface}`;
    return { finish, tint: color, label, look: tintedLook(finish.color, color) };
  });
  return [...photographed, ...tinted];
}

/**
 * The sample of every reference of a card. Every distinct reference gets its own sample: the pairs
 * of reference and sample are taken nearest first, each sample at most once, so that two codes
 * never look alike while each keeps the direction of its colour as far as the catalogue allows.
 * The same references get the same samples in any order and letter case, and a repeated reference
 * keeps its sample. Its neighbours take part in the choice, so in another collection a reference
 * may get another sample.
 */
export function chooseMaterialSamples(
  style: MaterialStyle,
  references: readonly string[],
): MaterialSample[] {
  if (!references.every(isRgbReference))
    throw ERRORS.create("material-reference-contain-exactly-six-hexadecimal-digits", []);
  const { chromaScale } = materialArtwork[style].catalogue;
  const samples = materialSamples(style);
  const codes = [...new Set(references.map(rgbReferenceDigits))];
  if (codes.length > samples.length)
    throw ERRORS.create("material-offers-only-distinct-samples", [`${style}`, `${samples.length}`]);
  const point = ([l, a, b]: readonly number[]) => [
    defined(l) * MATCH_LIGHTNESS_WEIGHT,
    defined(a),
    defined(b),
  ];
  const looks = samples.map((sample) => point(lab(sample.look)));
  const pairs = codes.flatMap((code, c) => {
    const [l, a, b] = lab(code);
    const chroma = Math.hypot(a, b);
    const scale = chroma === 0 ? 0 : Math.min(chroma * chromaScale, CHROMA_CAP) / chroma;
    const target = point([l, a * scale, b * scale]);
    return looks.map((look, s) => ({ c, s, distance: labDistance(look, target) }));
  });
  pairs.sort((x, y) => x.distance - y.distance || x.c - y.c || x.s - y.s);
  const chosen: MaterialSample[] = [];
  const taken = new Set<number>();
  for (const { c, s } of pairs) {
    if (chosen[c] !== undefined || taken.has(s)) continue;
    chosen[c] = defined(samples[s]);
    taken.add(s);
  }
  return references.map((reference) =>
    defined(chosen[codes.indexOf(rgbReferenceDigits(reference))]),
  );
}

const labDistance = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, v, i) => sum + (v - defined(b[i])) ** 2, 0);
