// Fast representation known answers: without Seedshift at the two BIP39 length boundaries, and
// with MnemoCode Seedshift at the three lengths between them (AUD-020). The 12-word values are
// vectors/mnemocode-v1.json's direct-12. The 24-word zero-entropy phrase is a published BIP39
// vector; its colors were computed with independent decimal packing, first reproducing direct-12.
// The 15-, 18- and 21-word values are the same file's checksum-valid-seedshift-15, -18 and -21.
// Unicode values use the published Traditional Chinese word list. No host service is needed.
import { Masking, decodeInput } from "./masking.js";
import { parseDate } from "./dates.js";
import { formatEncoded, parseInput } from "./representations.js";
import { decodeInputDirect, encodeMnemonic, representMnemonic } from "./seedshift.js";
import { expectRefused, expectSame } from "./self-test-check.js";
import {
  ENCODED_FORMATS,
  type DecodedResult,
  type EncodedFormat,
  type EncodedResult,
} from "./types.js";
import { defined } from "./defined.js";

/** A known answer of the forms of codes: a phrase of `words` words written in every form. */
export interface Answer {
  readonly words: number;
  readonly forms: Readonly<Record<EncodedFormat, string>>;
}

/** An answer with MnemoCode Seedshift: the phrase it masks and its dates, as typed. */
export interface SeedshiftAnswer extends Answer {
  readonly source: string;
  readonly dates: readonly string[];
}

// Fixed answers stay independent of the encoders; constructing them by encoding would hide a
// defect shared by the writer and reader. Repeated literals here are intentional test oracles.
// The 12-word answers are a deliberate copy of vectors/mnemocode-v1.json's direct-12, since a
// startup reads no file; test/startup-edges.test.ts keeps the two in step.
/** The known answers of the forms of codes, a phrase of each length written in every form. */
export const REPRESENTATION_ANSWERS: readonly Answer[] = [
  {
    words: 12,
    forms: {
      english: `${"abandon ".repeat(11)}about`,
      indexes: "1 1 1 1 1 1 1 1 1 1 1 4",
      unicode: "768476847684768476847684768476847684768476845728",
      colors: "#000064 #1EAB91 #3D0964 #5BB491 #7A1264 #98BD91 #B71B64 #D5C694",
      "colors-unicode": "E000E064E13AE191E271E064E3ABE191E4E2E064E61CE191E753E064E88DE194",
    },
  },
  {
    words: 24,
    forms: {
      english: `${"abandon ".repeat(23)}art`,
      indexes: "1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 103",
      unicode: `${"7684".repeat(23)}6027`,
      colors:
        "#000064 #0F6951 #1E84E4 #2DEDD1 #3D0964 #4C7251 #5B8DE4 #6AF6D1 #7A1264 #897B51 #9896E4 #A7FFD1 #B71B64 #C68451 #D59FE4 #E50937",
      "colors-unicode":
        "E000E064E09DF451E138ECE4E1D6E7D1E271E064E30EF451E3A9ECE4E447E7D1E4E2E064E57FF451E61AECE4E6B8E7D1E753E064E7F0F451E88BECE4E929E837",
    },
  },
];

// A deliberate copy of vectors/mnemocode-v1.json's checksum-valid-seedshift-15, -18 and -21, for
// the same reason; test/startup-edges.test.ts keeps them in step too. The three share their dates.
const SEEDSHIFT_DATES = ["07-11-1951", "08-08-1988", "23-09-2026"];
/** The known answers of MnemoCode Seedshift with a valid checksum, for 15, 18 and 21 words. */
export const SEEDSHIFT_ANSWERS: readonly SeedshiftAnswer[] = [
  {
    words: 15,
    source:
      "abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math exhibit",
    dates: SEEDSHIFT_DATES,
    forms: {
      english:
        "view annual like above fabric afraid buddy carbon assume february eager business wet meat horror",
      indexes: "1952 76 1038 5 652 37 236 276 112 675 552 249 1997 1105 878",
      unicode: "76E75982659C4E0D8DD14E3B68396D77517696D9614B5E795BBF91CE8CB7",
      colors: "#02FA80 #1ADF0E #1E867A #35B625 #3D6532 #57E470 #5C9531 #72BFF9 #7D1E1F #8A1AFE",
      "colors-unicode":
        "E01EEC80E113E40EE138EE7AE226E025E274F132E384E070E3B4E131E497E0F9E501E51FE586E4FE",
    },
  },
  {
    words: 18,
    source:
      "abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live bid rib",
    dates: SEEDSHIFT_DATES,
    forms: {
      english:
        "view annual like above fabric afraid buddy carbon assume february eager business wet meat essence lend blame island",
      indexes: "1952 76 1038 5 652 37 236 276 112 675 552 249 1997 1105 619 1024 186 948",
      unicode: "76E75982659C4E0D8DD14E3B68396D77517696D9614B5E795BBF91CE4F547ADF984C71C8",
      colors:
        "#02FA80 #1ADF0E #1E867A #35B625 #3D6532 #57E470 #5C9531 #72BFF9 #7D1E1F #8A19FB #9A2681 #B4FBD4",
      "colors-unicode":
        "E01EEC80E113E40EE138EE7AE226E025E274F132E384E070E3B4E131E497E0F9E501E51FE586E3FBE62AEC81E73DE6D4",
    },
  },
  {
    words: 21,
    source:
      "abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live bid rhythm alien crouch saddle",
    dates: SEEDSHIFT_DATES,
    forms: {
      english:
        "view annual like above fabric afraid buddy carbon assume february eager business wet meat essence lend blame roof when culture canyon",
      indexes:
        "1952 76 1038 5 652 37 236 276 112 675 552 249 1997 1105 619 1024 186 1502 2002 429 271",
      unicode:
        "76E75982659C4E0D8DD14E3B68396D77517696D9614B5E795BBF91CE4F547ADF984C796588D55E02767E",
      colors:
        "#02FA80 #1ADF0E #1E867A #35B625 #3D6532 #57E470 #5C9531 #72BFF9 #7D1E1F #8A19FB #9A2681 #B4FDFE #BA290C #CACB1F",
      "colors-unicode":
        "E01EEC80E113E40EE138EE7AE226E025E274F132E384E070E3B4E131E497E0F9E501E51FE586E3FBE62AEC81E73DE8FEE772E70CE81CEF1F",
    },
  },
];

/**
 * Every form of an answer written from `encoded` exactly, and read back by `decode` to `source`
 * with a valid checksum; `name` begins each check's name.
 */
function checkForms(
  name: string,
  source: string,
  forms: Answer["forms"],
  encoded: EncodedResult,
  decode: (value: string, format: EncodedFormat) => DecodedResult,
): void {
  for (const format of ENCODED_FORMATS) {
    expectSame(formatEncoded(encoded, format), forms[format], `${name} ${format} encoding`);
    const decoded = decode(forms[format], format);
    expectSame(decoded.recoveredMnemonic, source, `${name} ${format} decoding`);
    expectSame(decoded.checksumValid, true, `${name} ${format} checksum`);
  }
}

/**
 * Exact forward/reverse answers and refusals, without PBKDF2, files, renderers or a share engine.
 */
export function checkRepresentationStartup(): void {
  for (const { words, forms } of REPRESENTATION_ANSWERS)
    checkForms(
      `Direct ${words}-word`,
      forms.english,
      forms,
      representMnemonic(forms.english),
      decodeInputDirect,
    );
  for (const { words, source, dates, forms } of SEEDSHIFT_ANSWERS) {
    const parsed = dates.map(parseDate);
    checkForms(
      `Seedshift ${words}-word`,
      source,
      forms,
      encodeMnemonic(source, parsed),
      (value, format) => decodeInput(value, format, parsed),
    );
  }
  for (const bad of [0, 2049])
    expectRefused(
      () => decodeInputDirect(`${bad} ${"1 ".repeat(10)}4`, "indexes"),
      /numbering from 1 through 2048/u,
      `Direct word number ${bad}`,
    );
  expectRefused(
    () => decodeInputDirect(`${"1 ".repeat(12)}4`, "indexes"),
    /12.*24/u,
    "Direct 13-word input",
  );
  const invalid = parseInput("1 ".repeat(12), "indexes");
  // Direct decoding reports checksumValid=false. A checksum-valid Seedshift container must
  // refuse these same bad indexes; direct input and a masked container have different contracts.
  expectSame(
    decodeInputDirect("1 ".repeat(12), "indexes").checksumValid,
    false,
    "Bad direct checksum",
  );
  expectRefused(
    () => Masking.of("seedshift").undo(invalid, [parseDate("23-09-2026")]),
    /checksum/u,
    "Bad Seedshift container",
  );
  expectRefused(
    () =>
      parseInput(
        `F8FFF8FF${defined(REPRESENTATION_ANSWERS[0]).forms["colors-unicode"].slice(8)}`,
        "colors-unicode",
      ),
    /outside the #RRGGBB range/u,
    "Color Unicode beyond RGB",
  );
  expectRefused(
    () => parseInput(defined(REPRESENTATION_ANSWERS[0]).forms.english, "unknown" as EncodedFormat),
    /Unsupported encoded format/u,
    "Unknown representation",
  );
}
