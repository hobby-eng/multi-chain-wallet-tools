// The long searches of MnemoCode as the Deriver runs them in a worker: forgotten words and
// forgotten digits of Seedshift dates, each compared with the wallet if the person gave evidence,
// and, on request, the candidate list for the Discovery Scanner written from every candidate
// (CandidateListWriter, which a share restore uses too). All rules come from MnemoCode's vendored
// library; this object only binds them to the host's PBKDF2. The list's protection and the BIP39
// passphrase it stores are checked before the search, so that a mistyped key shows at once.
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import {
  LIST_KEEP,
  MAX_CANDIDATE_RECORDS,
} from "../../recovery-mnemocode/source/core/candidate-list.js";
import {
  protectionFor,
  type ListProtectionChoice,
} from "../../recovery-mnemocode/source/core/candidate-encryption.js";
import {
  CandidateListWriter as ListWriter,
  type ListOutcome as WrittenList,
} from "../../recovery-mnemocode/source/core/candidate-list-writer.js";
import {
  MatchTally,
  MAX_SHOWN_CANDIDATES,
  WordCandidateSearch,
  type WordSearch,
} from "../../recovery-mnemocode/source/core/candidates.js";
import {
  DatesAnswer,
  DateSearch,
  HARD_MAX_COMBINATIONS,
  MAX_SHOWN_MATCHES,
} from "../../recovery-mnemocode/source/core/date-search.js";
import { formatDate } from "../../recovery-mnemocode/source/core/dates.js";
import type { EncodedFormat } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import { parseMasterFingerprint } from "../../recovery-mnemocode/source/core/master-fingerprint.js";
import type { MaskingMode } from "../../recovery-mnemocode/source/core/masking.js";
import {
  MissingCodesSearch,
  type MissingCodesResult,
  type MissingCodesRow,
  type MissingCodesWay,
  type MissingCodesWaySearch,
  type PhraseFingerprint,
} from "../../recovery-mnemocode/source/core/missing-codes-search.js";
import { askWallet, type WalletCheck } from "../../recovery-mnemocode/source/core/wallet-check.js";
import { counted, duration } from "../../recovery-mnemocode/source/core/search-plan.js";
import {
  assertStillRunning,
  SearchTurns,
} from "../../recovery-mnemocode/source/core/search-turns.js";
import {
  inWholeRange,
  integerRefusal,
  typedWholeNumber,
  wholeNumbersFrom,
  type WholeRange,
} from "../../recovery-mnemocode/source/core/typed-number.js";
import {
  readMnemoCodeBackup,
  recoverMnemoCodeLegacyLastWords,
  type MnemoCodePhraseWords,
} from "./mnemocode.js";
import type { WalletEvidenceRequest, WalletRecognition } from "./mnemocode-wallet.js";

export type { WalletEvidenceRequest } from "./mnemocode-wallet.js";

/** How the candidate list is protected, as the person chose it: MnemoCode's own choices. */
export type ListProtectionRequest = ListProtectionChoice;

export type MnemoCodeWordSearchKind = WordSearch["kind"] | "legacy-replacements";

/** Work allowed without another question, never a cutoff of the search space. */
export interface MnemoCodeSearchConsentSettings {
  readonly maxCandidates?: number;
}

/** Display retention and progress are independent of consent and candidate-file retention. */
export interface MnemoCodeDateSearchSettings extends MnemoCodeSearchConsentSettings {
  readonly maxShown?: number;
  readonly progressEvery?: number;
}

type SearchSettingsKind = "words" | "dates" | "missing-codes";
type SettingsFields = Partial<Record<keyof MnemoCodeDateSearchSettings, string>>;

const POSITIVE_COUNTS = Object.freeze(wholeNumbersFrom(1));
const CONSENT_COUNTS = Object.freeze({ ...POSITIVE_COUNTS, max: HARD_MAX_COMBINATIONS });

/** One admission rule for the page's typed overrides and the worker's numeric request. */
export class MnemoCodeSearchSettings {
  static readonly countRange = POSITIVE_COUNTS;
  static readonly consentRange = CONSENT_COUNTS;
  static readonly defaultMaxShown = MAX_SHOWN_MATCHES;
  readonly #request: MnemoCodeDateSearchSettings;

  private constructor(kind: SearchSettingsKind, request: MnemoCodeDateSearchSettings) {
    if (kind !== "dates" && (request.maxShown !== undefined || request.progressEvery !== undefined))
      throw new Error("Display and progress overrides apply only to a date search.");
    if (kind === "words" && request.maxCandidates !== undefined)
      throw new Error("A word search has no consent allowance override.");
    for (const [name, value] of Object.entries(request)) {
      if (value === undefined) continue;
      const range = name === "maxCandidates" ? CONSENT_COUNTS : POSITIVE_COUNTS;
      if (!inWholeRange(value, range)) throw new RangeError(integerRefusal(name, range));
    }
    this.#request = Object.freeze({ ...request });
  }

  static of(kind: SearchSettingsKind, request: object): MnemoCodeSearchSettings {
    const { maxCandidates, maxShown, progressEvery } = request as MnemoCodeDateSearchSettings;
    const { maxTries, keep } = request as { readonly maxTries?: unknown; readonly keep?: unknown };
    if (maxTries !== undefined) throw new Error("maxTries applies only to share recovery.");
    if (keep !== undefined)
      throw new Error("Candidate-file retention is set by the requested list, not an override.");
    return new MnemoCodeSearchSettings(kind, {
      ...(maxCandidates === undefined ? {} : { maxCandidates }),
      ...(maxShown === undefined ? {} : { maxShown }),
      ...(progressEvery === undefined ? {} : { progressEvery }),
    });
  }

  static parse(kind: SearchSettingsKind, fields: SettingsFields): MnemoCodeSearchSettings {
    const request: { -readonly [K in keyof MnemoCodeDateSearchSettings]: number } = {};
    for (const name of ["maxCandidates", "maxShown", "progressEvery"] as const) {
      const range = name === "maxCandidates" ? CONSENT_COUNTS : POSITIVE_COUNTS;
      const value = MnemoCodeSearchSettings.parseCount(fields[name], range, name);
      if (value !== undefined) request[name] = value;
    }
    return MnemoCodeSearchSettings.of(kind, request);
  }

  /** An optional typed count, also for a feature whose host supplies its core-owned bound. */
  static parseCount(text: string | undefined, range: WholeRange, name: string): number | undefined {
    const answer = text?.trim();
    return answer === undefined || answer === ""
      ? undefined
      : typedWholeNumber(answer, range, integerRefusal(name, range));
  }

  /** A feature supplies its core-owned maximum; the shared numeric reader owns admission. */
  static boundedCountRange(max: number): WholeRange {
    if (!inWholeRange(max, POSITIVE_COUNTS))
      throw new RangeError(integerRefusal("Allowance bound", POSITIVE_COUNTS));
    return Object.freeze({ ...POSITIVE_COUNTS, max });
  }

  get request(): MnemoCodeDateSearchSettings {
    return this.#request;
  }

  get maxShown(): number {
    return this.#request.maxShown ?? MAX_SHOWN_MATCHES;
  }
}

export const LEGACY_REPLACEMENTS_NOTE =
  "These are stored final-word replacements. Wallet evidence compares the replacements, not the original legacy phrases.";

/** How far a search has come. */
export interface SearchProgress {
  readonly checked: number;
  readonly total: number;
  readonly found: number;
  readonly matched: number;
  /** About how long the whole search takes on this computer, where it is long enough to say. */
  readonly takes?: string;
}

/** A search that takes longer than MnemoCode starts without asking: the question to ask first. */
export interface SearchQuestion {
  readonly question: string;
}

/** What a search of codes marked with ? found, as a page shows it (MissingCodesResult). */
export type MissingCodesOutcome =
  /**
   * The one set that fits: the codes whole, in their form; the dates to decode them with, when
   * the way had them; and the dates found where their digits were searched.
   */
  | {
      readonly kind: "found";
      readonly places: string;
      readonly codes: string;
      readonly dates?: string;
      readonly foundDates?: string;
    }
  | { readonly kind: "list"; readonly rows: readonly MissingCodesRow[] }
  | { readonly kind: "none"; readonly message: string }
  | { readonly kind: "several"; readonly count: number; readonly message: string };

/** One candidate to show: its number, its phrase, what is new in it, and the wallet's answer. */
export interface ShownCandidate {
  readonly number: number;
  readonly phrase: string;
  /** The words found at the forgotten places, or the dates that gave the phrase. */
  readonly found: string;
  readonly matched?: boolean;
  readonly path?: string;
}

/** A candidate list, encoded and protected, ready to be saved. */
export interface CandidateListFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly description: string;
  readonly encrypted: boolean;
  /** The records it holds: every candidate, or after a wallet check only the matches. */
  readonly records: number;
}

/** What became of the candidate list; without a list asked for, no list and both flags false. */
export interface ListOutcome {
  /** The candidate list, when one was asked for and the candidates fit. */
  readonly list?: CandidateListFile;
  /** Whether more candidates were found than one list holds; then no list is written. */
  readonly listFull: boolean;
  /**
   * Whether a list was asked for but no candidate went into it; then no list is written, as
   * MnemoCode's command line writes none.
   */
  readonly listEmpty: boolean;
}

/** What a host says when a list was asked for but none was written, in MnemoCode's words. */
export const NO_CANDIDATE_TO_SAVE = "No candidate to save, so no list was written.";
/** No list was asked for. */
const NO_LIST: ListOutcome = { listFull: false, listEmpty: false };
/** More candidates than one list holds, so none is written. */
const LIST_FULL: ListOutcome = { listFull: true, listEmpty: false };

export interface SearchOutcome extends ListOutcome {
  readonly shown: readonly ShownCandidate[];
  readonly count: number;
  readonly matched: number;
  readonly warning: string | undefined;
}

/** MnemoCode's outcome of a list in the form the page reads. */
function outcomeOf(written: WrittenList): ListOutcome {
  if (written.kind === "full") return LIST_FULL;
  if (written.kind === "empty") return { listFull: false, listEmpty: true };
  // The bytes are a new array of their own (CandidateListWriter), which a Blob takes as it is.
  const list = { ...written.list, bytes: written.list.bytes as Uint8Array<ArrayBuffer> };
  return { list, listFull: false, listEmpty: false };
}

/** A stop during list protection must also suppress and wipe the newly written bytes. */
function currentList(listed: ListOutcome, signal: AbortSignal): ListOutcome {
  if (signal.aborted) listed.list?.bytes.fill(0);
  assertStillRunning({ signal });
  return listed;
}

/**
 * Writes the candidate list for the Discovery Scanner as MnemoCode's command line saves one,
 * through MnemoCode's own writer: what a list needs is settled when the writer is made, before the
 * search, so that a key, a list passphrase or a BIP39 passphrase that no list can take is refused
 * at once instead of after a long search.
 */
export class CandidateListWriter {
  /** Candidates a search keeps for a list: one more than a list holds, to tell they are too many. */
  static readonly KEEP = LIST_KEEP;
  readonly #writer: ListWriter;

  /** `passphrase` is the BIP39 passphrase that the list stores for every record; "" stores none. */
  constructor(request: ListProtectionRequest, passphrase: string) {
    this.#writer = new ListWriter(protectionFor(request), passphrase);
  }

  /** The list of `entropies`, record N for candidate N; the entropies are wiped afterwards. */
  async write(entropies: Uint8Array[]): Promise<ListOutcome> {
    return outcomeOf(await this.#writer.write(entropies));
  }

  /** The list of `phrases`, English BIP39 phrases in their order, as write() makes it. */
  async writePhrases(phrases: readonly string[]): Promise<ListOutcome> {
    return outcomeOf(await this.#writer.writePhrases(phrases));
  }
}

/**
 * The BIP39 passphrase a list stores: the one typed for it, which the person gives also when no
 * wallet is compared, or else the wallet's.
 */
function listPassphraseOf(request: {
  readonly wallet?: WalletEvidenceRequest;
  readonly listPassphrase?: string;
}): string {
  return request.listPassphrase ?? request.wallet?.passphrase ?? "";
}

/** The writer of the list a search asks for, made before the search; undefined without a list. */
function listWriterOf(request: {
  readonly wallet?: WalletEvidenceRequest;
  readonly list?: ListProtectionRequest;
  readonly listPassphrase?: string;
}): CandidateListWriter | undefined {
  return request.list === undefined
    ? undefined
    : new CandidateListWriter(request.list, listPassphraseOf(request));
}

export class MnemoCodeSearches {
  readonly #recognition: WalletRecognition;
  readonly #fingerprint: PhraseFingerprint | undefined;

  /**
   * `recognition` compares each candidate with the wallet the person described; `fingerprint`,
   * the master fingerprint of a phrase, is needed for codes marked with ? only.
   */
  constructor(recognition: WalletRecognition, fingerprint?: PhraseFingerprint) {
    this.#recognition = recognition;
    this.#fingerprint = fingerprint;
  }

  /**
   * Codes marked with ? searched by one way of MnemoCode's MissingCodesSearch: the encoded
   * fingerprint, the wallet with the dates (which may hold ? where the codes were masked), or every
   * candidate listed. A search that MnemoCode would ask about first is asked about here too.
   */
  async missingCodes(
    request: MnemoCodeSearchConsentSettings & {
      /** The codes as typed, a record's header included. */
      readonly text: string;
      /** Declared phrase length; omitted means read every typed code. */
      readonly words?: MnemoCodePhraseWords;
      readonly format: EncodedFormat;
      readonly mode: MaskingMode;
      readonly way: MissingCodesWay;
      readonly encodedFingerprint?: string;
      readonly wallet?: WalletEvidenceRequest;
      /** The dates as typed, for codes that were masked. */
      readonly dates?: string;
      /** The person agreed to a search longer than MnemoCode starts without asking. */
      readonly confirmed?: boolean;
    },
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<MissingCodesOutcome | SearchQuestion> {
    const settings = MnemoCodeSearchSettings.of("missing-codes", request).request;
    if (request.way === "list" && settings.maxCandidates !== undefined)
      throw new Error(
        "A consent allowance applies to fingerprint or wallet search, not the bounded list.",
      );
    assertStillRunning({ signal });
    if (this.#fingerprint === undefined)
      throw new Error("This search needs the master fingerprint of a phrase.");
    const codes = readMnemoCodeBackup(request.text, false, request.words)
      .missingCodes(request.format)
      .withMode(request.mode);
    const search = new MissingCodesSearch(codes, this.#fingerprint);
    if (!search.fits(request.way))
      throw new Error(
        request.way === "list"
          ? `A list holds at most ${MissingCodesSearch.MAX_LISTED} candidates; these codes have about ${counted(codes.expected, "candidate")}.`
          : "The encoded fingerprint cannot tell these codes: they keep no checksum.",
      );
    const way = this.#way(search, request);
    const plan = await way.plan(settings.maxCandidates);
    assertStillRunning({ signal });
    if (plan.ask && request.confirmed !== true) return { question: plan.question() };
    const result = await way.run({
      signal,
      onProgress: ({ checked, total, found }) =>
        onProgress({ checked, total, found, matched: found }),
    });
    assertStillRunning({ signal });
    return missingCodesOutcome(MissingCodesSearch.placesText(codes), result);
  }

  /** The way the person chose, with its answers. */
  #way(
    search: MissingCodesSearch,
    request: Parameters<MnemoCodeSearches["missingCodes"]>[0],
  ): MissingCodesWaySearch {
    const wordCount = search.codes.wordCount;
    if (request.way === "encoded")
      return search.byEncodedFingerprint(parseMasterFingerprint(request.encodedFingerprint ?? ""));
    if (request.way === "wallet") {
      const walletCheck = this.#walletCheck(request.wallet);
      if (walletCheck === undefined) throw new Error("Describe the wallet to compare with.");
      const dates = search.needsDates
        ? DatesAnswer.parse(request.dates ?? "", { patterns: true, wordCount })
        : undefined;
      return search.byWallet(walletCheck, dates);
    }
    const dates = search.needsDates
      ? DatesAnswer.parse(request.dates ?? "", { patterns: false, wordCount }).known
      : [];
    return search.listed(dates);
  }

  /** The candidates of a phrase with forgotten words, or with one word missing. */
  async words(
    request: {
      readonly text: string;
      readonly kind: MnemoCodeWordSearchKind;
      readonly wallet?: WalletEvidenceRequest;
      readonly list?: ListProtectionRequest;
      /** The BIP39 passphrase that the list stores, also when no wallet is compared. */
      readonly listPassphrase?: string;
    },
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<SearchOutcome> {
    MnemoCodeSearchSettings.of("words", request);
    assertStillRunning({ signal });
    if (request.kind === "legacy-replacements") return this.#legacy(request, onProgress, signal);
    const writer = listWriterOf(request);
    const search = WordCandidateSearch.parse(request.text, request.kind);
    const total = search.expected.count;
    const result = await search.run({
      walletCheck: this.#walletCheck(request.wallet),
      // As recover-word: every candidate up to MnemoCode's display limit, with no option.
      maxShown: MAX_SHOWN_CANDIDATES,
      keep: writer === undefined ? 0 : MAX_CANDIDATE_RECORDS,
      // An overflow only drops the list; the table and the wallet check go on.
      onListFull: () => undefined,
      onProgress: ({ checked, found, matched }) => onProgress({ checked, total, found, matched }),
      signal,
    });
    // After an overflow the search has wiped and dropped the entropies it kept.
    const listed =
      writer === undefined
        ? NO_LIST
        : result.listFull
          ? LIST_FULL
          : await writer.write(result.entropies);
    return {
      ...currentList(listed, signal),
      shown: result.shown.map(({ candidate, match }) => ({
        number: candidate.number,
        phrase: candidate.phrase,
        found: search
          .placesOf(candidate)
          .map((place) => `${place + 1}: ${englishWordlist[candidate.words[place]!]}`)
          .join(", "),
        ...(match === undefined
          ? {}
          : { matched: match.matched, ...(match.path === undefined ? {} : { path: match.path }) }),
      })),
      count: result.count,
      matched: result.matched,
      warning: result.warning,
    };
  }

  /** The CLI's replacement comparison: a fixed list, no candidate-file export or original recovery. */
  async #legacy(
    request: Parameters<MnemoCodeSearches["words"]>[0],
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<SearchOutcome> {
    if (request.list !== undefined)
      throw new Error("Legacy final-word replacements are stored phrases: no candidate list.");
    const candidates = recoverMnemoCodeLegacyLastWords(request.text);
    const check = this.#walletCheck(request.wallet);
    const tally = new MatchTally();
    const shown: ShownCandidate[] = [];
    const turns = new SearchTurns(signal);
    for (const candidate of candidates) {
      await turns.due();
      const match = check === undefined ? undefined : await askWallet(check, candidate.mnemonic);
      assertStillRunning({ signal });
      tally.add(match);
      shown.push({
        number: shown.length + 1,
        phrase: candidate.mnemonic,
        found:
          `${candidate.word} · word number ${candidate.wordIndex} · checksum ${candidate.checksumBits} · ` +
          (candidate.preservesLegacyEntropy ? "preserved" : "alternative"),
        ...(match === undefined ? {} : { matched: match.matched }),
        ...(match?.path === undefined ? {} : { path: match.path }),
      });
      onProgress({
        checked: shown.length,
        total: candidates.length,
        found: shown.length,
        matched: tally.matched,
      });
    }
    assertStillRunning({ signal });
    return {
      ...NO_LIST,
      shown,
      count: candidates.length,
      matched: tally.matched,
      warning: tally.warning,
    };
  }

  /** The phrases that the dates with forgotten digits allow, compared with the wallet. */
  async dates(
    request: MnemoCodeDateSearchSettings & {
      readonly indexes: readonly number[];
      readonly mode: MaskingMode;
      readonly dates: string;
      readonly wallet?: WalletEvidenceRequest;
      readonly list?: ListProtectionRequest;
      /** The BIP39 passphrase that the list stores, also when no wallet is compared. */
      readonly listPassphrase?: string;
      /** The person agreed to a search longer than MnemoCode starts without asking. */
      readonly confirmed?: boolean;
    },
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<SearchOutcome | SearchQuestion> {
    const settings = MnemoCodeSearchSettings.of("dates", request);
    assertStillRunning({ signal });
    const writer = listWriterOf(request);
    const dates = DatesAnswer.parse(request.dates, {
      patterns: true,
      wordCount: request.indexes.length,
    });
    dates.assertIncomplete();
    if (request.mode === "direct") throw new Error("Direct mode has no dates to search.");
    const search = new DateSearch({
      indexes: request.indexes,
      dates,
      mode: request.mode,
      walletCheck: this.#walletCheck(request.wallet),
      maxShown: settings.maxShown,
      keep: writer === undefined ? 0 : CandidateListWriter.KEEP,
    });
    // Consent changes the question only; the core still searches every assessed combination.
    const plan = search.plan(await search.pace(), settings.request.maxCandidates);
    assertStillRunning({ signal });
    if (plan.ask && request.confirmed !== true) return { question: plan.question() };
    // MnemoCode's plan says when the time is shown with the progress (TELL_SECONDS).
    const takes = plan.tell ? { takes: duration(plan.seconds) } : {};
    const total = search.combinations;
    onProgress({ checked: 0, total, found: 0, matched: 0, ...takes });
    const result = await search.run({
      ...(settings.request.progressEvery === undefined
        ? {}
        : { progressEvery: settings.request.progressEvery }),
      onProgress: (progress) =>
        onProgress({
          checked: progress.checked,
          total: progress.total,
          found: progress.found,
          matched: progress.matched,
          ...takes,
        }),
      signal,
    });
    const listed = writer === undefined ? NO_LIST : await writer.writePhrases(result.kept);
    return {
      ...currentList(listed, signal),
      shown: result.shown.map((match, index) => ({
        number: index + 1,
        phrase: match.mnemonic,
        found: match.dates,
        ...(request.wallet === undefined ? {} : { matched: true }),
        ...(match.evidence === undefined ? {} : { path: match.evidence }),
      })),
      count: result.checksumValid,
      matched: result.matchCount,
      warning: undefined,
    };
  }

  #walletCheck(wallet: WalletEvidenceRequest | undefined): WalletCheck | undefined {
    return wallet === undefined ? undefined : this.#recognition.checkFor(wallet);
  }
}

/** A result of MnemoCode's search as plain data, which a worker can send: the codes as text. */
function missingCodesOutcome(places: string, result: MissingCodesResult): MissingCodesOutcome {
  if (result.kind !== "found") return result;
  return {
    kind: "found",
    places,
    codes: result.backup.text(),
    // Codes that were not masked are decoded without dates.
    ...(result.dates === undefined || result.dates.length === 0
      ? {}
      : { dates: result.dates.map(formatDate).join(" ") }),
    ...(result.foundDates === undefined ? {} : { foundDates: result.foundDates }),
  };
}
