import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import {
  cardTemplates,
  MnemoCodeCardExporter,
  mnemoCodeCardOutput,
  mnemoCodeCardSavedNote,
  mnemoCodeCardTexts,
  mnemoCodeFormatHasCards,
  mnemoCodeShareCardLayout,
  shareFormatHasCards,
} from "../src/mnemocode-cards.js";
import { splitShares } from "../src/mnemocode-shares.js";

// Public BIP39 test phrase and MnemoCode's published date example only.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DATES = "23-09-2026";

let binding: MnemoCodeBinding;
beforeAll(async () => {
  binding = await loadMnemoCode();
});

const isPdf = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

describe("MnemoCode card export in the Deriver", () => {
  it("lists MnemoCode's designs, those that draw separate cards marked", () => {
    const designs = cardTemplates(binding);
    expect(designs).toHaveLength(13);
    expect(designs.some((design) => design.separateCards)).toBe(true);
    expect(designs.some((design) => !design.separateCards)).toBe(true);
  });

  it("tells sheets from separate cards and which forms print as cards", () => {
    expect(mnemoCodeCardOutput("a6")).toBe("collection");
    expect(mnemoCodeCardOutput("business")).toBe("individual");
    expect(mnemoCodeShareCardLayout("a4", "qr")).toBe("qr");
    expect(mnemoCodeCardTexts("individual")).toEqual(["referenceLabel"]);
    expect(mnemoCodeFormatHasCards("colors")).toBe(true);
    expect(mnemoCodeFormatHasCards("english")).toBe(false);
    expect(shareFormatHasCards("unicode")).toBe(true);
    expect(shareFormatHasCards("ur")).toBe(false);
  });

  it("saves one sheet as a PDF, with its QR code offered too", () => {
    const exporter = new MnemoCodeCardExporter();
    const file = exporter.render({
      mnemonic: PHRASE,
      mode: "seedshift",
      dates: DATES,
      format: "colors",
      template: "business-it",
      pageSize: "a6",
      qr: true,
      fileFormat: "pdf",
    });
    expect(file.fileName).toBe("cards-a6.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(isPdf(file.bytes)).toBe(true);
    expect(file.qrCodes?.[0]?.payload).toMatch(/^#[0-9A-F]{6}( #[0-9A-F]{6})+$/u);
    expect(mnemoCodeCardSavedNote(file)).toMatch(/^Saved cards-a6\.pdf\. Print it at 100% size\./u);
    exporter.forgetDetails();
  });

  it("saves separate cards as numbered PNG images in one ZIP", () => {
    const exporter = new MnemoCodeCardExporter();
    const file = exporter.render({
      mnemonic: PHRASE,
      mode: "direct",
      dates: undefined,
      format: "colors",
      template: "business-it",
      pageSize: "business",
      qr: false,
      fileFormat: "png",
    });
    expect(file.fileName).toBe("cards-business.zip");
    const names = Object.keys(unzipSync(file.bytes));
    // Eight codes, one a card, then at least one decoy.
    expect(names.length).toBeGreaterThan(8);
    expect(names.every((name) => name.endsWith(".png"))).toBe(true);
    exporter.forgetDetails();
  }, 120_000);

  it("shows the same cards, decoys included, in every file of the same backup", () => {
    const exporter = new MnemoCodeCardExporter();
    const request = {
      mnemonic: PHRASE,
      mode: "seedshift" as const,
      dates: DATES,
      format: "colors" as const,
      template: "business-it",
      pageSize: "business",
      qr: false,
    };
    const pdf = unzipSync(exporter.render({ ...request, fileFormat: "pdf" }).bytes);
    const first = unzipSync(exporter.render({ ...request, fileFormat: "png" }).bytes);
    const second = unzipSync(exporter.render({ ...request, fileFormat: "png" }).bytes);
    expect(Object.keys(first)).toEqual(
      Object.keys(pdf).map((name) => name.replace(".pdf", ".png")),
    );
    for (const [name, bytes] of Object.entries(first)) expect(second[name]).toEqual(bytes);
    exporter.forgetDetails();
  }, 120_000);

  it("saves the cards of each share of a split", () => {
    const { records } = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "colors",
    });
    const file = new MnemoCodeCardExporter().renderShares({
      records,
      shareFormat: "colors",
      template: "business-it",
      pageSize: "a6",
      qr: false,
      fileFormat: "pdf",
    });
    expect(file.shares).toBe(true);
    const names = Object.keys(unzipSync(file.bytes));
    expect(names.filter((name) => name.startsWith("share-1/")).length).toBeGreaterThan(0);
    expect(names.filter((name) => name.startsWith("share-3/")).length).toBeGreaterThan(0);
    expect(mnemoCodeCardSavedNote(file)).toMatch(/keep the shares apart/u);
  }, 120_000);

  it("refuses a detail that MnemoCode does not print", () => {
    expect(() =>
      new MnemoCodeCardExporter().render({
        mnemonic: PHRASE,
        mode: "direct",
        dates: undefined,
        format: "colors",
        template: "business-it",
        pageSize: "a6",
        qr: false,
        fileFormat: "pdf",
        profile: { name: "1234" },
      }),
    ).toThrow(/Latin letters/u);
  });
});
