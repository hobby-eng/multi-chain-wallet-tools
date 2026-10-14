import { wordlist } from "@scure/bip39/wordlists/english.js";

/** English BIP39 spelling, including the unique four-letter prefixes MHFE accepts. */
export class Bip39WordReader {
  readonly #indexes = new Map(wordlist.map((word, index) => [word, index]));

  index(raw: string, label = "Word"): number {
    const typed = raw.trim().toLowerCase();
    const exact = this.#indexes.get(typed);
    if (exact !== undefined) return exact;
    // BIP39's English list is unique at four letters; shorter complete words remain valid.
    if (typed.length >= 4 && /^[a-z]+$/u.test(typed)) {
      const matches = wordlist.filter((word) => word.startsWith(typed));
      if (matches.length === 1) return this.#indexes.get(matches[0]!)!;
    }
    throw new Error(`${label} is not an English BIP39 word.`);
  }

  word(raw: string, label = "Word"): string {
    return wordlist[this.index(raw, label)]!;
  }

  accepts(raw: string): boolean {
    try {
      this.index(raw);
      return true;
    } catch {
      return false;
    }
  }
}

export const ENGLISH_BIP39_WORDS = new Bip39WordReader();
