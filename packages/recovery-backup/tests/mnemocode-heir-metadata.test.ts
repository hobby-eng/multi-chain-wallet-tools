import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { MnemoCodeHeirSheets, type HeirRoute } from "../src/mnemocode-heirs.js";

// A synthetic route through a page; the sheet holds no secret.
const ROUTE: HeirRoute = {
  subtitle: "Made with a public test page.",
  address: "example/public-test",
  start: ["Find example/public-test, download the page, and open it offline."],
  decode: (mode, words) => [
    `Open Decode, choose ${mode} and ${words} words.`,
    "Type the backup{dates}.",
  ],
  restore: (mode, threshold) => [`Open Restore for ${mode}.`, `Type ${threshold} shares{dates}.`],
  dateDigitHelp: "If a digit of a date is unclear, the Forgotten tab tries each.",
};

beforeAll(async () => {
  await loadMnemoCode();
});

const isPdf = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

describe("MnemoCode's sheet for heirs in the Deriver", () => {
  it("draws the sheet of an encoded backup and of shares, in both sizes", () => {
    const sheets = new MnemoCodeHeirSheets(ROUTE);
    for (const size of ["a5", "a6"] as const) {
      const encoded = sheets.render(
        { backup: { kind: "encoded", format: "colors", words: 12 }, mode: "seedshift", dates: 2 },
        size,
      );
      expect(encoded.fileName).toBe("mnemocode-heirs.pdf");
      expect(isPdf(encoded.bytes)).toBe(true);
      const shares = sheets.render(
        {
          backup: { kind: "shares", format: "colors", threshold: 2, count: 3, codes: 10 },
          mode: "direct",
          dates: 0,
        },
        size,
      );
      expect(isPdf(shares.bytes)).toBe(true);
    }
  });

  it("makes no sheet for a backup whose last word was replaced", () => {
    expect(MnemoCodeHeirSheets.supports("seedshift-legacy-valid")).toBe(false);
    expect(MnemoCodeHeirSheets.supports("seedshift-legacy")).toBe(true);
  });
});
