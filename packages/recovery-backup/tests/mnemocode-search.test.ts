import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import { encodeMnemoCode } from "../src/mnemocode.js";
import {
  MnemoCodeSearchSettings,
  MnemoCodeSearches,
  type SearchOutcome,
  type SearchProgress,
} from "../src/mnemocode-search.js";
import { mnclList } from "@ckd/test-support/mncl-list.js";

// Public BIP39 test phrases, MnemoCode's published date example and synthetic passphrases only.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FINGERPRINT = "73c5da0a";
const DATES = "23-09-2026";

let binding: MnemoCodeBinding;
let searches: MnemoCodeSearches;
beforeAll(async () => {
  binding = await loadMnemoCode();
  searches = new MnemoCodeSearches(binding);
});

const progress: SearchProgress[] = [];
const onProgress = (step: SearchProgress): void => {
  progress.push(step);
};

function outcome(result: unknown): SearchOutcome {
  if (typeof result !== "object" || result === null || "question" in result)
    throw new Error("A question came back where a result was expected.");
  return result as SearchOutcome;
}

describe("a forgotten word, searched by MnemoCode in the worker", () => {
  it("finds every candidate of a missing last word, with the word found", () => {
    const result = searches.words(
      { text: PHRASE.replace(/about$/u, "?"), kind: "unknown-words" },
      onProgress,
    );
    expect(result.count).toBe(128);
    expect(result.shown).toHaveLength(128);
    const about = result.shown.find((row) => row.phrase === PHRASE);
    expect(about?.found).toBe("12: about");
    expect(result.list).toBeUndefined();
    expect(progress.at(-1)?.found).toBe(128);
  });

  it("compares with the wallet's fingerprint, and keeps its warning", () => {
    const result = searches.words(
      {
        text: PHRASE.replace(/about$/u, "?"),
        kind: "unknown-words",
        wallet: {
          evidence: { kind: "master-fingerprint", value: FINGERPRINT, network: "mainnet" },
          passphrase: "",
        },
      },
      onProgress,
    );
    expect(result.matched).toBe(1);
    expect(result.shown.filter((row) => row.matched === true).map((row) => row.phrase)).toEqual([
      PHRASE,
    ]);
    // Only the row the wallet matched names where (MnemoCode a2464c3).
    expect(result.shown.filter((row) => row.path !== undefined)).toEqual([
      expect.objectContaining({ phrase: PHRASE, path: "m" }),
    ]);
    expect(result.warning).toMatch(/fingerprint/u);
  });

  it("writes the candidate list protected with a passphrase, which the Scanner opens", () => {
    const result = searches.words(
      {
        text: PHRASE.replace(/about$/u, "?"),
        kind: "unknown-words",
        list: { kind: "passphrase", passphrase: "public list passphrase" },
        listPassphrase: "TREZOR",
      },
      onProgress,
    );
    expect(result.list?.encrypted).toBe(true);
    expect(result.list?.records).toBe(128);
    const plain = binding.decryptWithPassphrase(result.list!.bytes, "public list passphrase");
    using opened = binding.OpenedCandidateList.read(plain);
    expect(opened.count).toBe(128);
    expect(opened.passphrases).toBe("list");
    expect(opened.passphrase(0)).toBe("TREZOR");
  });

  it("lists a legacy last word's replacements, the one that keeps its entropy marked", () => {
    const legacy =
      "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";
    const result = searches.words({ text: legacy, kind: "legacy-replacements" }, onProgress);
    expect(result.count).toBe(128);
    expect(result.shown.filter((row) => row.found.endsWith("preserved"))).toHaveLength(1);
    expect(() =>
      searches.words(
        { text: legacy, kind: "legacy-replacements", list: { kind: "none" } },
        onProgress,
      ),
    ).toThrow(/no candidate list/u);
  });
});

describe("a forgotten digit of a date", () => {
  const codes = () => encodeMnemoCode(PHRASE, "seedshift", "english", DATES).payload;

  it("finds the date with the wallet, and shows the dates found", () => {
    const result = outcome(
      searches.dates(
        {
          codes: codes(),
          format: "english",
          mode: "seedshift",
          dates: "2?-09-2026",
          wallet: {
            evidence: { kind: "master-fingerprint", value: FINGERPRINT, network: "mainnet" },
            passphrase: "",
          },
        },
        onProgress,
      ),
    );
    expect(result.matched).toBe(1);
    const match = result.shown.find((row) => row.matched === true);
    expect(match?.phrase).toBe(PHRASE);
    expect(match?.found).toMatch(/23-09-2026|2026-09-23/u);
  });

  it("asks first where the person allows fewer combinations than the search tries", () => {
    const asked = searches.dates(
      {
        codes: codes(),
        format: "english",
        mode: "seedshift",
        dates: "2?-09-2026",
        maxCandidates: 2,
      },
      onProgress,
    );
    expect(asked).toHaveProperty("question");
    const confirmed = outcome(
      searches.dates(
        {
          codes: codes(),
          format: "english",
          mode: "seedshift",
          dates: "2?-09-2026",
          maxCandidates: 2,
          confirmed: true,
        },
        onProgress,
      ),
    );
    expect(confirmed.count).toBe(10);
  });

  it("caps what is shown without limiting the search", () => {
    const result = outcome(
      searches.dates(
        { codes: codes(), format: "english", mode: "seedshift", dates: "2?-09-2026", maxShown: 3 },
        onProgress,
      ),
    );
    expect(result.shown).toHaveLength(3);
    expect(result.count).toBe(10);
  });

  it("refuses Direct, which has no dates to search", () => {
    expect(() =>
      searches.dates(
        { codes: codes(), format: "english", mode: "direct", dates: "2?-09-2026" },
        onProgress,
      ),
    ).toThrow(/no dates/u);
  });
});

describe("codes marked with ?", () => {
  const marked = () => {
    const words = encodeMnemoCode(PHRASE, "seedshift", "english", DATES).payload.split(" ");
    words[2] = "?";
    return words.join(" ");
  };

  it("finds the one set of codes that gives the wallet, with the place filled in", () => {
    const result = searches.missingCodes(
      {
        text: marked(),
        format: "english",
        mode: "seedshift",
        way: "wallet",
        dates: DATES,
        wallet: {
          evidence: { kind: "master-fingerprint", value: FINGERPRINT, network: "mainnet" },
          passphrase: "",
        },
      },
      onProgress,
    );
    expect(result).toMatchObject({ kind: "found", places: "Code 3" });
    if ("kind" in result && result.kind === "found")
      expect(result.codes).toBe(encodeMnemoCode(PHRASE, "seedshift", "english", DATES).payload);
  });

  it("finds them by the fingerprint that Encode showed, without dates", () => {
    const encoded = encodeMnemoCode(PHRASE, "seedshift", "english", DATES);
    const result = searches.missingCodes(
      {
        text: marked(),
        format: "english",
        mode: "seedshift",
        way: "encoded",
        encodedFingerprint: encoded.encodedFingerprint ?? "",
      },
      onProgress,
    );
    expect(result).toMatchObject({ kind: "found", codes: encoded.payload });
  });
});

describe("typed limits", () => {
  it("reads blank as MnemoCode's own and refuses what is no whole number from 1", () => {
    expect(MnemoCodeSearchSettings.parseCount(" ", "maxShown")).toBeUndefined();
    expect(MnemoCodeSearchSettings.parseCount("25", "maxShown")).toBe(25);
    for (const typed of ["0", "1.5", "-2", "x"])
      expect(() => MnemoCodeSearchSettings.parseCount(typed, "maxShown")).toThrow(RangeError);
  });

  it("writes lists the Scanner reads from MnemoCode's own format", () => {
    using opened = binding.OpenedCandidateList.read(mnclList([{ phrase: PHRASE }]));
    expect(opened.phrase(0)).toBe(PHRASE);
  });
});
