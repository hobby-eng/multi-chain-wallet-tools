import { describe, expect, it } from "vitest";
import { EncodedForm } from "../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { WordList } from "../../../packages/recovery-mnemocode/source/core/word-hints.js";
import { SHARE_WORD_HINTS } from "../../../packages/recovery-mnemocode/source/sskr/share-input.js";
import { mnemoCodeWordHints } from "../src/ui/recovery-mnemocode-word-hints.js";

// What the page shows below MnemoCode's word fields: MnemoCode's own texts, a warning where no
// word fits, the words listed at most 24 at a time, and Tab's completion. Public BIP39 words only.

describe("MnemoCode word hints in the Deriver", () => {
  const bip39 = mnemoCodeWordHints(WordList.BIP39);

  it("shows MnemoCode's count, its warning and nothing for a whole word", () => {
    expect(bip39("abandon z")).toEqual({
      shown: { text: "4 BIP39 words begin with this letter", warning: false },
      completion: { letters: "", wordEnds: false },
    });
    expect(bip39("xq")).toMatchObject({
      shown: { text: "No BIP39 word begins like this.", warning: true },
    });
    // A whole word that begins no longer one: nothing to show, and Tab ends the word.
    expect(bip39("abandon")).toEqual({
      shown: null,
      completion: { letters: "", wordEnds: true },
    });
  });

  it("lists the words from two letters, the first 24 and a count of the rest", () => {
    expect(bip39("art")).toMatchObject({
      shown: { text: "art artefact artist artwork", warning: false },
      completion: { letters: "", wordEnds: false },
    });
    const many = bip39("ca");
    expect(many).toMatchObject({ shown: { warning: false } });
    expect(many).not.toBeInstanceOf(Promise);
    const text = (many as { shown: { text: string } }).shown.text;
    expect(text).toMatch(/^cabbage cabin cable .* and \d+ more$/u);
    expect(text.split(" and ")[0]!.split(" ")).toHaveLength(24);
    expect(bip39("artw")).toMatchObject({ completion: { letters: "ork", wordEnds: true } });
  });

  it("hints English codes and Bytewords, never Unicode codes or colors", () => {
    expect(mnemoCodeWordHints(EncodedForm.typedWords)("abandon zo")).toMatchObject({
      shown: { text: "zone zoo" },
    });
    expect(mnemoCodeWordHints(EncodedForm.typedWords)("7684 5728 CA")).toMatchObject({
      shown: null,
    });
    expect(mnemoCodeWordHints(SHARE_WORD_HINTS)("tuna acid; ta")).toMatchObject({
      shown: { text: "taco task taxi" },
    });
    expect(mnemoCodeWordHints(SHARE_WORD_HINTS)("#1A2B3C AB")).toMatchObject({ shown: null });
  });
});
