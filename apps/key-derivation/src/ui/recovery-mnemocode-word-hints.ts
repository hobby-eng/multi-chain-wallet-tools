// The hints below word fields, shown by the page's one hint field (word-hint-field.ts) where
// MnemoCode's command line shows them below a typed line: a seed phrase's words by MnemoCode's rule
// (bip39-word-hints.ts, which needs no MnemoCode, so chosen words have hints in every build), and
// codes of any form by MnemoCode itself (wordHint of its WebAssembly): an encoded seed phrase or
// record, and a written backup checked again. Only the list of words is shortened here.
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { bip39TypedHint } from "./bip39-word-hint-field.js";
import {
  WordHintField,
  wordsText,
  type TypedWordHint,
  type WordHintSource,
} from "./word-hint-field.js";

/** Which words a field is typed from: a seed phrase's, or codes of any form. */
export type MnemoCodeHintList = "phrase" | "codes";

/** The page's hints of `list`; Tab completes their words. */
export function mnemoCodeWordHints(list: MnemoCodeHintList): WordHintSource {
  if (list === "phrase") return bip39TypedHint;
  return (typed) => {
    using hint = mnemocode().wordHint(typed, true);
    const said = hint.said;
    const words = hint.words;
    let shown: TypedWordHint["shown"] = null;
    if (words.length > 0) shown = { text: wordsText(words), warning: false };
    // MnemoCode says "No … begins like this." where no word does, and how many do otherwise.
    else if (said !== undefined) shown = { text: said, warning: said.startsWith("No ") };
    return { shown, completion: { letters: hint.letters, wordEnds: hint.wordEnds } };
  };
}

/** Shows the hints of `list` below `field`; a function names the list for each line, or none. */
export function attachMnemoCodeWordHints(
  field: HTMLInputElement | HTMLTextAreaElement,
  list: MnemoCodeHintList | (() => MnemoCodeHintList | undefined),
): void {
  if (typeof list === "string") {
    WordHintField.attach(field, mnemoCodeWordHints(list));
    return;
  }
  WordHintField.attach(field, (typed) => {
    const current = list();
    return current === undefined ? { shown: null } : mnemoCodeWordHints(current)(typed);
  });
}
