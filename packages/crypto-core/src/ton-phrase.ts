// The words of a TON phrase (ton-mnemonic.ts): 24 words of the English BIP39 list, lowercase and
// single-spaced, without BIP39's checksum.
import { assertValidMnemonic } from "./bip39.js";
import { Bip39Input } from "./bip39-input.js";
import { ENGLISH_BIP39_WORDS } from "./bip39-word-reader.js";
import { passesTonCheck } from "./ton-mnemonic.js";

/** The words of a TON phrase. */
export const TON_WORD_COUNT = 24;

/** What a phrase is to TON: a TON phrase only, both a TON and a BIP39 phrase, BIP39's only, neither. */
export type TonPhraseKind = "ton-only" | "both" | "bip39" | "other";

/**
 * TON's normalized words of `phrase`, lowercase and single-spaced, or null unless it is 24 words of
 * the English BIP39 list.
 */
export function tonWords(phrase: string): string | null {
  // The phrase field's own bound, before the text is split.
  if (phrase.length > Bip39Input.maximumTextUnits) return null;
  const words = phrase.trim().toLowerCase().split(/\s+/u);
  if (words.length !== TON_WORD_COUNT) return null;
  return words.every((word) => ENGLISH_BIP39_WORDS.exactIndex(word) !== undefined)
    ? words.join(" ")
    : null;
}

/** Whether `phrase` is a TON phrase: 24 English BIP39 words whose entropy passes TON's check. */
export function isTonPhrase(phrase: string): boolean {
  const words = tonWords(phrase);
  return words !== null && passesTonCheck(words);
}

/** What `phrase` is to TON. TON's check costs a few milliseconds, only for 24 words of the list. */
export function tonPhraseKind(phrase: string): TonPhraseKind {
  let bip39 = true;
  try {
    assertValidMnemonic(phrase);
  } catch {
    bip39 = false;
  }
  if (!isTonPhrase(phrase)) return bip39 ? "bip39" : "other";
  return bip39 ? "both" : "ton-only";
}
