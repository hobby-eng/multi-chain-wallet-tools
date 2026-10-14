// The self-test of the hints below a word being typed (word-hints.ts): the BIP39 cases of mhfe's
// check `word-hints` (src/word_hints/known_answers.rs), so that both programs hint alike, Tab's
// completion, a line of codes in another form that gets no hint, and the Bytewords of a share. A
// host that shows hints adds it to its self-test (SelfTestHost.features).
//
// The words were listed with grep over two other copies of the lists: the published BIP39 English
// list (bitcoin/bips bip-0039/english.txt, SHA-256 187db04a…7fae) and the Bytewords of
// BCR-2020-012, of which only "acid" begins with "ac". A word no list has must give no word, and
// a list out of order is refused.
//
// Host-neutral: it imports only other core modules and the share forms.

import { EncodedForm } from "./encoded-form.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "./self-test-check.js";
import { WordList, type WordHint, type WordHints } from "./word-hints.js";
import { SHARE_WORD_HINTS } from "../sskr/share-input.js";

/** A hint as one line of text, to compare: its kind, then its count, its words or its text. */
function hintText(hint: WordHint): string {
  if (hint.kind === "words") return `words ${hint.words.join(" ")}`;
  if (hint.kind === "nothing") return "nothing";
  return `${hint.kind} ${hint.text}`;
}

/** What `line` typed from `hints` must give, named `name`. */
const CASES: readonly (readonly [WordHints, string, string, string])[] = [
  [WordList.BIP39, "z", "count 4 BIP39 words begin with this letter", "Count of a letter"],
  [
    WordList.BIP39,
    "abandon AB",
    "words abandon ability able about above absent absorb abstract absurd abuse",
    "Words of two letters",
  ],
  [WordList.BIP39, "xq", "no-word No BIP39 word begins like this.", "No word"],
  // A whole word that begins longer ones: the search must start at the word itself.
  [WordList.BIP39, "art", "words art artefact artist artwork", "Word that begins others"],
  [WordList.BIP39, "toolongforanyword", "no-word No BIP39 word begins like this.", "Long word"],
  [WordList.BIP39, "abandon ?", "nothing", "Mark"],
  // English codes are hinted, Unicode codes are not, nor a code of letters only.
  [EncodedForm.typedWords, "abandon zo", "words zone zoo", "English codes"],
  [EncodedForm.typedWords, "7684 5728 CA", "nothing", "Unicode codes"],
  [SHARE_WORD_HINTS, "tuna acid; ta", "words taco task taxi", "Bytewords of a share"],
  [SHARE_WORD_HINTS, "q", "count 2 Bytewords begin with this letter", "Count of Bytewords"],
  // Bytewords run together are read four letters at a time, the last begun one being typed.
  [SHARE_WORD_HINTS, "tuna acid tunaac", "words acid", "Bytewords run together"],
  [SHARE_WORD_HINTS, "#1A2B3C AB", "nothing", "Share in colors"],
];

/** The quick known answers: every case, Tab's completion, and a list out of order refused. */
function checkWordHints(): void {
  for (const [hints, line, expected, name] of CASES)
    expectSame(hintText(hints.hint(line)), expected, name);
  const completion = (line: string): string => {
    const { letters, wordEnds } = WordList.BIP39.completion(line);
    return `${letters} ${wordEnds}`;
  };
  expectSame(completion("ABOU"), "t true", "Completion of a word");
  expectSame(completion("artw"), "ork true", "Completion of letters");
  expectSame(completion("abs"), " false", "Completion of words that differ");
  expectRefused(
    () => new WordList({ one: "word", many: "words" }, ["zoo", "abandon"]),
    /alphabetical order/u,
    "List out of order",
  );
}

/** The checks of the hints, for a host that shows them. */
export const WORD_HINTS_SELF_TEST: SelfTestFeature = selfTestFeature({
  name: "Word hints",
  detail: "BIP39 words and Bytewords below a word typed, Tab completion, codes without hints",
  startup: checkWordHints,
  run: checkWordHints,
});
