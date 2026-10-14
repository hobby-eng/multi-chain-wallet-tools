import { describe, expect, it, vi } from "vitest";

// Only the hint texts are tested here; the package's WebAssembly is never compiled.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { hintText } from "../src/ui/recovery-mhfe-word-hints.js";

const completion = { letters: "", wordEnds: false };

describe("MHFE word hints", () => {
  it("says what mhfe says below a line of words", () => {
    expect(hintText({ hint: "nothing", count: 0, words: [], completion }, "bip39")).toBeNull();
    expect(hintText({ hint: "count", count: 1, words: [], completion }, "bip39")).toEqual({
      text: "1 BIP39 word begins with this letter",
      warning: false,
    });
    expect(hintText({ hint: "count", count: 136, words: [], completion }, "bip39")?.text).toBe(
      "136 BIP39 words begin with this letter",
    );
    expect(hintText({ hint: "noWord", count: 0, words: [], completion }, "bip39")).toEqual({
      text: "No BIP39 word begins like this.",
      warning: true,
    });
    const words = ["able", "about", "above"];
    expect(hintText({ hint: "words", count: 3, words, completion }, "bip39")?.text).toBe(
      "able about above",
    );
  });

  it("says nothing of a password that is no word, and counts what it does not show", () => {
    expect(hintText({ hint: "noWord", count: 0, words: [], completion }, "eff")).toBeNull();
    const words = Array.from({ length: 30 }, (_, index) => `word${index}`);
    expect(hintText({ hint: "words", count: 30, words, completion }, "eff")?.text).toMatch(
      /^word0 word1 .* word23 and 6 more$/u,
    );
  });
});
