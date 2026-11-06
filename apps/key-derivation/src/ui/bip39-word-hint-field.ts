// The hints below a field of BIP39 words, by the rule that MnemoCode and mhfe share
// (@ckd/core/bip39-word-hints.ts), shown by the page's one hint field (word-hint-field.ts). It needs
// no MnemoCode, so that the chosen words of Generate & Derive have hints in every build.
import { bip39WordCompletion, bip39WordHint } from "@ckd/core/bip39-word-hints.js";
import { WordHintField, wordsText, type TypedWordHint } from "./word-hint-field.js";

/** The hint and Tab completion of the BIP39 word at the end of `typed`. */
export function bip39TypedHint(typed: string): TypedWordHint {
  const hint = bip39WordHint(typed);
  return {
    shown:
      hint.kind === "nothing"
        ? null
        : hint.kind === "words"
          ? { text: wordsText(hint.words), warning: false }
          : { text: hint.text, warning: hint.kind === "no-word" },
    completion: bip39WordCompletion(typed),
  };
}

/** Shows the BIP39 word hints below `field`. */
export function attachBip39WordHints(field: HTMLInputElement | HTMLTextAreaElement): void {
  WordHintField.attach(field, bip39TypedHint);
}
