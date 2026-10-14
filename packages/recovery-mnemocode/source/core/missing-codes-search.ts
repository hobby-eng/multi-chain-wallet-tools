// The search of codes that cannot be read, marked with ?: how the right codes are told (the
// encoded fingerprint that Encode showed for them, the wallet, with the dates where the phrase was
// masked, or every candidate listed where they are few), the size and time of each way before it
// starts, and what it found. A host asks the person and shows the results; this module decides
// every rule, so that the command line and a page search alike.
//
// Needs from the host: the master fingerprint of a phrase, which may answer later, as a page's
// WebCrypto does; the wallet check of the wallet the person names (core/wallet-check.ts); and,
// for a run, its progress callback and an AbortSignal.
// Does not: ask, print or read anything. Its messages never repeat a code or a phrase.
//
// Host-neutral: it reaches only core modules and the BIP39 word list.

import type { SeedshiftMode } from "./date-recovery.js";
import { DateSearch, type DatesAnswer, type DateMatch } from "./date-search.js";
import { EncodedBackup } from "./encoded-backup.js";
import { EncodedForm } from "./encoded-form.js";
import { Masking } from "./masking.js";
import type { MissingCodes } from "./missing-codes.js";
import { stillRunning, startTimer, type SearchProgress, type SearchRun } from "./search-turns.js";
import type { DateShiftDate } from "./types.js";
import {
  askWallet,
  fingerprintWalletCheck,
  parseMasterFingerprint,
  type PhraseFingerprint,
  type WalletCheck,
} from "./wallet-check.js";
import { placesNamed } from "./places.js";
import { phraseOfIndexes } from "./words.js";
import { ownedDates } from "./dates.js";
import { CORRECT_WRITTEN_COPY, SearchPlan, counted } from "./search-plan.js";
import { defined } from "./defined.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.missing-codes-search", {
  "search-host-s-fingerprint-function": {
    kind: "type",
    text: () => "The search needs the host's fingerprint function.",
  },
  "codes-were-not-masked-no-dates-search": () =>
    "Codes that were not masked have no dates to search.",
  "dates-found-do-not-decode-codes-wallet-matched": () =>
    "The dates found do not decode the codes to the wallet that matched.",
  "operation-refused": suppliedMessage,
});

/** How the right codes are told. */
export type MissingCodesWay = "encoded" | "wallet" | "list";

/** A way offered for codes, with the words a host shows for it. */
export interface MissingCodesWayChoice {
  readonly way: MissingCodesWay;
  readonly label: string;
  readonly note: string;
}

/** The texts that every host shows as they are. */
export const MISSING_CODES_TEXTS = Object.freeze({
  question: "How can MnemoCode tell the right codes?",
  many: "A fingerprint or an address tells the right codes among them.",
  noneByFingerprint: "No codes fit this fingerprint: check it, and the codes.",
  noneByWallet: "No codes give this wallet: check the dates, the wallet and the codes.",
  correct: CORRECT_WRITTEN_COPY,
  list: "Each line: the codes, the seed phrase they give, and its fingerprint with an empty BIP39 passphrase. Compare the fingerprint with your wallet.",
});

/** One candidate of a listed search: the codes, the phrase they give, and its fingerprint. */
export interface MissingCodesRow {
  readonly codes: string;
  readonly phrase: string;
  readonly fingerprint: string;
}

/**
 * The one set of codes that fits, with the dates it was decoded with, found or known; none where
 * the way needed no dates, which the host then asks as for complete codes.
 */
export interface MissingCodesFound {
  readonly kind: "found";
  readonly backup: EncodedBackup;
  readonly dates?: readonly DateShiftDate[] | undefined;
  /** The dates as found by a search of their forgotten digits, as DD-MM-YYYY joined by spaces. */
  readonly foundDates?: string | undefined;
}

/** What one way found. */
export type MissingCodesResult =
  | MissingCodesFound
  /** Every candidate, for the person to compare. */
  | { readonly kind: "list"; readonly rows: readonly MissingCodesRow[] }
  /** No codes fit: `message` says what to check. */
  | { readonly kind: "none"; readonly message: string }
  /** Several sets fit, which a fingerprint leaves only by chance: the wallet tells them apart. */
  | { readonly kind: "several"; readonly count: number; readonly message: string }
  /** The host stopped the search (SearchRun.signal): nothing found is told (CORE-22). */
  | { readonly kind: "stopped" };

/** The result of a way that the host stopped. */
const STOPPED: MissingCodesResult = { kind: "stopped" };

/**
 * A search of one way before it starts: what is searched, such as "128 candidates" or "128
 * candidates with 10 date combinations each", what the person is told, and whether they are asked.
 */
export type MissingCodesPlan = SearchPlan;

/**
 * How far the search of marked codes has come: candidates checked, of about how many, and found.
 */
export interface MissingCodesProgress extends SearchProgress {
  /** About how many candidates the search checks in all (MissingCodes.expected). */
  readonly total: number;
}

/** The host's services for a run. */
export interface MissingCodesRun extends SearchRun {
  /** Called as the candidates are checked: how many so far, of about how many, and found. */
  readonly onProgress?: ((progress: MissingCodesProgress) => void) | undefined;
}

/** One way prepared with its answers: its plan first, then its run. */
export interface MissingCodesWaySearch {
  plan(limit?: number): Promise<MissingCodesPlan>;
  run(run?: MissingCodesRun): Promise<MissingCodesResult>;
}

// The host's fingerprint of a phrase (wallet-check.ts), here too for the hosts that take it with
// this search.
export type { PhraseFingerprint };

/** Candidates few enough to be listed for the person to compare. */
const MAX_LISTED = 16;

/** Why a list cannot tell codes with about `expected` candidates. */
function tooManyToList(expected: number): string {
  return `A list holds at most ${MAX_LISTED} candidates; these codes have about ${counted(expected, "candidate")}.`;
}

/** The phrases that `backup` gives with `dates` and that pass their own checksum. */
function phrasesOf(backup: EncodedBackup, dates: readonly DateShiftDate[]): string[] {
  return backup
    .candidates(dates)
    .filter((result) => result.checksumValid)
    .map((result) => result.recoveredMnemonic);
}

/** Seconds that decoding `backup` with `dates` takes in this host, phrases and checksums too. */
function secondsToDecode(backup: EncodedBackup, dates: readonly DateShiftDate[]): number {
  const elapsed = startTimer();
  phrasesOf(backup, dates);
  return elapsed();
}

/** The one set found, none, or several, as a result; or that the host stopped the search. */
function foundOne(
  { found, passed, stopped }: SearchedCodes,
  nothing: string,
  dates: readonly DateShiftDate[] | undefined,
): MissingCodesResult {
  if (stopped) return STOPPED;
  if (passed === 0) return { kind: "none", message: nothing };
  if (passed === 1) return { kind: "found", backup: defined(found[0]), dates };
  // Counted by every set that passed, as the progress counts them, not by those kept.
  return {
    kind: "several",
    count: passed,
    message: `${passed} sets of codes fit; the wallet tells which is yours.`,
  };
}

/**
 * The search of codes marked with ?, for one set of codes. A class, so that a host binds its
 * fingerprint once and every way it offers follows the same rules; each way is prepared with its
 * answers and planned before it runs.
 */
export class MissingCodesSearch {
  /** Candidates few enough to be listed (the way "list"). */
  static readonly MAX_LISTED = MAX_LISTED;

  readonly #codes: MissingCodes;
  readonly #fingerprint: PhraseFingerprint;

  constructor(codes: MissingCodes, fingerprint: PhraseFingerprint) {
    if (typeof fingerprint !== "function")
      throw ERRORS.create("search-host-s-fingerprint-function", []);
    this.#codes = codes;
    this.#fingerprint = fingerprint;
  }

  /**
   * The places of `codes` that cannot be read: "Code 6", "Codes 6 and 9"; "Words 10 and 11" for
   * colours, whose marks leave words open (EncodedForm.placeName).
   */
  static placesText(codes: MissingCodes): string {
    return placesNamed(EncodedForm.of(codes.format).placeName, codes.missingPlaces);
  }

  get codes(): MissingCodes {
    return this.#codes;
  }

  /** What cannot be read, and how many candidates that leaves. */
  get unreadable(): string {
    const codes = this.#codes;
    return `${MissingCodesSearch.placesText(codes)} cannot be read: ${counted(codes.combinations, "combination")}, about ${counted(codes.expected, "candidate")}.`;
  }

  /** Whether so many candidates are left that only a fingerprint or an address tells them. */
  get many(): boolean {
    return this.#codes.expected > MAX_LISTED;
  }

  /**
   * The ways offered for the codes: the encoded fingerprint only where the codes were masked and
   * keep a checksum (without Seedshift it is the wallet's own, which the wallet way takes), the
   * wallet always, and the list where the candidates are few.
   */
  get ways(): readonly MissingCodesWayChoice[] {
    const masked = Masking.of(this.#codes.mode).masked;
    const ways: MissingCodesWayChoice[] = [];
    if (masked && this.#codes.checksummed)
      ways.push({
        way: "encoded",
        label: "Encoded fingerprint",
        note: "the one Encode showed; no dates needed",
      });
    ways.push({
      way: "wallet",
      label: "The wallet",
      note: masked
        ? "its fingerprint or an address, after the dates"
        : "its fingerprint or an address",
    });
    if (!this.many)
      ways.push({ way: "list", label: "List every candidate", note: "compare them yourself" });
    return ways;
  }

  /**
   * Whether `way` can tell these codes when the person names it ahead, as an option does: the
   * encoded fingerprint wherever the codes keep a checksum, the wallet always, the list where the
   * candidates are few.
   */
  fits(way: MissingCodesWay): boolean {
    return this.whyNot(way) === undefined;
  }

  /** Why `way` cannot tell these codes, or undefined when it can (fits). */
  whyNot(way: MissingCodesWay): string | undefined {
    if (way === "encoded" && !this.#codes.checksummed)
      return "These codes keep no checksum, so their encoded fingerprint cannot tell them.";
    if (way === "list" && this.many) return tooManyToList(this.#codes.expected);
    return undefined;
  }

  /** Whether the dates of these codes are needed: they were masked. */
  get needsDates(): boolean {
    return Masking.of(this.#codes.mode).masked;
  }

  /** The codes whose own fingerprint is `fingerprint`, the encoded one that Encode showed. */
  byEncodedFingerprint(fingerprint: string): MissingCodesWaySearch {
    return new EncodedFingerprintWay(this.#codes, this.#fingerprint, fingerprint);
  }

  /**
   * The codes whose phrase, with `dates`, matches the wallet. Dates with forgotten digits are
   * searched for each candidate of the codes (DateSearch), so that codes and dates are found
   * together; without dates the codes were not masked.
   */
  byWallet(walletCheck: WalletCheck, dates?: DatesAnswer): MissingCodesWaySearch {
    return dates?.hasForgottenDigits === true
      ? new WalletAndDatesWay(this.#codes, walletCheck, dates)
      : new WalletWay(this.#codes, walletCheck, dates?.known ?? []);
  }

  /** Every candidate with its phrase, with the complete `dates`, and its fingerprint. */
  listed(dates: readonly DateShiftDate[]): MissingCodesWaySearch {
    return new ListWay(this.#codes, this.#fingerprint, dates);
  }
}

/** What a search of the codes kept, how many sets of codes passed in all, and whether it stopped. */
interface SearchedCodes {
  readonly found: readonly EncodedBackup[];
  readonly passed: number;
  readonly stopped: boolean;
}

/** The search of `codes` with `check`, with the host's progress and signal. */
async function searched(
  codes: MissingCodes,
  check: (indexes: readonly number[]) => boolean | Promise<boolean>,
  run: MissingCodesRun,
): Promise<SearchedCodes> {
  const result = await codes.run({
    check,
    signal: run.signal,
    turn: run.turn,
    onProgress:
      run.onProgress === undefined
        ? undefined
        : ({ checked, found }) =>
            defined(run.onProgress)({ checked, total: codes.expected, found }),
  });
  return {
    found: result.found,
    passed: result.passed,
    stopped: result.stopped || !stillRunning(run),
  };
}

/** The way of the encoded fingerprint, which needs no dates. */
class EncodedFingerprintWay implements MissingCodesWaySearch {
  readonly #codes: MissingCodes;
  readonly #fingerprintOf: PhraseFingerprint;
  readonly #fingerprint: string;

  constructor(codes: MissingCodes, fingerprintOf: PhraseFingerprint, fingerprint: string) {
    this.#codes = codes;
    this.#fingerprintOf = fingerprintOf;
    // Read as every fingerprint is: a wrong one is refused when the way is made.
    this.#fingerprint = parseMasterFingerprint(fingerprint);
  }

  async plan(limit?: number): Promise<MissingCodesPlan> {
    const fingerprintOf = this.#fingerprintOf;
    const perFingerprint = await DateSearch.secondsPerCheck(async (mnemonic) => ({
      matched: (await fingerprintOf(mnemonic)) === "",
    }));
    const expected = this.#codes.expected;
    return SearchPlan.of(
      counted(expected, "candidate"),
      expected,
      expected * perFingerprint,
      limit,
    );
  }

  async run(run: MissingCodesRun = {}): Promise<MissingCodesResult> {
    const walletCheck = fingerprintWalletCheck(this.#fingerprintOf, this.#fingerprint);
    const found = await searched(
      this.#codes,
      async (indexes) => (await walletCheck(phraseOfIndexes(indexes))).matched,
      run,
    );
    // The codes are found without dates, which are asked afterwards as for complete codes.
    return foundOne(found, MISSING_CODES_TEXTS.noneByFingerprint, undefined);
  }
}

/** The way of the wallet with complete dates, or none where the codes were not masked. */
class WalletWay implements MissingCodesWaySearch {
  readonly #codes: MissingCodes;
  readonly #walletCheck: WalletCheck;
  readonly #dates: readonly DateShiftDate[];

  constructor(codes: MissingCodes, walletCheck: WalletCheck, dates: readonly DateShiftDate[]) {
    this.#codes = codes;
    this.#walletCheck = walletCheck;
    // Copied and checked, so that a date the host changes later reaches no candidate.
    this.#dates = ownedDates(dates);
  }

  /**
   * The time of the search: for each candidate, its decoding with the dates, timed on the first,
   * and the wallet checks of the phrases it gives, as many as its mode gives (checksPerDecoding).
   */
  async plan(limit?: number): Promise<MissingCodesPlan> {
    const codes = this.#codes;
    const expected = codes.expected;
    const perCheck = await DateSearch.secondsPerCheck(this.#walletCheck);
    const checks = Masking.of(codes.mode).checksPerDecoding(codes.wordCount);
    const first = codes.candidates().next();
    const perDecoding =
      first.done === true
        ? 0
        : secondsToDecode(EncodedBackup.of(first.value, codes.format, codes.mode), this.#dates);
    const seconds = expected * (perDecoding + checks * perCheck);
    return SearchPlan.of(counted(expected, "candidate"), expected, seconds, limit);
  }

  async run(run: MissingCodesRun = {}): Promise<MissingCodesResult> {
    const codes = this.#codes;
    const found = await searched(
      codes,
      async (indexes) => {
        for (const phrase of phrasesOf(
          EncodedBackup.of(indexes, codes.format, codes.mode),
          this.#dates,
        ))
          if ((await askWallet(this.#walletCheck, phrase)).matched) return true;
        return false;
      },
      run,
    );
    return foundOne(found, MISSING_CODES_TEXTS.noneByWallet, this.#dates);
  }
}

/** The way of the wallet where dates have forgotten digits: codes and dates found together. */
class WalletAndDatesWay implements MissingCodesWaySearch {
  readonly #codes: MissingCodes;
  readonly #mode: SeedshiftMode;
  readonly #walletCheck: WalletCheck;
  readonly #dates: DatesAnswer;

  constructor(codes: MissingCodes, walletCheck: WalletCheck, dates: DatesAnswer) {
    const { mode } = codes;
    if (!Masking.isMaskedMode(mode))
      throw ERRORS.create("codes-were-not-masked-no-dates-search", []);
    this.#codes = codes;
    this.#mode = mode;
    this.#walletCheck = walletCheck;
    this.#dates = dates;
  }

  /** The date search of one candidate of the codes, which stops at its first match. */
  #searchOf(indexes: readonly number[]): DateSearch {
    return new DateSearch({
      indexes,
      dates: this.#dates,
      mode: this.#mode,
      walletCheck: this.#walletCheck,
      maxShown: 1,
    });
  }

  async plan(limit?: number): Promise<MissingCodesPlan> {
    const codes = this.#codes;
    const dates = this.#dates;
    const size = `${counted(codes.expected, "candidate")} with ${counted(dates.combinations, "date combination")} each`;
    const count = codes.expected * dates.combinations;
    const first = codes.candidates().next();
    // No candidate at all: nothing to try or time, and the run finds none at once.
    if (first.done === true) return SearchPlan.of(size, 0, 0, limit);
    const probe = this.#searchOf(first.value);
    const seconds = codes.expected * probe.estimatedSeconds(await probe.pace());
    return SearchPlan.of(size, count, seconds, limit);
  }

  async run(run: MissingCodesRun = {}): Promise<MissingCodesResult> {
    // The match of the first set of codes that matched, which is the result where it is the only
    // one (foundOne): a second set makes the result a count alone, and then no match is kept, so
    // that no phrase or dates are held that nothing shows.
    let first: DateMatch | undefined;
    let matched = 0;
    const found = await searched(
      this.#codes,
      async (indexes) => {
        const result = await this.#searchOf(indexes).run({ signal: run.signal, turn: run.turn });
        // A stop is heard by the search of the codes too, at its next turn.
        if (result.stopped) return false;
        const match = result.shown[0];
        if (match === undefined) return false;
        matched += 1;
        first = matched === 1 ? match : undefined;
        return true;
      },
      run,
    );
    const result = foundOne(found, MISSING_CODES_TEXTS.noneByWallet, []);
    if (result.kind !== "found") return result;
    const match = defined(first);
    // The codes are decoded with every date, the known ones too: the guessed ones alone give
    // another phrase (AUD-012-FUN001). Checked here, so that no host decodes another wallet.
    const phrases = result.backup.candidates(match.allDates);
    if (!phrases.some((phrase) => phrase.recoveredMnemonic === match.mnemonic))
      throw ERRORS.create("dates-found-do-not-decode-codes-wallet-matched", []);
    return { ...result, dates: match.allDates, foundDates: match.dates };
  }
}

/** The way of the list: every candidate, where they are few. */
class ListWay implements MissingCodesWaySearch {
  readonly #codes: MissingCodes;
  readonly #fingerprintOf: PhraseFingerprint;
  readonly #dates: readonly DateShiftDate[];

  constructor(
    codes: MissingCodes,
    fingerprintOf: PhraseFingerprint,
    dates: readonly DateShiftDate[],
  ) {
    if (codes.expected > MAX_LISTED)
      throw ERRORS.create("operation-refused", [tooManyToList(codes.expected)]);
    this.#codes = codes;
    this.#fingerprintOf = fingerprintOf;
    // Copied and checked, so that a date the host changes later reaches no candidate.
    this.#dates = ownedDates(dates);
  }

  async plan(limit?: number): Promise<MissingCodesPlan> {
    const expected = this.#codes.expected;
    return SearchPlan.of(counted(expected, "candidate"), expected, 0, limit);
  }

  async run(run: MissingCodesRun = {}): Promise<MissingCodesResult> {
    const { found, stopped } = await searched(this.#codes, () => true, run);
    if (stopped) return STOPPED;
    const rows: MissingCodesRow[] = [];
    for (const backup of found)
      for (const phrase of phrasesOf(backup, this.#dates)) {
        const fingerprint = await this.#fingerprintOf(phrase);
        if (!stillRunning(run)) return STOPPED;
        rows.push({
          codes: backup.text(),
          phrase,
          fingerprint,
        });
      }
    // The host's fingerprints are waited for after the search: a stop meanwhile lists nothing.
    return stillRunning(run) ? { kind: "list", rows } : STOPPED;
  }
}
