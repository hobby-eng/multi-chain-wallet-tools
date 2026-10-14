// MHFE's hints below the word fields of its panel, by mhfe's rule (MhfeWallet.wordHints for lines
// of BIP39 words, MhfePasswords.wordHints for passwords and the EFF list), in the words of mhfe's
// command-line tool (src/bin/mhfe/typed_line.rs), shown by the page's one hint field
// (word-hint-field.ts). Tab completes the word in a line of BIP39 words; in a password it moves on,
// as everywhere in a page. A field names its list in its markup (data-word-list, "bip39" or "eff").
import type { MhfeWordHint } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { WordHintField, wordsText, type WordHintSource } from "./word-hint-field.js";

export type MhfeWordList = "bip39" | "eff";

/** What each list is called in a hint, as mhfe names it (word_hints::WordList::name). */
const LIST_NAMES: Readonly<Record<MhfeWordList, string>> = { bip39: "BIP39", eff: "EFF" };

/** The hint for `hint` in mhfe's words, or null for none. */
export function hintText(
  hint: MhfeWordHint,
  list: MhfeWordList,
): { readonly text: string; readonly warning: boolean } | null {
  const name = LIST_NAMES[list];
  switch (hint.hint) {
    case "nothing":
      return null;
    // A password may hold any text, so only a line of BIP39 words says that no word fits.
    case "noWord":
      return list === "bip39" ? { text: `No ${name} word begins like this.`, warning: true } : null;
    case "count":
      return {
        text:
          hint.count === 1
            ? `1 ${name} word begins with this letter`
            : `${hint.count} ${name} words begin with this letter`,
        warning: false,
      };
    case "words":
      return { text: wordsText(hint.words), warning: false };
  }
}

/** The hints of `list` from MHFE's engine; each answer comes from a worker. */
export function mhfeWordHints(engine: MhfeEngine, list: MhfeWordList): WordHintSource {
  return async (typed) => {
    const hint =
      list === "bip39"
        ? await (await engine.wallet()).wordHints({ typed })
        : await (await engine.passwords()).wordHints({ typed });
    return {
      shown: hintText(hint, list),
      ...(list === "bip39" ? { completion: hint.completion } : {}),
    };
  };
}

/** Hints for every field under `root` that names its list. */
export function installMhfeWordHints(engine: MhfeEngine, root: ParentNode): void {
  for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "[data-word-list]",
  )) {
    const list = field.dataset["wordList"];
    if (list === "bip39" || list === "eff")
      WordHintField.attach(field, mhfeWordHints(engine, list));
  }
}
