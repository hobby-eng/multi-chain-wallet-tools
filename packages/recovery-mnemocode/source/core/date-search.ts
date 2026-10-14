// Forgotten Seedshift dates: what one answer of dates holds, how many combinations it stands for,
// how much work their search is, and the search itself. A program that only searches dates takes
// this module and the core modules it imports (dates, date-recovery, seedshift, words, and masking
// for what each mode costs and whether it needs the wallet); it needs nothing about shares, cards,
// records or terminals.
//
// From the host it needs, as parameters: a wallet check for each checksum-valid phrase
// (core/wallet-check.ts: the command line passes its Bitcoin evidence check; a page passes its own
// derivation, which may answer asynchronously), and for a run a progress callback, a match
// callback, an AbortSignal and how it yields to its event loop.
//
// It does not ask, print, read files or derive keys, and it keeps no phrase beyond the result it
// returns. Its messages name a wrong date by its place, never by what was typed.
//
// Host-neutral: test/portable-modules.test.ts checks that it reaches only host-neutral modules.

import {
  datePatternCombinationCount,
  formatDate,
  isDatePattern,
  maximumDates,
  ownedDate,
  ownedPattern,
  parseDate,
  parseDatePattern,
  tooManyDatesMessage,
  conflictingPatternKey,
  ownedDates,
  KEY_CONFLICT,
  NO_DATE,
} from "./dates.js";
import { BIP39_WORD_COUNTS, assertWordIndexes, isBip39WordCount } from "./bip39-sizes.js";
import { dateRecoveryCandidates, type SeedshiftMode } from "./date-recovery.js";
import { Masking, type MaskingMode } from "./masking.js";
import { placesNamed } from "./places.js";
import {
  stillRunning,
  keptCount,
  SearchTurns,
  startTimer,
  type SearchProgress,
  type SearchRun,
} from "./search-turns.js";
import type { Bip39WordCount, DatePattern, DateShiftDate } from "./types.js";
import { askWallet, type WalletCheck } from "./wallet-check.js";
import { assertWordCount } from "./words.js";
import { Redacted } from "./redacted.js";
import { indexesOfWords, zeroEntropyPhrase } from "./english-words.js";
import { SearchPlan, counted, counting } from "./search-plan.js";
import { refusalMessage } from "./refusal.js";
import { afterPlace } from "./prose.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.date-search", {
  "at-place-refused": suppliedMessage,
  "assert-keys-fit-refused": suppliedMessage,
  "date-recovery-supports-at-most-incomplete-dates": (value0: string) =>
    `Date recovery supports at most ${value0} incomplete dates.`,
  "date-patterns-produce-more-than-combinations-which-exceeds": (value0: string) =>
    `The date patterns produce more than ${value0} combinations, which exceeds the safety limit. Narrow at least one pattern.`,
  "no-date": () => NO_DATE,
  "parse-refused": suppliedMessage,
  "stand-what-forgotten-only-where-mnemo-code-can": () =>
    "? and | stand for what is forgotten only where MnemoCode can search dates; type every date in full.",
  "at-least-one-date-contain-forgotten-digit-represented": () =>
    "At least one date must contain a forgotten digit represented by ?.",
  "dates-dates-answer": { kind: "type", text: () => "The dates must be a DatesAnswer." },
  "operation-refused": suppliedMessage,
});

export type { WalletCheck, WalletMatch } from "./wallet-check.js";

/**
 * Date combinations that no search exceeds: with a wallet check of about 1.5 ms, about a month, as
 * for the share search (2^40 checks). A search longer than twelve hours is asked for first.
 */
export const HARD_MAX_COMBINATIONS = 2 ** 31;
/** Dates with ? that one search takes. */
export const MAX_INCOMPLETE_DATES = 3;
/** Matches that a search keeps to show unless the host asks for another number. */
export const MAX_SHOWN_MATCHES = 100;
/**
 * How a date search with more matches than a candidate list holds is narrowed
 * (TooManyForListError).
 */
export const NARROW_DATE_SEARCH = "narrow the dates, or give the wallet's fingerprint";
/**
 * A phrase to time the host's wallet check with: the one of all-zero entropy, "abandon … about",
 * public test data, which the check derives like any other.
 */
const PROBE_PHRASE = zeroEntropyPhrase(BIP39_WORD_COUNTS[0]);
/** Wallet checks timed for an estimate: enough to smooth a first slow call, quick to make. */
const PROBE_CHECKS = 3;
/** Combinations decoded for an estimate: some hundredths of a second, enough to be steady. */
const PROBE_COMBINATIONS = 256;

/**
 * The BIP39 indexes of the public phrase of `wordCount` words with all-zero entropy, which the
 * decoding is timed with. Its length counts: with a valid last word, the Original Seedshift
 * decodes 2^(11 - checksum bits) phrases for each combination, 128 for 12 words and 8 for 24.
 */
function probeIndexes(wordCount: Bip39WordCount): number[] {
  return indexesOfWords(zeroEntropyPhrase(wordCount).split(" "));
}

/**
 * Whether a mode gives a checksum-valid phrase for every date, so that only the wallet tells the
 * right dates: the modes whose codes keep the BIP39 checksum (MnemoCode Seedshift, and the
 * original's checksum-valid last word) keep it for every date too.
 */
export function walletNeeded(mode: MaskingMode): boolean {
  return Masking.of(mode).keepsChecksum;
}

/**
 * Why the wallet is asked for before a date search in `mode`: every guessed date gives a valid
 * phrase (walletNeeded), or several may. Undefined, a mode not known yet, as of a record file not
 * read, takes the second.
 */
export function walletReason(mode: MaskingMode | undefined): string {
  return mode !== undefined && walletNeeded(mode)
    ? "Each guessed date gives a valid phrase; the wallet tells which is yours."
    : "Several guessed dates may give a valid phrase; the wallet tells yours.";
}

/** What a dates answer may hold. */
export interface DatesRules {
  /** The words of the seed phrase, which take one date for every three (maximumDates). */
  readonly wordCount?: number | undefined;
  /** Whether ? may stand for forgotten digits: only where the dates are searched. */
  readonly patterns: boolean;
}

/** The dates are split at spaces; a comma or a semicolon between them is taken as one too. */
const DATE_SEPARATORS = /[\s,;]+/u;

/** The words of a BIP39 phrase, or undefined for a count that is none. */
function phraseLength(wordCount: number | undefined): Bip39WordCount | undefined {
  return wordCount !== undefined && isBip39WordCount(wordCount) ? wordCount : undefined;
}

/** `message` from the core after the place of the date it is about: "Date 2: the day ...". */
function atPlace(place: number, message: string): string {
  return afterPlace("Date", place, message);
}

/**
 * What `read` gives, or its refusal named by the date's place, the first refusal its cause; what
 * is thrown that is no Error passes through. Typed and structured dates are read through it alike
 * (AUD-012-ARC005).
 */
function atPlaceOf<T>(place: number, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw ERRORS.create("at-place-refused", [atPlace(place, refusalMessage(error))], {
      cause: error,
    });
  }
}

/**
 * Refuses a pattern with the key of an earlier one that allows other dates (conflictingPatternKey),
 * naming it by its place. parse makes each key of the digits typed, so that it never refuses here;
 * a host that builds its own patterns may.
 */
function assertKeysFit(patterns: readonly DatePattern[], places: readonly number[]): void {
  const index = conflictingPatternKey(patterns);
  if (index >= 0)
    throw ERRORS.create("assert-keys-fit-refused", [
      atPlace(places[index] ?? index + 1, KEY_CONFLICT),
    ]);
}

/**
 * The dates of one answer: the complete ones, and the ones with ? for forgotten digits. A class
 * pays off here: it is built only by `parse` or `of`, and its constructor refuses an answer that
 * cannot be searched, so every DatesAnswer can be; it never changes afterwards; and it keeps the
 * dates, which are part of a secret, out of toString, toJSON and Node.js's inspect.
 */
export class DatesAnswer extends Redacted {
  readonly #known: readonly DateShiftDate[];
  readonly #patterns: readonly DatePattern[];
  /** The places, counted from 1 among the dates typed, of the dates with ?. */
  readonly #incompletePlaces: readonly number[];
  /** The combinations of the patterns, counted once: the patterns never change. */
  readonly #combinations: number;

  private constructor(
    known: readonly DateShiftDate[],
    patterns: readonly DatePattern[],
    incompletePlaces: readonly number[],
  ) {
    super("DatesAnswer");
    // The limits are checked here, not only in parse and of: a private constructor is private to
    // TypeScript alone, and a JavaScript host can call it (AUD-009-FUN001).
    if (patterns.length > MAX_INCOMPLETE_DATES)
      throw ERRORS.create("date-recovery-supports-at-most-incomplete-dates", [
        `${MAX_INCOMPLETE_DATES}`,
      ]);
    // Copied and frozen, date by date: a caller that kept a date or a pattern could otherwise
    // change it after the limits were checked (AUD-009-FUN001). Array.from reads a hole of a
    // sparse list as undefined, which is refused; map would keep it.
    this.#known = ownedDates(known);
    this.#patterns = Object.freeze(Array.from(patterns, (pattern) => ownedPattern(pattern)));
    this.#incompletePlaces = Object.freeze([...incompletePlaces]);
    assertKeysFit(this.#patterns, this.#incompletePlaces);
    // Counted once, so that no later question copies and counts the patterns again.
    this.#combinations = datePatternCombinationCount(this.#patterns, HARD_MAX_COMBINATIONS);
    if (this.#combinations > HARD_MAX_COMBINATIONS)
      throw ERRORS.create("date-patterns-produce-more-than-combinations-which-exceeds", [
        `${counting(HARD_MAX_COMBINATIONS)}`,
      ]);
  }

  /**
   * Reads the dates of one answer, as a person types them in one line. The messages name a wrong
   * date by its place and never repeat it.
   */
  static parse(line: string, rules: DatesRules): DatesAnswer {
    const typed = line.split(DATE_SEPARATORS).filter(Boolean);
    if (typed.length === 0) throw ERRORS.create("no-date", []);
    const words = phraseLength(rules.wordCount);
    if (words !== undefined && typed.length > maximumDates(words))
      throw ERRORS.create("parse-refused", [tooManyDatesMessage(words)]);
    const known: DateShiftDate[] = [];
    const patterns: DatePattern[] = [];
    const incompletePlaces: number[] = [];
    typed.forEach((text, index) => {
      const place = index + 1;
      const incomplete = isDatePattern(text);
      if (incomplete && !rules.patterns)
        throw ERRORS.create("stand-what-forgotten-only-where-mnemo-code-can", []);
      atPlaceOf(place, () => {
        if (incomplete) patterns.push(parseDatePattern(text));
        else known.push(parseDate(text));
      });
      if (incomplete) incompletePlaces.push(place);
    });
    return new DatesAnswer(known, patterns, incompletePlaces);
  }

  /**
   * The answer of dates read elsewhere, such as complete dates given as command-line options or
   * typed into separate fields, held to the same limits as `parse`. The dates with ? count as
   * typed after the complete ones.
   */
  static of(known: readonly DateShiftDate[], patterns: readonly DatePattern[] = []): DatesAnswer {
    if (known.length + patterns.length === 0) throw ERRORS.create("no-date", []);
    // Each date is checked as parse checks a typed one, and named by its place (AUD-009-API001).
    // Array.from, not map: a hole of a sparse list is then a date that is refused, not skipped.
    const ownKnown = Array.from(known, (date, index) =>
      atPlaceOf(index + 1, () => ownedDate(date)),
    );
    const ownPatterns = Array.from(patterns, (pattern, index) =>
      atPlaceOf(known.length + index + 1, () => ownedPattern(pattern)),
    );
    const places = ownPatterns.map((_, index) => known.length + index + 1);
    return new DatesAnswer(ownKnown, ownPatterns, places);
  }

  /** The complete dates, in the order typed; a copy, so that the answer stays as it was built. */
  get known(): DateShiftDate[] {
    return [...this.#known];
  }

  /** The dates with ? for forgotten digits, in the order typed; none when every date is whole. */
  get patterns(): DatePattern[] {
    return [...this.#patterns];
  }

  /** How many dates the answer holds, complete or not. */
  get count(): number {
    return this.#known.length + this.#patterns.length;
  }

  /** Whether a date holds ? for a forgotten digit, so that the dates must be searched. */
  get hasForgottenDigits(): boolean {
    return this.#patterns.length > 0;
  }

  /** Standalone date recovery needs a pattern; combined code recovery also accepts known dates. */
  assertIncomplete(): void {
    if (!this.hasForgottenDigits)
      throw ERRORS.create("at-least-one-date-contain-forgotten-digit-represented", []);
  }

  /**
   * The combinations of dates that the answer stands for: 1 when every date is whole, and
   * HARD_MAX_COMBINATIONS + 1 for any count above that limit.
   */
  get combinations(): number {
    return this.#combinations;
  }

  /** The places, counted from 1 among the dates typed, of the dates that hold ?. */
  get incompletePlaces(): number[] {
    return [...this.#incompletePlaces];
  }

  /**
   * The line that a page shows while the dates are typed: which dates hold ? and the combinations
   * they stand for, such as "Dates 2 and 3 have forgotten digits: 3,650 combinations."; undefined
   * when every date is whole.
   */
  get forgottenDigitsNote(): string | undefined {
    const places = this.#incompletePlaces;
    if (places.length === 0) return undefined;
    const verb = places.length === 1 ? "has" : "have";
    return `${placesNamed("Date", places)} ${verb} forgotten digits: ${counted(this.combinations, "combination")}.`;
  }

  /** Whether a phrase of `wordCount` words takes this many dates; never for another count. */
  fitsPhrase(wordCount: number): boolean {
    const words = phraseLength(wordCount);
    return words !== undefined && this.count <= maximumDates(words);
  }

  /**
   * Why a phrase of `wordCount` words cannot take these dates, or undefined when it can or when
   * the count is not known yet (no phrase length).
   */
  tooManyFor(wordCount: number | undefined): string | undefined {
    const words = phraseLength(wordCount);
    return words !== undefined && this.count > maximumDates(words)
      ? tooManyDatesMessage(words)
      : undefined;
  }
}

/** A match: its dates as DD-MM-YYYY, sorted and joined by spaces, its phrase, and its path. */
export interface DateMatch {
  /** The dates that were guessed, as DD-MM-YYYY joined by spaces: what the search found. */
  readonly dates: string;
  /**
   * Every date that decodes the codes to `mnemonic`, the known ones with the guessed, sorted:
   * what a host decodes the codes with afterwards.
   */
  readonly allDates: readonly DateShiftDate[];
  readonly mnemonic: string;
  /** Where the wallet matched; absent without a wallet check, or a match without a path. */
  readonly evidence?: string | undefined;
}

/** How far a search has come. */
export interface DateSearchProgress extends SearchProgress {
  /** The date combinations tried so far. */
  readonly checked: number;
  /** The date combinations of the whole search. */
  readonly total: number;
  /** The candidates with a valid BIP39 checksum so far. */
  readonly found: number;
  /** The candidates that matched the wallet so far, or every checksum-valid one without one. */
  readonly matched: number;
}

/** What a search found. */
export interface DateSearchResult {
  /** The date combinations searched. */
  readonly combinations: number;
  /** The candidates with a valid BIP39 checksum. */
  readonly checksumValid: number;
  /** The candidates that matched the wallet, or every checksum-valid one without a wallet. */
  readonly matchCount: number;
  /** The first `maxShown` matches. */
  readonly shown: readonly DateMatch[];
  /** The phrase of every match, kept only when `keep` is above 0, at most `keep` of them. */
  readonly kept: readonly string[];
  /** The date combinations checked: all of them, unless the search was stopped. */
  readonly checked: number;
  /**
   * Whether the host stopped the search (SearchRun.signal): then the counts and matches cover only
   * the combinations checked before the stop, and nothing found after it (CORE-22).
   */
  readonly stopped: boolean;
}

/** How fast a search goes in a host, in seconds, as DateSearch.pace measures it. */
export interface SearchPace {
  /** One call of the wallet check; 0 without one. */
  readonly perCheck: number;
  /** Decoding one combination of the dates. */
  readonly perCombination: number;
}

/** Seconds that one combination of the dates takes at `pace`, with `checks` wallet checks. */
export function secondsEach(pace: SearchPace, checks: number): number {
  return pace.perCombination + checks * pace.perCheck;
}

/** What a search is built with. */
export interface DateSearchOptions {
  /** The encoded seed phrase's BIP39 indexes, 0 to 2047. */
  readonly indexes: readonly number[];
  readonly dates: DatesAnswer;
  readonly mode: SeedshiftMode;
  /** Compares each checksum-valid phrase with the wallet; none keeps every such phrase. */
  readonly walletCheck?: WalletCheck | undefined;
  /** How many matches are kept to be shown; MAX_SHOWN_MATCHES by default. */
  readonly maxShown?: number | undefined;
  /** How many match phrases are kept, for a candidate list; 0, the default, keeps none. */
  readonly keep?: number | undefined;
}

/** How a search runs. */
export interface DateSearchRun extends SearchRun {
  /**
   * Called after every `progressEvery` combinations, or at each turn of the search without it, as
   * every search of the library tells its progress; and after the last one.
   */
  readonly onProgress?: ((progress: DateSearchProgress) => void) | undefined;
  /** Combinations between two progress calls; at each turn of the search by default. */
  readonly progressEvery?: number | undefined;
  /** Called with every match as it is found, also those beyond `maxShown`. */
  readonly onMatch?: ((match: DateMatch) => void) | undefined;
}

/** Combinations between two progress calls: a whole number of 1 or more; none for each turn. */
function progressStep(every: number | undefined): number | undefined {
  return every === undefined ? undefined : keptCount(every, 1, "progressEvery", 1);
}

/**
 * One search for the forgotten digits of the dates: every combination that the patterns allow is
 * tried with the known dates, and each checksum-valid phrase is compared with the wallet. A class
 * pays off here: it is built once with its phrase, dates, mode and the host's wallet check, which
 * it checks against each other, and then tells its size and its work before it runs, as a page
 * shows them before the person starts the search; toString, toJSON and Node.js's inspect show
 * none of its codes or dates.
 */
export class DateSearch extends Redacted {
  readonly #indexes: readonly number[];
  readonly #dates: DatesAnswer;
  readonly #mode: SeedshiftMode;
  readonly #walletCheck: WalletCheck | undefined;
  readonly #maxShown: number;
  readonly #keep: number;

  constructor(options: DateSearchOptions) {
    super("DateSearch");
    // Copied first and the copy checked, as EncodedBackup.of checks codes: a hole or a code outside
    // the BIP39 list is refused before the search tells its size, not at its first combination.
    const indexes = Array.from(options.indexes);
    const words = indexes.length;
    assertWordCount(words);
    assertWordIndexes(indexes);
    Masking.assertMaskedMode(options.mode);
    if (!(options.dates instanceof DatesAnswer)) throw ERRORS.create("dates-dates-answer", []);
    if (!options.dates.fitsPhrase(words))
      throw ERRORS.create("operation-refused", [tooManyDatesMessage(words)]);
    this.#indexes = Object.freeze(indexes);
    this.#dates = options.dates;
    this.#mode = options.mode;
    this.#walletCheck = options.walletCheck;
    this.#maxShown = keptCount(options.maxShown, MAX_SHOWN_MATCHES, "maxShown");
    this.#keep = keptCount(options.keep, 0, "keep");
  }

  /** The date combinations that the search tries. */
  get combinations(): number {
    return this.#dates.combinations;
  }

  /**
   * Seconds that one call of `walletCheck` takes in this host, from a few checks of the public
   * test phrase, for estimatedSeconds. It may answer later, as a page's derivation does.
   */
  static async secondsPerCheck(walletCheck: WalletCheck): Promise<number> {
    const elapsed = startTimer();
    for (let check = 0; check < PROBE_CHECKS; check += 1) await walletCheck(PROBE_PHRASE);
    return elapsed() / PROBE_CHECKS;
  }

  /**
   * Seconds that decoding one combination of `dates` takes in this host in `mode`, from the first
   * combinations of a search of the public phrase of `wordCount` words: for a search without a
   * wallet check it is all the work, and beside one it is still a part (estimatedSeconds).
   */
  static secondsPerCombination(
    mode: SeedshiftMode,
    dates: DatesAnswer,
    wordCount: Bip39WordCount,
  ): number {
    assertWordCount(wordCount);
    const elapsed = startTimer();
    let decoded = 0;
    for (const candidates of dateRecoveryCandidates(
      probeIndexes(wordCount),
      dates.known,
      dates.patterns,
      mode,
    )) {
      // The phrases are made as the search makes them; only the time counts.
      void candidates;
      decoded += 1;
      if (decoded >= PROBE_COMBINATIONS) break;
    }
    return elapsed() / Math.max(1, decoded);
  }

  /**
   * The pace of this search in this host: one wallet check (secondsPerCheck), 0 without one, and
   * the decoding of one combination (secondsPerCombination), for estimatedSeconds.
   */
  async pace(): Promise<SearchPace> {
    return {
      perCheck:
        this.#walletCheck === undefined ? 0 : await DateSearch.secondsPerCheck(this.#walletCheck),
      perCombination: DateSearch.secondsPerCombination(
        this.#mode,
        this.#dates,
        this.#indexes.length as Bip39WordCount,
      ),
    };
  }

  /**
   * The checksum-valid phrases, so the wallet checks, that one combination gives on average, for
   * an estimate of the time (Masking.checksPerCombination): MnemoCode Seedshift gives a valid
   * phrase for every date; the Original Seedshift gives one only by chance, once in 2^bits; with
   * a valid last word every last word whose checksum fits is tried, 2^(11 - bits) of them.
   */
  checks(): number {
    return Masking.of(this.#mode).checksPerCombination(this.#indexes.length);
  }

  /**
   * About how many seconds the search takes at `pace`, as the host measured it (pace): the
   * decoding of every combination, and a wallet check of each checksum-valid phrase if there is
   * a wallet check.
   */
  estimatedSeconds(pace: SearchPace): number {
    const checks = this.#walletCheck === undefined ? 0 : this.checks();
    return this.combinations * secondsEach(pace, checks);
  }

  /**
   * The plan of the search at `pace`: asked for first when it tries more combinations than
   * `limit`, the person's own limit, or without one takes longer than QUESTION_SECONDS.
   */
  plan(pace: SearchPace, limit?: number): SearchPlan {
    const { combinations } = this;
    return SearchPlan.of(
      counted(combinations, "date combination"),
      combinations,
      this.estimatedSeconds(pace),
      limit,
    );
  }

  /** Runs the search; the host's callbacks and signal come in with `run`. */
  async run(run: DateSearchRun = {}): Promise<DateSearchResult> {
    const progressEvery = progressStep(run.progressEvery);
    const combinations = this.combinations;
    const shown: DateMatch[] = [];
    const kept: string[] = [];
    let checked = 0;
    let checksumValid = 0;
    let matchCount = 0;
    const turns = SearchTurns.of(run);
    const result = (stopped: boolean): DateSearchResult => ({
      combinations,
      checksumValid,
      matchCount,
      shown,
      kept,
      checked,
      stopped,
    });
    if (turns.stopped) return result(true);
    for (const candidates of dateRecoveryCandidates(
      this.#indexes,
      this.#dates.known,
      this.#dates.patterns,
      this.#mode,
    )) {
      const turn = await turns.due();
      if (turn === "stopped") return result(true);
      checked += 1;
      const turned = turn === "turned";
      for (const candidate of candidates) {
        checksumValid += 1;
        const match =
          this.#walletCheck === undefined
            ? undefined
            : await askWallet(this.#walletCheck, candidate.mnemonic);
        // An answer that came after a stop is neither counted nor published (AUD-015-API001).
        if (!stillRunning(run)) return result(true);
        if (match !== undefined && !match.matched) continue;
        matchCount += 1;
        if (kept.length < this.#keep) kept.push(candidate.mnemonic);
        if (shown.length >= this.#maxShown && run.onMatch === undefined) continue;
        const found: DateMatch = {
          dates: candidate.dates.map(formatDate).join(" "),
          allDates: candidate.allDates,
          mnemonic: candidate.mnemonic,
          // Only a match of the wallet at a path names one; without a check there is no key.
          ...(match?.path === undefined ? {} : { evidence: match.path }),
        };
        if (shown.length < this.#maxShown) shown.push(found);
        run.onMatch?.(found);
      }
      const step = progressEvery === undefined ? turned : checked % progressEvery === 0;
      if (step || checked === combinations)
        run.onProgress?.({
          checked,
          total: combinations,
          found: checksumValid,
          matched: matchCount,
        });
    }
    return result(!stillRunning(run));
  }
}
