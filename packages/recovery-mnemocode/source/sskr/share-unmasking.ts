// The seed phrases that restored sets of shares give. Shares made without Seedshift hold the seed
// phrase itself; shares of a phrase masked with MnemoCode Seedshift hold the masked phrase, which
// the dates unmask: decoded with whole dates, or searched where a date holds ? for a forgotten
// digit (DateSearch). With a wallet check only the phrases of the wallet are kept, and for a
// candidate list every match. The dates must fit each set's phrase, and the time of a date search
// is told before it runs, for the question or the notice of the host.
//
// Needs from the host: the dates (DatesAnswer, core/date-search.ts), a wallet check
// (core/wallet-check.ts), and for a search the run's progress callback, AbortSignal and turn.
// Does not: restore or repair the shares (ShareSet, JointRepair), ask for the dates or the
// wallet, or show anything.

import {
  DatesAnswer,
  DateSearch,
  type DateSearchRun,
  walletNeeded,
  secondsEach,
} from "../core/date-search.js";
import { EncodedBackup } from "../core/encoded-backup.js";
import { Masking, type SplitMode } from "../core/masking.js";
import { askWallet, type WalletCheck } from "../core/wallet-check.js";
import type { RepairedSet } from "./joint-repair.js";
import type { DateWork } from "./repair-report.js";
import { Redacted } from "../core/redacted.js";
import { BIP39_WORD_COUNTS } from "../core/bip39-sizes.js";

/** The two modes in which shares are made: SSKR splits the entropy of a valid BIP39 phrase. */
export type ShareMode = SplitMode;

/** What a restore of shares is unmasked with. */
export interface UnmaskingOptions {
  readonly mode: ShareMode;
  /** The dates of a Seedshift phrase, which may hold ?; none without Seedshift. */
  readonly dates?: DatesAnswer | undefined;
  /** Compares each phrase with the wallet; without it every phrase is kept. */
  readonly walletCheck?: WalletCheck | undefined;
  /** How many matches of each date search are kept to be shown; MAX_SHOWN_MATCHES by default. */
  readonly maxShown?: number | undefined;
  /** How many matches of each date search are kept for a candidate list; none by default. */
  readonly keep?: number | undefined;
}

/** A seed phrase that a set gives. */
export interface UnmaskedPhrase {
  readonly set: RepairedSet;
  readonly mnemonic: string;
  /** The dates that a date search found for it, DD-MM-YYYY, sorted and joined by spaces. */
  readonly dates?: string | undefined;
  /** Where the wallet matched in a date search, such as m/84'/0'/0'/0/0. */
  readonly matchedAt?: string | undefined;
}

/** What the sets give: the phrases kept, and every one for a list; or why the dates do not fit. */
export type Unmasked =
  | {
      readonly kind: "phrases";
      readonly phrases: readonly UnmaskedPhrase[];
      /** Every phrase for a candidate list, also the matches of a search beyond those shown. */
      readonly listed: readonly string[];
    }
  | { readonly kind: "dates"; readonly message: string };

/**
 * A phrase length for the wallet checks of one date combination: MnemoCode Seedshift gives one
 * valid phrase for every date, whatever the number of words, and the time of a search is told
 * before the shares say how many words their phrase has.
 */
const ANY_WORD_COUNT = BIP39_WORD_COUNTS[0];
/** The longest phrase, which the decoding of the dates is timed with (secondsPerCombination). */
const LONGEST_PHRASE = BIP39_WORD_COUNTS.at(-1)!;

/**
 * How the sets of one restore are turned into seed phrases. A class, so that a host builds it once
 * with the mode, the dates and its wallet check, and the time it announces and the search it runs
 * follow from the same; it keeps the dates out of toString, toJSON and Node.js's inspect.
 */
export class ShareUnmasking extends Redacted {
  readonly #mode: ShareMode;
  readonly #dates: DatesAnswer | undefined;
  readonly #walletCheck: WalletCheck | undefined;
  readonly #maxShown: number | undefined;
  readonly #keep: number | undefined;

  constructor(options: UnmaskingOptions) {
    super("ShareUnmasking");
    Masking.assertSplitMode(options.mode);
    const masked = Masking.isMaskedMode(options.mode);
    if (masked && !(options.dates instanceof DatesAnswer))
      throw new TypeError("A Seedshift phrase is unmasked with its dates, a DatesAnswer.");
    this.#mode = options.mode;
    this.#dates = masked ? options.dates : undefined;
    this.#walletCheck = options.walletCheck;
    this.#maxShown = options.maxShown;
    this.#keep = options.keep;
  }

  /** Whether a date holds ?, so that each phrase of the shares is searched. */
  get searches(): boolean {
    return this.#dates?.hasForgottenDigits === true;
  }

  /**
   * The date combinations that each phrase is searched with, which a wallet that no phrase matches
   * is said against (ShareSet.walletMismatch); undefined without a search.
   */
  get searchedCombinations(): number | undefined {
    return this.searches ? this.#dates!.combinations : undefined;
  }

  /** Whether the search needs the wallet to tell the right dates (walletNeeded). */
  get needsWallet(): boolean {
    return this.searches && walletNeeded(this.#mode);
  }

  /**
   * The date search that each phrase of the shares needs, for its time: its combinations, and the
   * seconds that each takes, from the decoding of one combination (DateSearch
   * .secondsPerCombination) and, with a wallet check, the checks that one combination costs in
   * this mode (Masking.checksPerCombination) at the pace of the host's check (DateSearch
   * .secondsPerCheck). Undefined without a search.
   */
  async dateWork(): Promise<DateWork | undefined> {
    // Only a masked phrase has dates to search.
    const mode = this.#mode;
    if (!this.searches || !Masking.isMaskedMode(mode)) return undefined;
    const dates = this.#dates!;
    // The shares do not say yet how long their phrase is; every count of dates fits 24 words.
    const perCombination = DateSearch.secondsPerCombination(mode, dates, LONGEST_PHRASE);
    if (this.#walletCheck === undefined)
      return { combinations: dates.combinations, secondsEach: perCombination };
    const pace = { perCombination, perCheck: await DateSearch.secondsPerCheck(this.#walletCheck) };
    const checks = Masking.of(mode).checksPerCombination(ANY_WORD_COUNT);
    return { combinations: dates.combinations, secondsEach: secondsEach(pace, checks) };
  }

  /**
   * The phrases that `sets` give, in their order: each set's own phrase, or the phrases that the
   * dates unmask, searched with `run` where a date holds ?; only those of the wallet when a wallet
   * check was given. Refused, with the line that says why, when the dates are more than a set's
   * phrase takes.
   */
  async unmask(sets: readonly RepairedSet[], run: DateSearchRun = {}): Promise<Unmasked> {
    const phrases: UnmaskedPhrase[] = [];
    const listed: string[] = [];
    const mode = this.#mode;
    for (const set of sets) {
      if (this.#dates === undefined || !Masking.isMaskedMode(mode)) {
        if (await this.#matches(set.mnemonic)) phrases.push({ set, mnemonic: set.mnemonic });
        continue;
      }
      const backup = EncodedBackup.read(set.mnemonic, "english", mode);
      const tooMany = this.#dates.tooManyFor(backup.indexes.length);
      if (tooMany !== undefined) return { kind: "dates", message: tooMany };
      if (!this.#dates.hasForgottenDigits) {
        const mnemonic = backup.decode(this.#dates.known).recoveredMnemonic;
        if (await this.#matches(mnemonic)) phrases.push({ set, mnemonic });
        continue;
      }
      const keep = this.#keep ?? 0;
      const result = await new DateSearch({
        indexes: backup.indexes,
        dates: this.#dates,
        mode,
        walletCheck: this.#walletCheck,
        maxShown: this.#maxShown,
        keep,
      }).run(run);
      for (const match of result.shown)
        phrases.push({
          set,
          mnemonic: match.mnemonic,
          dates: match.dates,
          matchedAt: match.evidence,
        });
      // A list takes every match; without one, those shown stand for the matches.
      listed.push(...(keep > 0 ? result.kept : result.shown.map((match) => match.mnemonic)));
    }
    // The phrases of direct sets and of whole dates are listed as they are kept.
    if (!this.searches) listed.push(...phrases.map((phrase) => phrase.mnemonic));
    return { kind: "phrases", phrases, listed };
  }

  /** Whether `mnemonic` is the wallet's; every phrase is without a wallet check. */
  async #matches(mnemonic: string): Promise<boolean> {
    return (
      this.#walletCheck === undefined || (await askWallet(this.#walletCheck, mnemonic)).matched
    );
  }
}
