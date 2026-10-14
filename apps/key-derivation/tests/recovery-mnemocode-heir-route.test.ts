import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HeirInstructions,
  type HeirSheetFacts,
} from "../../../packages/recovery-mnemocode/source/export/heir-sheet-text.js";
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

function sheetText(build: HeirRouteBuild, facts: HeirSheetFacts) {
  const text = new HeirInstructions(deriverHeirRoute(build)).text(facts);
  return { ...text, all: JSON.stringify(text) };
}

describe("MnemoCode heir sheet route through the Deriver", () => {
  for (const [name, facts] of [
    ["an encoded backup", ENCODED],
    ["Shamir shares", SHARES],
  ] as const) {
    it(`sends heirs of ${name} to the Dash release repository from the Dash edition`, () => {
      const text = sheetText(DASH, facts);
      expect(text.steps.join("\n")).toContain("find hobby-eng/dash-wallet-tools on GitHub");
      expect(text.steps.join("\n")).toContain("of the Dash Community Edition from its Releases");
      expect(text.subtitle).toContain("Dash Community Edition");
      expect(text.all).not.toContain("multi-chain-wallet-tools");
    });

    it(`sends heirs of ${name} to the Multi-Chain release repository from that edition`, () => {
      const text = sheetText(MULTI_CHAIN, facts);
      expect(text.steps.join("\n")).toContain("find hobby-eng/multi-chain-wallet-tools on GitHub");
      expect(text.steps.join("\n")).toContain("of the Multi-Chain Edition from its Releases");
      expect(text.subtitle).toContain("Multi-Chain Edition");
      expect(text.all).not.toContain("dash-wallet-tools");
    });
  }

  it("names no repository when the backup needs no program", () => {
    for (const build of [MULTI_CHAIN, DASH]) {
      const steps = sheetText(build, ENGLISH_DIRECT).steps.join("\n");
      expect(steps).not.toContain(MULTI_CHAIN.releaseRepository);
      expect(steps).not.toContain(DASH.releaseRepository);
    }
  });

  it("tells heirs the word count, by the question the Decode tab asks", () => {
    const steps = sheetText(MULTI_CHAIN, ENCODED).steps.join("\n");
    expect(steps).toContain(`"${DECODE_WORDS_QUESTION}" choose "24 words"`);
    const page = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
    expect(page).toContain(`<label for="mnemocode-decode-words">${DECODE_WORDS_QUESTION}</label>`);
  });
});
