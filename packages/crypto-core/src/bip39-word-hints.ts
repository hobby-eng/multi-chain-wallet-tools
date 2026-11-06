// Hints for a BIP39 word being typed, by the rule that MnemoCode and mhfe share
// (MnemoCode crates/mnemocode/src/forms/hints.rs): from two letters on, the words of the list that
// begin with them; after one letter, how many words do; a warning when none does. Tab completes a
// word as far as the words that begin with it agree. The list is public, so a hint tells nothing
// that a person who sees the screen could not look up.
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** Letters typed before the words that begin with them are listed. */
const LIST_FROM_LETTERS = 2;
const LONGEST = Math.max(...wordlist.map((word) => word.length));

/** What shows below the word being typed. */
export type Bip39WordHint =
  | { readonly kind: "nothing" }
  | { readonly kind: "count"; readonly text: string }
  | { readonly kind: "words"; readonly words: readonly string[] }
  | { readonly kind: "no-word"; readonly text: string };

/** The word being typed at the end of `line`: letters and hyphens after the last space. */
function lastWord(line: string): string | undefined {
  const word = line.split(/\s/u).at(-1) ?? "";
  if (word === "" || !/^[A-Za-z-]+$/u.test(word)) return undefined;
  return word.length <= LONGEST ? word.toLowerCase() : "";
}

function startingWith(letters: string): readonly string[] {
  return letters === "" ? [] : wordlist.filter((word) => word.startsWith(letters));
}

export function bip39WordHint(line: string): Bip39WordHint {
  const typed = lastWord(line);
  if (typed === undefined) return { kind: "nothing" };
  const matches = startingWith(typed);
  if (matches.length === 0) return { kind: "no-word", text: "No BIP39 word begins like this." };
  if (matches.length === 1 && matches[0] === typed) return { kind: "nothing" };
  if (typed.length < LIST_FROM_LETTERS) {
    const begins = matches.length === 1 ? "BIP39 word begins" : "BIP39 words begin";
    return { kind: "count", text: `${matches.length} ${begins} with this letter` };
  }
  return { kind: "words", words: matches };
}

/** What Tab adds to the word being typed, and whether one word is left. */
export function bip39WordCompletion(line: string): {
  readonly letters: string;
  readonly wordEnds: boolean;
} {
  const typed = lastWord(line);
  const matches = typed === undefined ? [] : startingWith(typed);
  const first = matches[0];
  const last = matches.at(-1);
  if (typed === undefined || first === undefined || last === undefined)
    return { letters: "", wordEnds: false };
  // The list is sorted, so the first and the last word share what all of them share.
  let shared = typed.length;
  while (shared < first.length && first[shared] === last[shared]) shared += 1;
  return { letters: first.slice(typed.length, shared), wordEnds: matches.length === 1 };
}
