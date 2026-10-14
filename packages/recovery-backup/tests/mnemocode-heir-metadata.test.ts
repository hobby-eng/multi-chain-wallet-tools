import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeirRoute } from "../src/mnemocode-heirs.js";
import type { renderHeirSheet } from "../../recovery-mnemocode/source/export/heir-sheet.js";

const fixture = vi.hoisted(() => ({
  draw: vi.fn<typeof renderHeirSheet>(),
}));

// Only the PDF step is replaced. Metadata, capability refusals and the complete instructions
// still come from the actual shared classes and the browser adapter.
vi.mock("../../recovery-mnemocode/source/export/heir-sheet.js", async (importOriginal) => {
  const shared =
    await importOriginal<typeof import("../../recovery-mnemocode/source/export/heir-sheet.js")>();
  return { ...shared, renderHeirSheet: fixture.draw };
});

import { MnemoCodeHeirSheets } from "../src/mnemocode-heirs.js";
import { ownShareCards } from "../src/mnemocode-share-cards.js";
import * as sharedMetadata from "../../recovery-mnemocode/source/export/sskr-render.js";
import {
  ownShareCards as noShareCards,
  Share as NoShare,
} from "../src/mnemocode-share-render-none.js";
import { sskrSetVector, sskrVector } from "../../recovery-mnemocode/source/sskr/known-answers.js";
import { A5, A6, HEIR_SHEET_FILE } from "../../recovery-mnemocode/source/export/heir-sheet.js";

const route: HeirRoute = {
  subtitle: "Public fixture",
  address: "",
  start: ["Open the offline test page."],
  decode: () => ["Read the encoded backup."],
  restore: () => ["Read the shares."],
  dateDigitHelp: undefined,
};
const readAsset = vi.fn(() => {
  throw new Error("Metadata must not access fonts or artwork.");
});

beforeEach(() => {
  fixture.draw.mockReset();
  fixture.draw.mockResolvedValue(Uint8Array.of(1));
  readAsset.mockClear();
  vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
    throw new Error("Metadata must not request host randomness.");
  });
  vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Metadata must not request fallback randomness.");
  });
  vi.spyOn(PDFDocument, "create").mockImplementation(() => {
    throw new Error("This fixture must not create a PDF.");
  });
  vi.spyOn(PDFDocument, "load").mockImplementation(() => {
    throw new Error("This fixture must not load a PDF.");
  });
});

afterEach(() => vi.restoreAllMocks());

describe("P53 shared heir share-code metadata with a passive PDF step", () => {
  // Exact counts come from the public transport fixtures, before any card decoys: colors and
  // Color Unicode use the ten published RGB units; Unicode uses the 21 published word codes.
  const formats = [
    ["colors", sskrVector.firstShareColors.length],
    ["colors-unicode", sskrVector.firstShareColors.length],
    ["unicode", sskrVector.firstShareUnicode.split(" ").length],
  ] as const;

  it.each(formats)(
    "delegates %s own-code counts and supplies the real heir wording",
    async (format, expected) => {
      expect(ownShareCards).toBe(sharedMetadata.ownShareCards);
      const codes = ownShareCards(sskrSetVector.shares[0], format);
      expect(codes).toBe(expected);
      const file = await new MnemoCodeHeirSheets(route, readAsset).render(
        {
          backup: {
            kind: "shares",
            format,
            threshold: 2,
            count: 3,
            ...(codes === undefined ? {} : { codes }),
          },
          mode: "direct",
          dates: 0,
        },
        "a5",
      );
      expect(fixture.draw).toHaveBeenCalledTimes(1);
      const [, text, size] = fixture.draw.mock.calls[0]!;
      expect(size).toBe(A5);
      expect(text.needs).toContain(
        `On printed cards each share is the first ${expected} codes; the cards after them belong to nothing.`,
      );
      expect(text.needs).toContain("No secret dates are needed.");
      expect(JSON.stringify(text)).not.toContain(sskrSetVector.shares[0]);
      expect(JSON.stringify(text)).not.toContain(sskrSetVector.phrase);
      expect(file.fileName).toBe(HEIR_SHEET_FILE);
      expect(readAsset).not.toHaveBeenCalled();
      expect(crypto.getRandomValues).not.toHaveBeenCalled();
      expect(Math.random).not.toHaveBeenCalled();
      expect(PDFDocument.create).not.toHaveBeenCalled();
      expect(PDFDocument.load).not.toHaveBeenCalled();
      file.bytes.fill(0);
    },
  );

  it.each(["ur", "words", "indexes"] as const)(
    "keeps %s instructions free of card-code metadata",
    async (format) => {
      expect(ownShareCards(sskrSetVector.shares[0], format)).toBeUndefined();
      const file = await new MnemoCodeHeirSheets(route, readAsset).render(
        {
          backup: { kind: "shares", format, threshold: 2, count: 3 },
          mode: "direct",
          dates: 0,
        },
        "a6",
      );
      const [, text, size] = fixture.draw.mock.calls[0]!;
      expect(size).toBe(A6);
      expect(text.needs.some((line) => line.includes("On printed cards"))).toBe(false);
      expect(readAsset).not.toHaveBeenCalled();
      file.bytes.fill(0);
    },
  );

  it("retains shared refusal of lossy or legacy share-sheet modes before PDF access", async () => {
    for (const mode of ["seedshift-legacy", "seedshift-legacy-valid"] as const)
      await expect(
        new MnemoCodeHeirSheets(route, readAsset).render(
          {
            backup: { kind: "shares", format: "colors", threshold: 2, count: 3, codes: 10 },
            // A JavaScript caller can supply a mode excluded by the TypeScript contract.
            mode: mode as Parameters<MnemoCodeHeirSheets["render"]>[0]["mode"],
            dates: 1,
          },
          "a5",
        ),
      ).rejects.toThrow();
    expect(fixture.draw).not.toHaveBeenCalled();
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("keeps the no-SSKR substitute closed instead of importing real share metadata", () => {
    expect(() => noShareCards("public-unused-share", "colors")).toThrow(
      "Share cards need the SSKR library",
    );
    expect(() => NoShare.read()).toThrow("Share cards need the SSKR library");
    expect(fixture.draw).not.toHaveBeenCalled();
    expect(readAsset).not.toHaveBeenCalled();
  });
});
