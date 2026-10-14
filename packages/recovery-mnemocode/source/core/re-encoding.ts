// Re-encoding (owner, 2026-10-13): the seed phrase of a backup that MnemoCode encoded, decoded as
// Decode decodes it, so that Encode encodes it again with other dates, another mode or in another
// form, without the phrase being typed. Its BIP39 checksum is no confirmation: MnemoCode Seedshift
// gives a valid phrase for every date, so a mistyped date would be re-encoded unnoticed. The phrase
// is therefore shown first and handed over for encoding only once it is confirmed: by the person,
// who recognises it or its fingerprint, or by the wallet, which has the address or the key they
// named. A wallet that has the fingerprint they named only accepts it, since a fingerprint is a
// filter (core/wallet-check.ts, as every search takes it). A host shows the phrase, asks how to
// confirm it, and encodes what confirmedPhrase gives as Encode encodes a typed phrase
// (EncodedBackup.encode). The Original Seedshift with a valid last word keeps nothing of the
// original last word, which the person must remember: they give it, and it picks the phrase.
//
// Host-neutral: it imports only other core modules.

import type { EncodedBackup } from "./encoded-backup.js";
import { ownedDates } from "./dates.js";
import { englishTokens } from "./english-words.js";
import { Redacted } from "./redacted.js";
import type { DateShiftDate, DecodedResult } from "./types.js";
import {
  askWallet,
  isMasterKeyPath,
  type MatchedBy,
  type WalletCheck,
  type WalletMatch,
} from "./wallet-check.js";
import { capitalized } from "./prose.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.re-encoding", {
  "last-word-not-taken": () => LAST_WORD_NOT_TAKEN,
  "checksum-fails": () => CHECKSUM_FAILS,
  "last-word-needed": () => LAST_WORD_NEEDED,
  "no-such-last-word": () => NO_SUCH_LAST_WORD,
  "not-confirmed": () => NOT_CONFIRMED,
});

// What confirmationLine takes, for a host that names it; wallet evidence names it for each of its
// kinds (EVIDENCE_MATCHED_BY).
export type { MatchedBy };

/**
 * How the phrase was confirmed: by the person, or by the wallet, at the path where it matched,
 * with the warning of its check, such as that a fingerprint is only a filter, which a host shows
 * before it says the phrase is accepted, not proven (AUD-020-SEC001).
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
/** The refusal of a last word given for a backup that gives one phrase, which takes none. */
export const LAST_WORD_NOT_TAKEN =
  "This backup gives one seed phrase and takes no last word: the last word is only for a backup of the Original Seedshift with a valid last word.";
/** The refusal of a last word that no phrase of the backup ends with. */
export const NO_SUCH_LAST_WORD =
  "No seed phrase of this backup ends with that word: check the last word and the dates.";
/** The refusal of codes and dates whose phrase fails its checksum. */
export const CHECKSUM_FAILS =
  "These codes and dates give no seed phrase with a valid checksum: a date or a code is wrong.";
/**
 * What every host says of re-encoding, in one wording (AUD-022-ARC001): the person's confirmation,
 * a wallet that does not match, and the reminder once the new backup is made.
 */
export const RE_ENCODING_WORDS = Object.freeze({
  recognised: "You recognised the seed phrase: it is confirmed.",
  notMatched: "The wallet of this seed phrase does not match: it is not confirmed.",
  oldBackupStillOpens:
    "The old backup still restores the same wallet: destroy it if the new one replaces it.",
});

/** The refusal of a phrase asked for before it was confirmed. */
export const NOT_CONFIRMED =
  "The seed phrase of the old backup is not confirmed: it is encoded again only once the person recognised it or the wallet has the address given.";

/**
 * The phrase of an old backup on its way to a new one: decoded, then confirmed, then handed over
 * for encoding. Its rule is that confirmedPhrase gives the phrase for encoding only once it is
 * confirmed; `phrase` and `result` give it before, for the host to show.
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
   * other backup takes (LAST_WORD_NOT_TAKEN), so that a mistaken mode is said, not ignored.
   */
  static of(backup: EncodedBackup, dates: readonly DateShiftDate[], lastWord?: string): ReEncoding {
    if (backup.givesSeveral) return ReEncoding.#withLastWord(backup.candidates(dates), lastWord);
    if (lastWord !== undefined) throw ERRORS.create("last-word-not-taken", []);
    const result = backup.decode(dates);
    if (!result.checksumValid) throw ERRORS.create("checksum-fails", []);
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
    if (lastWord === undefined) throw ERRORS.create("last-word-needed", []);
    const typed = englishTokens(lastWord);
    const found =
      typed.length === 1
        ? candidates.find(
            (candidate) => englishTokens(candidate.recoveredMnemonic).at(-1) === typed[0],
          )
        : undefined;
    if (found === undefined) throw ERRORS.create("no-such-last-word", []);
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
   * warning, if it has one, before confirmationLine: a fingerprint is only a filter
   * (FINGERPRINT_WARNING), so that its match only accepts the phrase.
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

  /**
   * The line that says how the phrase was confirmed, `by` naming what the host compared it with:
   * the person's recognition; a match whose check gave a warning, such as a fingerprint's, only as
   * accepted, not proven (AUD-020-SEC001); otherwise where the wallet matched. Refused until it is
   * confirmed (NOT_CONFIRMED).
   */
  confirmationLine(by: MatchedBy): string {
    const confirmation = this.#confirmation;
    if (confirmation === undefined) throw ERRORS.create("not-confirmed", []);
    if (confirmation.by === "person") return RE_ENCODING_WORDS.recognised;
    if (confirmation.warning !== undefined)
      return `The ${by} matches: the seed phrase is accepted, not proven.`;
    if (confirmation.path === undefined || isMasterKeyPath(confirmation.path))
      return "The wallet matches: the seed phrase is confirmed.";
    return `${capitalized(by)} found at ${confirmation.path}: the wallet matches, the seed phrase is confirmed.`;
  }

  /** The phrase to encode again; refused until it is confirmed (NOT_CONFIRMED). */
  confirmedPhrase(): string {
    if (this.#confirmedPhrase === undefined) throw ERRORS.create("not-confirmed", []);
    return this.#confirmedPhrase;
  }
}
