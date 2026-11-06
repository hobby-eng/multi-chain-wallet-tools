import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeHeirSheets, type HeirSheetFacts } from "@ckd/recovery-backup/mnemocode-heirs.js";
import {
  DECODE_WORDS_QUESTION,
  deriverHeirRoute,
  type HeirRouteBuild,
} from "../src/ui/recovery-mnemocode-heir-route.js";

// Synthetic build facts: each edition with the repository whose Releases publish it.
const MULTI_CHAIN: HeirRouteBuild = {
  version: "0.0.0-test",
  edition: "Multi-Chain Edition",
  releaseRepository: "hobby-eng/multi-chain-wallet-tools",
};
const DASH: HeirRouteBuild = {
  version: "0.0.0-test",
  edition: "Dash Community Edition",
  releaseRepository: "hobby-eng/dash-wallet-tools",
};

// Backups that need the program to restore, so that the sheet says where to get it.
const ENCODED: HeirSheetFacts = {
  backup: { kind: "encoded", format: "colors", words: 24 },
  mode: "seedshift",
  dates: 1,
};
const SHARES: HeirSheetFacts = {
  backup: { kind: "shares", format: "words", threshold: 2, count: 3 },
  mode: "direct",
  dates: 0,
};
// A phrase on paper that a wallet program takes as it is: no download step.
const ENGLISH_DIRECT: HeirSheetFacts = {
  backup: { kind: "encoded", format: "english", words: 12 },
  mode: "direct",
  dates: 0,
};

beforeAll(async () => {
  await loadMnemoCode();
});

// The sheet's words are MnemoCode's and its PDF draws them in a subset font; the Deriver owns the
// route that the sheet prints.
function routeText(build: HeirRouteBuild, facts: HeirSheetFacts) {
  const route = deriverHeirRoute(build);
  const steps =
    facts.backup.kind === "encoded"
      ? route.decode(facts.mode, facts.backup.words)
      : route.restore(facts.mode === "seedshift" ? "seedshift" : "direct", facts.backup.threshold);
  const text = { subtitle: route.subtitle, steps: [...route.start, ...steps] };
  return { ...text, all: JSON.stringify(text) };
}

describe("MnemoCode heir sheet route through the Deriver", () => {
  for (const [name, facts] of [
    ["an encoded backup", ENCODED],
    ["Shamir shares", SHARES],
  ] as const) {
    it(`sends heirs of ${name} to the Dash release repository from the Dash edition`, () => {
      const text = routeText(DASH, facts);
      expect(text.steps.join("\n")).toContain("find hobby-eng/dash-wallet-tools on GitHub");
      expect(text.steps.join("\n")).toContain("of the Dash Community Edition from its Releases");
      expect(text.subtitle).toContain("Dash Community Edition");
      expect(text.all).not.toContain("multi-chain-wallet-tools");
    });

    it(`sends heirs of ${name} to the Multi-Chain release repository from that edition`, () => {
      const text = routeText(MULTI_CHAIN, facts);
      expect(text.steps.join("\n")).toContain("find hobby-eng/multi-chain-wallet-tools on GitHub");
      expect(text.steps.join("\n")).toContain("of the Multi-Chain Edition from its Releases");
      expect(text.subtitle).toContain("Multi-Chain Edition");
      expect(text.all).not.toContain("dash-wallet-tools");
    });
  }

  it("leaves the place of the dates to MnemoCode", () => {
    const route = deriverHeirRoute(MULTI_CHAIN);
    expect(route.decode("seedshift", 24).join("\n")).toContain("{dates}");
    expect(route.restore("direct", 2).join("\n")).toContain("{dates}");
    expect(route.address).toBe(MULTI_CHAIN.releaseRepository);
  });

  it("is taken by MnemoCode for every kind of backup, in both sizes", () => {
    const sheets = new MnemoCodeHeirSheets(deriverHeirRoute(DASH));
    for (const facts of [ENCODED, SHARES, ENGLISH_DIRECT]) {
      for (const size of ["a5", "a6"] as const) {
        const { fileName, bytes } = sheets.render(facts, size);
        expect(fileName).toBe("mnemocode-heirs.pdf");
        expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
      }
    }
  });

  it("tells heirs the word count, by the question the Decode tab asks", () => {
    const steps = routeText(MULTI_CHAIN, ENCODED).steps.join("\n");
    expect(steps).toContain(`"${DECODE_WORDS_QUESTION}" choose "24 words"`);
    const page = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
    expect(page).toContain(`<label for="mnemocode-decode-words">${DECODE_WORDS_QUESTION}</label>`);
  });
});
