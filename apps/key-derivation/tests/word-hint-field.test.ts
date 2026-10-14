import { describe, expect, it } from "vitest";
import { hintContext, wordsText } from "../src/ui/word-hint-field.js";

// The page's one hint field: what of a typed line a hint is given, and how its words are listed.
// Public BIP39 words only.

describe("the page's word hint field", () => {
  it("gives a hint the word being typed and three words before it, no more", () => {
    const phrase = "abandon ability able about above absent absorb abs";
    expect(hintContext(phrase)).toBe("above absent absorb abs");
    // After white space no word is being typed: the three words before it and the space.
    expect(hintContext("abandon ability able about ")).toBe("ability able about ");
    expect(hintContext("tuna acid; ta")).toBe("tuna acid; ta");
    expect(hintContext("abandon")).toBe("abandon");
    expect(hintContext("")).toBe("");
    // Line breaks separate words too, as between shares.
    expect(hintContext("tuna acid\nkiwi lava ta")).toBe("acid\nkiwi lava ta");
  });

  it("lists at most 24 words and counts the rest", () => {
    expect(wordsText(["able", "about"])).toBe("able about");
    const words = Array.from({ length: 30 }, (_, index) => `word${index}`);
    expect(wordsText(words)).toMatch(/^word0 word1 .* word23 and 6 more$/u);
  });
});
