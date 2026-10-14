import { expect, it } from "vitest";
import { hasUnknownWords } from "../src/ui/chosen-word-fields.js";
import { ENGLISH_BIP39_WORDS } from "@ckd/core/bip39-word-reader.js";
import { chosenWordsRemainingBits } from "@ckd/core/bip39-chosen-words.js";
it("uses the same spelling for field validity and wishes (AUD-026-UI003)", () => {
  for (const [typed, canonical] of [
    ["Zoo", "zoo"],
    [" zoo ", "zoo"],
    ["aban", "abandon"],
  ]) {
    expect(hasUnknownWords(typed!, true)).toBe(false);
    expect(ENGLISH_BIP39_WORDS.word(typed!)).toBe(canonical);
    expect(() =>
      chosenWordsRemainingBits({
        wordCount: 24,
        chosen: [{ word: typed!, position: 1 }],
        neverUse: [],
      }),
    ).not.toThrow();
  }
  for (const typed of ["zoo,", "zoo zoo", "aba", "notaword"]) {
    expect(hasUnknownWords(typed, true)).toBe(true);
    expect(() =>
      chosenWordsRemainingBits({
        wordCount: 24,
        chosen: [{ word: typed, position: 1 }],
        neverUse: [],
      }),
    ).toThrow(/English BIP39 word/u);
  }
  expect(hasUnknownWords("zoo, aban", false)).toBe(false);
});
