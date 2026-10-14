// MnemoCode's hints below its word fields (core/word-hints.ts), shown by the page's one hint field
// (word-hint-field.ts) where MnemoCode's command line shows them below a typed line: the seed
// phrase, the phrase with a forgotten word, a word looked up in the word table, an encoded seed
// phrase or record, a written backup checked again, and shares. MnemoCode makes the texts, so that
// the page says what its terminal says; only the list of words is shortened here, as everywhere.
import type {
  WordHint,
  WordHints,
} from "../../../../packages/recovery-mnemocode/source/core/word-hints.js";
import {
  WordHintField,
  wordsText,
  type TypedWordHint,
  type WordHintSource,
} from "./word-hint-field.js";

/** What the page shows for MnemoCode's `hint`. */
function shownHint(hint: WordHint): TypedWordHint["shown"] {
  switch (hint.kind) {
    case "nothing":
      return null;
    case "count":
      return { text: hint.text, warning: false };
    case "no-word":
      return { text: hint.text, warning: true };
    case "words":
      return { text: wordsText(hint.words), warning: false };
  }
}

/** The page's hints from `hints`, one of MnemoCode's lists or forms; Tab completes their words. */
export function mnemoCodeWordHints(hints: WordHints): WordHintSource {
  return (typed) => ({
    shown: shownHint(hints.hint(typed)),
    completion: hints.completion(typed),
  });
}

/** Shows the hints of `hints` below `field`. */
export function attachMnemoCodeWordHints(
  field: HTMLInputElement | HTMLTextAreaElement,
  hints: WordHints,
): void {
  WordHintField.attach(field, mnemoCodeWordHints(hints));
}
