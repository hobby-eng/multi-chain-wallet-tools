// Independent BIP39 admission for the complete-list counterexample; no seed derivation or KDF.
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { expect, it } from "vitest";
import { recoverLegacyValidLastWords } from "../../../packages/recovery-mnemocode/source/core/words.ts";

it("independently validates all 128 distinct public completions used by the list probe", () => {
  const prefix = "abandon ".repeat(11);
  const endings = recoverLegacyValidLastWords(prefix + "about").map((row) => row.word);
  expect(new Set(endings).size).toBe(128);
  expect(endings.every((word) => validateMnemonic(prefix + word, wordlist))).toBe(true);
  expect(validateMnemonic(prefix + "abandon", wordlist)).toBe(false);
});
