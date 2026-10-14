// The English BIP39 words alone, without the Traditional Chinese list: typed words read as BIP39
// compares them, the words and the phrase of indexes, and the checksum of a phrase. Every module
// that reads or writes English words takes them here, the share modules too, which need no other
// list (core/words.ts adds the Unicode codes and re-exports these). Only two self-tests
// (core/self-test.ts, which hashes the list, and sskr/share-unmasking-self-test.ts) import it from
// the package, so that their checks stay independent of this module.
//
// Host-neutral: it imports only @scure/bip39, its English word list and the sizes of BIP39.

import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { entropyBytes, type Bip39WordCount } from "./bip39-sizes.js";
import { defined } from "./defined.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.english-words", {
  "word-not-english-bip39-list": () => "A word is not in the English BIP39 list.",
});

export { englishWordlist };

/** The index of each English word, counted from 0. */
export const ENGLISH_INDEX: ReadonlyMap<string, number> = new Map(
  englishWordlist.map((word, index) => [word, index]),
);

/**
 * The words of typed English text, as BIP39 compares them: NFKD, lower case, split at white space.
 * Complete phrases, phrases with ? and the word search all read their words through it; the BIP39
 * seed keeps the passphrase's own spacing and case and does not.
 */
export function englishTokens(text: string): string[] {
  return text.normalize("NFKD").toLowerCase().split(/\s+/u).filter(Boolean);
}

/**
 * The public phrase of `wordCount` words with all-zero entropy, "abandon … about" for 12 words:
 * the sample, probe and help phrase of the library and the command line. The self-tests keep
 * their own literal, so that they stay independent of this.
 */
export function zeroEntropyPhrase(wordCount: Bip39WordCount): string {
  return entropyToMnemonic(new Uint8Array(entropyBytes(wordCount)), englishWordlist);
}

/**
 * The fingerprint of `phrase` by the host's `fingerprintOf`, or undefined when it is no valid BIP39
 * phrase: the codes of an encoded seed phrase and the phrase of a share set are fingerprinted
 * only then. `fingerprintOf` may answer at once or with a promise, which is handed back.
 */
export function fingerprintOfValidPhrase<T>(
  phrase: string,
  fingerprintOf: (mnemonic: string) => T,
): T | undefined {
  return phraseChecksumValid(phrase) ? fingerprintOf(phrase) : undefined;
}

/** The English words of BIP39 indexes, counted from 0. */
export function wordsOfIndexes(indexes: readonly number[]): string[] {
  return indexes.map((index) => defined(englishWordlist[index]));
}

/** The BIP39 indexes, counted from 0, of English words; refuses a word that is not in the list. */
export function indexesOfWords(words: readonly string[]): number[] {
  return words.map((word) => {
    const index = ENGLISH_INDEX.get(word);
    if (index === undefined) throw ERRORS.create("word-not-english-bip39-list", []);
    return index;
  });
}

/** The English phrase of BIP39 indexes, its words joined by spaces. */
export function phraseOfIndexes(indexes: readonly number[]): string {
  return wordsOfIndexes(indexes).join(" ");
}

/** Whether `phrase`, English words joined by single spaces, passes its BIP39 checksum. */
export function phraseChecksumValid(phrase: string): boolean {
  return validateMnemonic(phrase, englishWordlist);
}
