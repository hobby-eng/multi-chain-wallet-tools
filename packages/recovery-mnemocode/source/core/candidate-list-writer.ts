// The writing of a candidate list for the Discovery Scanner, as every host writes it: the phrases
// of a search turned into BIP39 entropy in their order, with one BIP39 passphrase for all, the
// list encoded (candidate-list.ts) and protected as the person chose (candidate-encryption.ts),
// and every copy of a secret wiped, also when a phrase fails before the others are made. No list is
// written for no candidate, or for more than one list holds.
//
// Needs from the host: the protection, and the file the bytes go to. Does not: ask for a
// passphrase, read or write a file, or show anything.
//
// Host-neutral: it imports only candidate-list.ts, candidate-encryption.ts, english-words.ts and
// @scure/bip39 (test/portable-modules.test.ts).

import { wipeAll } from "./bits.js";
import { mnemonicToEntropy } from "@scure/bip39";
import type { ListProtection } from "./candidate-encryption.js";
import { assertListPassphrase, candidateListHolds, encodeCandidateList } from "./candidate-list.js";
import { englishWordlist } from "./english-words.js";

/** A candidate list ready to be saved. */
export interface CandidateListFile {
  /**
   * The file's bytes, this list's own copy. Without encryption they hold every candidate's entropy
   * in the open, so the caller wipes them once they are saved, also when the save is skipped or
   * fails.
   */
  readonly bytes: Uint8Array;
  /** How it is protected, in the words of its protection. */
  readonly description: string;
  readonly encrypted: boolean;
  /** The records it holds. */
  readonly records: number;
}

/** What became of a list: written, or why none was. */
export type ListOutcome =
  | { readonly kind: "list"; readonly list: CandidateListFile }
  /** More candidates than one list holds: no list is written. */
  | { readonly kind: "full" }
  /** No candidate went into it: no list is written. */
  | { readonly kind: "empty" };

/** What a host says when a list was asked for but no candidate went into it. */
export const NO_CANDIDATE_TO_SAVE = "No candidate to save, so no list was written.";

/**
 * Writes candidate lists with one protection and one BIP39 passphrase. A class, so that what a
 * list needs is settled when the writer is made, before the search: a BIP39 passphrase that no
 * list can take is refused at once instead of after a long search.
 */
export class CandidateListWriter {
  readonly #protection: ListProtection;
  readonly #passphrase: string;

  /** `passphrase` is the BIP39 passphrase that the list stores for every record; "" stores none. */
  constructor(protection: ListProtection, passphrase = "") {
    // The label says that the limit is the list's: BIP39 itself takes a longer passphrase.
    assertListPassphrase(passphrase, "BIP39 passphrase that the list stores");
    this.#protection = protection;
    this.#passphrase = passphrase;
  }

  /** The list of `entropies`, record N for candidate N; they are this call's and wiped after it. */
  async write(entropies: Uint8Array[]): Promise<ListOutcome> {
    try {
      if (!candidateListHolds(entropies.length)) return { kind: "full" };
      if (entropies.length === 0) return { kind: "empty" };
      return { kind: "list", list: await this.#encode(entropies) };
    } finally {
      wipeAll(entropies);
    }
  }

  /** The list of `phrases`, English BIP39 phrases in their order, as write() makes it. */
  async writePhrases(phrases: readonly string[]): Promise<ListOutcome> {
    // Too many are told before any phrase is turned into entropy.
    if (!candidateListHolds(phrases.length)) return { kind: "full" };
    const entropies: Uint8Array[] = [];
    try {
      for (const phrase of phrases) entropies.push(mnemonicToEntropy(phrase, englishWordlist));
    } catch (error) {
      // A phrase that fails leaves the entropy made before it to be wiped.
      wipeAll(entropies);
      throw error;
    }
    return this.write(entropies);
  }

  async #encode(entropies: readonly Uint8Array[]): Promise<CandidateListFile> {
    const records = entropies.map((entropy) => ({ entropy }));
    // An empty passphrase is stored as none (CandidateList.passphrase).
    const plain = encodeCandidateList({ passphrase: this.#passphrase, records });
    try {
      // A copy: a list without encryption may be the very array that is wiped below.
      const bytes = new Uint8Array(await this.#protection.protect(plain));
      return {
        bytes,
        description: this.#protection.description,
        encrypted: this.#protection.encrypted,
        records: records.length,
      };
    } finally {
      plain.fill(0);
    }
  }
}
