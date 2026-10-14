// Re-encoding (owner, 2026-10-13): the seed phrase of a backup that MnemoCode encoded, decoded as
// Decode decodes it, so that Encode encodes it again with other dates, another mode or in another
// form, without the phrase being typed. Its BIP39 checksum is no confirmation: MnemoCode Seedshift
// gives a valid phrase for every date, so a mistyped date would be re-encoded unnoticed. The phrase
// is therefore given out only once it is confirmed: by the person, who recognises it or its
// fingerprint, or by the wallet, which has the address or the fingerprint they named
// (core/wallet-check.ts, as every search takes it). A host shows the phrase, asks how to confirm
// it, and encodes what confirmedPhrase gives as Encode encodes a typed phrase
// (EncodedBackup.encode). The Original Seedshift with a valid last word keeps nothing of the
// original last word, which the person must remember: they give it, and it picks the phrase.
//
// Host-neutral: it imports only other core modules.

import type { EncodedBackup } from "./encoded-backup.js";
import { ownedDates } from "./dates.js";
import { englishTokens } from "./english-words.js";
import { Redacted } from "./redacted.js";
import type { DateShiftDate, DecodedResult } from "./types.js";
import { askWallet, type WalletCheck, type WalletMatch } from "./wallet-check.js";

/**
 * How the phrase was confirmed: by the person, or by the wallet, at the path where it matched,
 * with the warning of its check, such as that a fingerprint is only a filter, which a host shows
 * before it says the phrase is confirmed (AUD-020-SEC001).
 */
export type ReEncodingConfirmation =
  | { readonly by: "person" }
  | {
      readonly by: "wallet";
      readonly path: string | undefined;
      readonly warning: string | undefined;
    };

/**
 * The refusal of a backup that gives several phrases without the last word that picks one: the
 * Original Seedshift with a valid last word.
 */
export const LAST_WORD_NEEDED =
  "This backup was made with the Original Seedshift with a valid last word, which keeps nothing of the original last word: give the last word of the original seed phrase.";
/** The refusal of a last word that no phrase of the backup ends with. */
export const NO_SUCH_LAST_WORD =
  "No seed phrase of this backup ends with that word: check the last word and the dates.";
/** The refusal of codes and dates whose phrase fails its checksum. */
export const CHECKSUM_FAILS =
  "These codes and dates give no seed phrase with a valid checksum: a date or a code is wrong.";
/** The refusal of a phrase asked for before it was confirmed. */
export const NOT_CONFIRMED =
  "The seed phrase of the old backup is not confirmed: it is encoded again only once the person recognised it or the wallet has the address given.";

/**
 * The phrase of an old backup on its way to a new one: decoded, then confirmed, then given out. Its
 * rule is that the phrase leaves it only once confirmed (confirmedPhrase).
 */
export class ReEncoding extends Redacted {
  readonly #result: DecodedResult;
  #confirmation: ReEncodingConfirmation | undefined;
  #confirmedPhrase: string | undefined;

  private constructor(result: DecodedResult) {
    super("ReEncoding");
    // Own every decoded field: a returned view or a caller's date must not change what a wallet
    // checked while its answer was awaited (AUD-021-API002).
    this.#result = Object.freeze({
      recoveredMnemonic: result.recoveredMnemonic,
      recoveredIndexes: Object.freeze([...result.recoveredIndexes]),
      dates: ownedDates(result.dates),
      shifts: Object.freeze([...result.shifts]),
      checksumValid: result.checksumValid,
    });
  }

  /**
   * The phrase that `backup` and its complete `dates` give, as Decode decodes it; refused where it
   * fails its checksum (CHECKSUM_FAILS). A backup that gives several phrases, one for each possible
   * last word (EncodedBackup.givesSeveral), takes the original `lastWord` that picks one, which no
   * other backup takes.
   */
  static of(backup: EncodedBackup, dates: readonly DateShiftDate[], lastWord?: string): ReEncoding {
    if (backup.givesSeveral) return ReEncoding.#withLastWord(backup.candidates(dates), lastWord);
    const result = backup.decode(dates);
    if (!result.checksumValid) throw new Error(CHECKSUM_FAILS);
    return new ReEncoding(result);
  }

  /**
   * The candidate of a backup with a valid last word that ends with `lastWord`, as typed; refused
   * without it (LAST_WORD_NEEDED) or where none ends with it (NO_SUCH_LAST_WORD). Each candidate
   * has a last word of its own, so that at most one ends with it.
   */
  static #withLastWord(
    candidates: readonly DecodedResult[],
    lastWord: string | undefined,
  ): ReEncoding {
    if (lastWord === undefined) throw new Error(LAST_WORD_NEEDED);
    const typed = englishTokens(lastWord);
    const found =
      typed.length === 1
        ? candidates.find(
            (candidate) => englishTokens(candidate.recoveredMnemonic).at(-1) === typed[0],
          )
        : undefined;
    if (found === undefined) throw new Error(NO_SUCH_LAST_WORD);
    return new ReEncoding(found);
  }

  /** The seed phrase, for the host to show before it is confirmed. */
  get phrase(): string {
    return this.#result.recoveredMnemonic;
  }

  /** The owned, immutable decoded result, including its index, date and shift views. */
  get result(): DecodedResult {
    return this.#result;
  }

  /** How it was confirmed; undefined until it is. */
  get confirmation(): ReEncodingConfirmation | undefined {
    return this.#confirmation;
  }

  /**
   * The person says that this is the phrase to encode again: they recognise it or its fingerprint,
   * or they gave no wallet to compare it with on a command line of their own.
   */
  confirmByPerson(): void {
    this.#confirmedPhrase = this.#result.recoveredMnemonic;
    this.#confirmation = Object.freeze({ by: "person" });
  }

  /**
   * Compares the phrase with the wallet that `check` holds, the host's derivation of the address
   * or fingerprint the person named; a match confirms it. The answer is held to the contract of
   * every wallet check (askWallet): only matched === true confirms. A host shows the match's
   * warning, if it has one, before it says that the phrase is confirmed: a fingerprint is only a
   * filter (FINGERPRINT_WARNING).
   */
  async confirmByWallet<M extends WalletMatch>(check: WalletCheck<M>): Promise<M> {
    const phrase = this.#result.recoveredMnemonic;
    const match = await askWallet(check, phrase);
    if (match.matched) {
      this.#confirmedPhrase = phrase;
      this.#confirmation = Object.freeze({
        by: "wallet",
        path: match.path,
        warning: match.warning,
      });
    }
    return match;
  }

  /** The phrase to encode again; refused until it is confirmed (NOT_CONFIRMED). */
  confirmedPhrase(): string {
    if (this.#confirmedPhrase === undefined) throw new Error(NOT_CONFIRMED);
    return this.#confirmedPhrase;
  }
}
