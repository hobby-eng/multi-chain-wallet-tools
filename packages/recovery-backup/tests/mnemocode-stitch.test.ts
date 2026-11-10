import { wordlist } from "@scure/bip39/wordlists/english.js";
import { beforeAll, describe, expect, it } from "vitest";
import { flatPicture, smoothPicture } from "@ckd/test-support/synthetic-picture.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import { decodeMnemoCode } from "../src/mnemocode.js";
import {
  asksForAnotherPicture,
  correctedRowWarning,
  isStitchLegendRefusal,
  makeStitchPattern,
  readStitchLegendLine,
  readStitchPdfLegend,
  STITCH_FABRICS,
  STITCHES_ACROSS,
  StitchSizeOffer,
  stitchFabricNote,
} from "../src/mnemocode-stitch.js";

// MnemoCode's published SeedStitch example, a public BIP39 test phrase, MnemoCode's published
// date example and synthetic pictures only.
const LEGEND =
  "28:1725 25:2163 57:3275 34:3917 9:480 54:1505 17:5063 63:372 46:328 7:2818 62:1114 53:1997 " +
  "37:2496 40:1945 3:882 58:7130 41:180 59:336 22:1634 36:778 64:1147 10:3804 24:1214 69:479 " +
  "56:931 30:2066 23:3224 29:797";
const LEGEND_PHRASE =
  "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing " +
  "screen patrol group space point ten exist slush involve unfold";
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DATES = "23-09-2026";

let binding: MnemoCodeBinding;
beforeAll(async () => {
  binding = await loadMnemoCode();
});

/** `legend` with the stitches of row `row` (from 1) changed by one. */
function mistyped(legend: string, row: number): string {
  const rows = legend.split(" ");
  const [symbol, stitches] = rows[row - 1]!.split(":");
  rows[row - 1] = `${symbol}:${Number(stitches) + 1}`;
  return rows.join(" ");
}

describe("a SeedStitch legend line read back", () => {
  it("gives the record of the masked phrase, word numbers counted from 1", () => {
    const reading = readStitchLegendLine(LEGEND);
    expect(reading).toEqual({
      record: `MNC1:seedshift:indexes:${LEGEND_PHRASE.split(" ")
        .map((word) => wordlist.indexOf(word) + 1)
        .join(" ")}`,
      correctedRow: undefined,
    });
  });

  it("corrects one mistyped row and names it", () => {
    const reading = readStitchLegendLine(mistyped(LEGEND, 1));
    expect(reading?.correctedRow).toBe(1);
    expect(reading?.record).toBe(readStitchLegendLine(LEGEND)?.record);
    expect(correctedRowWarning(1)).toBe(
      "Row 1 of the legend did not fit; it was read as the only change of it that gives a phrase. Check that row on the paper.",
    );
  });

  it("is no legend line for codes or a record", () => {
    expect(readStitchLegendLine("1 2 3")).toBeUndefined();
    expect(readStitchLegendLine("MNC1:seedshift:indexes:1 2 3")).toBeUndefined();
    expect(readStitchLegendLine(PHRASE)).toBeUndefined();
  });

  it("refuses a legend line that reads as no phrase, with MnemoCode's code", () => {
    const partial = LEGEND.split(" ").slice(0, 20).join(" ");
    let refusal: unknown;
    try {
      readStitchLegendLine(partial);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toMatchObject({ code: "embroidery.phrase.legend-not-read" });
    expect(isStitchLegendRefusal(refusal)).toBe(true);
    expect(isStitchLegendRefusal(new Error("synthetic"))).toBe(false);
  });

  it("bounds the text before MnemoCode reads it", () => {
    expect(() => readStitchLegendLine("1:2 ".repeat(20_000))).toThrow(
      expect.objectContaining({ code: "wallet.mnemocode-input.too-large" }),
    );
  });
});

describe("a cross-stitch pattern made by MnemoCode", () => {
  it("hides the masked phrase in a legend that Decode reads back with the dates", () => {
    const pattern = makeStitchPattern(binding, {
      phrase: PHRASE,
      dates: DATES,
      picture: smoothPicture(),
      stitchesAcross: 0,
      mode: "seedshift",
      fabric: "14",
    });
    expect(pattern.width).toBe(STITCHES_ACROSS.default);
    expect(pattern.height).toBe(150);
    expect(pattern.rows).toBe(pattern.legend.split(" ").length);
    expect(pattern.moved).toBeGreaterThanOrEqual(0);
    expect(pattern.seenDifference).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pattern.pdf.subarray(0, 5))).toBe("%PDF-");
    const reading = readStitchLegendLine(pattern.legend);
    expect(reading?.correctedRow).toBeUndefined();
    const decoded = decodeMnemoCode(reading?.record ?? "", {
      mode: "direct",
      format: "auto",
      dates: DATES,
    });
    expect(decoded).toMatchObject({ mode: "seedshift", format: "indexes", mnemonic: PHRASE });
    // The key page of the PDF keeps the legend line, which MnemoCode reads back.
    expect(readStitchPdfLegend(pattern.pdf)).toEqual(reading);
    expect(readStitchPdfLegend(new TextEncoder().encode("%PDF-1.7\n%%EOF\n"))).toBeUndefined();
  }, 60_000);

  it("holds the phrase itself with Direct, on the fabric chosen", () => {
    const pattern = makeStitchPattern(binding, {
      phrase: PHRASE,
      dates: "",
      picture: smoothPicture(),
      stitchesAcross: 0,
      mode: "direct",
      fabric: "linen-28",
    });
    const reading = readStitchPdfLegend(pattern.pdf);
    expect(reading?.record).toMatch(/^MNC1:direct:indexes:/u);
    const decoded = decodeMnemoCode(reading?.record ?? "", { mode: "direct", format: "auto" });
    expect(decoded).toMatchObject({ mode: "direct", mnemonic: PHRASE });
  }, 60_000);

  it("offers the sheets that hold the picture on a fabric, and the widths typed", () => {
    using sizes = new StitchSizeOffer(smoothPicture(), "14");
    expect(sizes.sheets.length).toBeGreaterThan(0);
    for (const sheet of sizes.sheets) {
      expect(sheet.label).toMatch(/^A[2-6], \d+(\.\d)? x \d+(\.\d)? cm$/u);
      expect(sheet.note).toMatch(/^\d+ x \d+ stitches, \d+\.\d x \d+\.\d cm$/u);
    }
    expect(sizes.first).toBeDefined();
    expect(sizes.detailNote).toMatch(/looks real from about \d+ across\.$/u);
    expect(sizes.stitchRange).toMatch(/^\d+ to \d+$/u);
    expect(sizes.typedStitches("200")).toBe(200);
    expect(sizes.typedStitches("20.5")).toBeUndefined();
    expect(sizes.typedStitches("9999")).toBeUndefined();
    expect(sizes.typedCentimetres("21,0")).toBe(sizes.typedCentimetres("21"));
    expect(sizes.typedCentimetres("21 cm")).toBeUndefined();
    expect(STITCH_FABRICS.map((fabric) => stitchFabricNote(fabric))[0]).toBe(
      "5.5 stitches a centimetre, the most usual",
    );
  });

  it("asks for another picture where the picture cannot hold the phrase", () => {
    const refusal = (picture: Uint8Array, stitchesAcross = 0, dates = DATES): unknown => {
      try {
        makeStitchPattern(binding, {
          phrase: PHRASE,
          dates,
          picture,
          stitchesAcross,
          mode: "seedshift",
          fabric: "14",
        });
      } catch (cause) {
        return cause;
      }
      throw new Error("The pattern was made.");
    };
    const notAPicture = refusal(new Uint8Array([1, 2, 3]));
    expect(notAPicture).toMatchObject({ code: "embroidery.picture.not-a-picture" });
    expect(asksForAnotherPicture(notAPicture)).toBe(true);
    const flat = refusal(flatPicture());
    expect(asksForAnotherPicture(flat)).toBe(true);
    const narrow = refusal(smoothPicture(), 450);
    expect(narrow).toMatchObject({ code: "embroidery.picture.narrower-than-pattern" });
    expect(asksForAnotherPicture(narrow)).toBe(true);
    // A width out of range or missing dates is no matter of the picture.
    const width = refusal(smoothPicture(), STITCHES_ACROSS.min - 1);
    expect(width).toMatchObject({ code: "embroidery.picture.width-out-of-range" });
    expect(asksForAnotherPicture(width)).toBe(false);
    expect(asksForAnotherPicture(refusal(smoothPicture(), 0, ""))).toBe(false);
  }, 60_000);
});
