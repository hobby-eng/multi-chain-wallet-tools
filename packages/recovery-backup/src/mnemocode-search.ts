// MnemoCode's searches as the Deriver runs them in a worker: the forgotten words of a phrase, the
// forgotten digits of dates, and codes marked with ?, each compared with the wallet the person
// described, and on request the candidate list for the Discovery Scanner, protected as the person
// chose. MnemoCode's WebAssembly does the search (Recovery and RecoverySearch): it times its public
// pace sample, says when it asks first, and is stepped here until it ends. Cancel terminates the
// worker, which frees all it kept.
import { mnemocode, type MnemoCodeBinding } from "./mnemocode-engine.js";
import type { EncodedFormat, MaskingMode } from "./mnemocode-facts.js";
import { mnemoCodeCodesText, type MnemoCodePhraseWords } from "./mnemocode.js";
import { walletAnswer, walletRecovery, type WalletEvidenceRequest } from "./mnemocode-wallet.js";

export type { WalletEvidenceRequest } from "./mnemocode-wallet.js";

/** How the candidate list is protected, as the person chose it. */
export type ListProtectionRequest =
  | { readonly kind: "key"; readonly recipient: string }
  | { readonly kind: "passphrase"; readonly passphrase: string }
  | { readonly kind: "none" };

/** A search of words: those marked with ?, one missing anywhere, or a legacy last word's replacements. */
export type MnemoCodeWordSearchKind = "unknown-words" | "missing-word" | "legacy-replacements";

/** Work allowed without another question, and what a date search shows and reports. */
export interface MnemoCodeDateSearchSettings {
  /** Combinations allowed without asking; MnemoCode's twelve hours where left out. */
  readonly maxCandidates?: number;
  /** Candidates shown; MnemoCode's default where left out. */
  readonly maxShown?: number;
  /** Combinations between progress updates. */
  readonly progressEvery?: number;
}

/** The typed limits, whole numbers from 1, or left blank. */
export class MnemoCodeSearchSettings {
  /** MnemoCode's default of the candidates a date search shows. */
  static readonly defaultMaxShown = 100;

  /** A typed count: undefined where blank; refused unless a whole number from 1. */
  static parseCount(text: string | undefined, name: string): number | undefined {
    const answer = text?.trim() ?? "";
    if (answer === "") return undefined;
    const value = /^\d+$/u.test(answer) ? Number(answer) : Number.NaN;
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(`${name} must be a whole number from 1.`);
    return value;
  }
}

/** The legacy replacements are phrases stored in place of the old one. */
export const LEGACY_REPLACEMENTS_NOTE =
  "These are stored final-word replacements. Wallet evidence compares the replacements, not the original legacy phrases.";

/** How far a search has come. */
export interface SearchProgress {
  readonly checked: number;
  readonly total: number;
  readonly found: number;
  readonly matched: number;
}

/** A search that MnemoCode asks about first: the question to ask. */
export interface SearchQuestion {
  readonly question: string;
}

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
  readonly records: number;
}

/** What became of the candidate list; without a list asked for, no list and both flags false. */
export interface ListOutcome {
  readonly list?: CandidateListFile;
  /** More candidates were found than one list holds; then no list is written. */
  readonly listFull: boolean;
  /** A list was asked for but no candidate went into it; then no list is written. */
  readonly listEmpty: boolean;
}

/** What a host says when a list was asked for but none was written, in MnemoCode's words. */
export const NO_CANDIDATE_TO_SAVE = "No candidate to save, so no list was written.";

export interface SearchOutcome extends ListOutcome {
  readonly shown: readonly ShownCandidate[];
  readonly count: number;
  readonly matched: number;
  readonly warning: string | undefined;
}

/** One candidate of a listed search of marked codes: the codes, the phrase and its fingerprint. */
export interface MissingCodesRow {
  readonly codes: string;
  readonly phrase: string;
  readonly fingerprint: string;
}

/** The ways a search of marked codes tells the right codes. */
export type MissingCodesWay = "encoded" | "wallet" | "list";

/** What a search of codes marked with ? found, as a page shows it. */
export type MissingCodesOutcome =
  | {
      readonly kind: "found";
      /** Which codes were filled in, as "Code 3". */
      readonly places: string;
      readonly codes: string;
      /** The dates to decode the codes with, where the way had them. */
      readonly dates?: string;
      readonly others?: number;
      readonly warning?: string;
    }
  | { readonly kind: "list"; readonly rows: readonly MissingCodesRow[] }
  | { readonly kind: "none"; readonly message: string }
  | { readonly kind: "several"; readonly count: number; readonly message: string };

/** Candidates a search keeps for a list: one more than a list holds, to tell they are too many. */
const LIST_KEEP = 2 ** 19 + 1;
/** Candidates tried between progress reports where the person set none. */
export const STEP_WORK = 4_096;

const DESCRIPTIONS: Readonly<Record<ListProtectionRequest["kind"], string>> = {
  key: "encrypted to the Scanner's key",
  passphrase: "encrypted with the passphrase",
  none: "NOT encrypted",
};

/** A stepped search of MnemoCode's: of words or dates, or a restore or a repair of shares. */
export type RecoverySearch = ReturnType<
  ReturnType<MnemoCodeBinding["Recovery"]["withoutWallet"]>["dateSearch"]
>;
type Search = RecoverySearch;
type Result = ReturnType<Search["finish"]>;

/** Times each part of a search's public pace sample, as MnemoCode asks the page to. */
export function pacedSeconds(search: RecoverySearch): Float64Array {
  const seconds = new Float64Array(search.paceParts);
  for (let part = 0; part < seconds.length; part++) {
    const started = performance.now();
    search.paceSample(part);
    seconds[part] = (performance.now() - started) / 1000;
  }
  return seconds;
}

/**
 * Steps a begun search to its end, `every` candidates a step, reporting each step; the search is
 * consumed, its result returned for the caller to free.
 */
export function stepToEnd(
  search: RecoverySearch,
  every: number,
  onProgress: (progress: SearchProgress) => void,
): Result {
  for (;;) {
    using progress = search.step(every);
    onProgress({
      checked: progress.checked,
      total: progress.total ?? progress.checked,
      found: progress.found,
      matched: progress.matched,
    });
    if (!progress.running) break;
  }
  return search.finish();
}

/**
 * Runs `search` to its end, asking first where MnemoCode says so and the person has not agreed;
 * the search is consumed, its result returned for the caller to free.
 */
function run(
  search: Search,
  options: {
    readonly limit?: number | undefined;
    readonly confirmed?: boolean | undefined;
    readonly every?: number | undefined;
    readonly onProgress: (progress: SearchProgress) => void;
  },
): Result | SearchQuestion {
  const seconds = pacedSeconds(search);
  {
    using question = search.plan(seconds, options.limit ?? Number.NaN);
    if (question?.ask === true && options.confirmed !== true) {
      const asked = { question: question.question };
      search.free();
      return asked;
    }
  }
  search.begin(seconds);
  return stepToEnd(search, options.every ?? STEP_WORK, options.onProgress);
}

/** The list a search kept, protected as asked; the list bytes are wiped once protected. */
function listed(
  binding: MnemoCodeBinding,
  result: Result,
  request: ListProtectionRequest | undefined,
  passphrase: string,
): ListOutcome {
  if (request === undefined) return { listFull: false, listEmpty: false };
  if (result.listFull) return { listFull: true, listEmpty: false };
  const list = result.candidateList(passphrase);
  if (list === undefined) return { listFull: false, listEmpty: true };
  try {
    const secret =
      request.kind === "key"
        ? request.recipient
        : request.kind === "passphrase"
          ? request.passphrase
          : undefined;
    const bytes = binding.protectList(list, request.kind, secret) as Uint8Array<ArrayBuffer>;
    return {
      list: {
        bytes,
        description: DESCRIPTIONS[request.kind],
        encrypted: request.kind !== "none",
        records: result.count,
      },
      listFull: false,
      listEmpty: false,
    };
  } finally {
    list.fill(0);
  }
}

/** The words at the places that the typed phrase left open, as "3: zoo". */
function foundWords(typed: string, phrase: string, kind: MnemoCodeWordSearchKind): string {
  const words = phrase.split(" ");
  const given = typed.trim().split(/\s+/u);
  if (kind === "missing-word") {
    const place = words.findIndex((word, at) => word !== given[at]);
    return place === -1 ? "" : `${place + 1}: ${words[place]}`;
  }
  return given
    .flatMap((word, at) => (word.includes("?") ? [`${at + 1}: ${words[at] ?? ""}`] : []))
    .join(", ");
}

/** Which codes of `text` are marked, as "Code 3" or "Codes 3, 5". */
function markedPlaces(text: string): string {
  const body = text.trim().replace(/^MNC1:[a-z-]+:[a-z-]+:/u, "");
  const places = body.split(/[\s,;]+/u).flatMap((code, at) => (code.includes("?") ? [at + 1] : []));
  return places.length === 1 ? `Code ${places[0]}` : `Codes ${places.join(", ")}`;
}

export class MnemoCodeSearches {
  readonly #binding: MnemoCodeBinding;

  constructor(binding: MnemoCodeBinding = mnemocode()) {
    this.#binding = binding;
  }

  /**
   * Codes marked with ?, searched by one way: the encoded fingerprint, the wallet with the dates
   * (which may hold ? where the codes were masked), or every candidate listed.
   */
  missingCodes(
    request: {
      readonly text: string;
      readonly words?: MnemoCodePhraseWords;
      readonly format: EncodedFormat;
      readonly mode: MaskingMode;
      readonly way: MissingCodesWay;
      readonly encodedFingerprint?: string;
      readonly wallet?: WalletEvidenceRequest;
      readonly dates?: string;
      readonly confirmed?: boolean;
      readonly maxCandidates?: number;
    },
    onProgress: (progress: SearchProgress) => void,
  ): MissingCodesOutcome | SearchQuestion {
    using recovery = walletRecovery(this.#binding, request.wallet);
    const search =
      request.way === "encoded"
        ? recovery.markedByFingerprint(
            mnemoCodeCodesText(request.text),
            request.format,
            request.mode,
            request.encodedFingerprint ?? "",
          )
        : recovery.markedSearch(
            mnemoCodeCodesText(request.text),
            request.format,
            request.mode,
            request.dates,
            request.way === "list",
          );
    const ran = run(search, {
      limit: request.maxCandidates,
      confirmed: request.confirmed,
      onProgress,
    });
    if ("question" in ran) return ran;
    using result = ran;
    switch (result.kind) {
      case "found": {
        const dates = result.dates(0);
        return {
          kind: "found",
          places: markedPlaces(request.text),
          codes: result.codes(0) ?? "",
          ...(dates === undefined || dates === "" ? {} : { dates }),
          ...(result.others === undefined ? {} : { others: result.others }),
          ...(result.warning === undefined ? {} : { warning: result.warning }),
        };
      }
      case "list":
        return {
          kind: "list",
          rows: Array.from({ length: result.rows }, (_, at) => ({
            codes: result.codes(at) ?? "",
            phrase: result.phrase(at) ?? "",
            fingerprint: result.fingerprint(at) ?? "",
          })),
        };
      case "several":
        return { kind: "several", count: result.count, message: result.message ?? "" };
      default:
        return { kind: "none", message: result.message ?? "" };
    }
  }

  /** The candidates of a phrase with forgotten words, one word missing, or a legacy last word's. */
  words(
    request: {
      readonly text: string;
      readonly kind: MnemoCodeWordSearchKind;
      readonly wallet?: WalletEvidenceRequest;
      readonly list?: ListProtectionRequest;
      /** The BIP39 passphrase that the list stores, also when no wallet is compared. */
      readonly listPassphrase?: string;
    },
    onProgress: (progress: SearchProgress) => void,
  ): SearchOutcome {
    if (request.kind === "legacy-replacements") return this.#legacy(request, onProgress);
    using recovery = walletRecovery(this.#binding, request.wallet);
    const search = recovery.wordSearch(
      request.text,
      request.kind === "missing-word",
      Number.NaN,
      request.list === undefined ? 0 : LIST_KEEP,
    );
    const ran = run(search, { onProgress });
    if ("question" in ran) throw new Error(ran.question);
    using result = ran;
    const shown = this.#shown(result, (phrase) => foundWords(request.text, phrase, request.kind));
    return {
      ...listed(
        this.#binding,
        result,
        request.list,
        request.listPassphrase ?? request.wallet?.passphrase ?? "",
      ),
      // With a wallet every row says whether it matched, also where none did.
      shown:
        request.wallet === undefined
          ? shown
          : shown.map((row) => ({ ...row, matched: row.matched === true })),
      count: result.count,
      matched: result.matched,
      warning: result.warning,
    };
  }

  /** The legacy last word's replacements, each compared with the wallet: no candidate list. */
  #legacy(
    request: Parameters<MnemoCodeSearches["words"]>[0],
    onProgress: (progress: SearchProgress) => void,
  ): SearchOutcome {
    if (request.list !== undefined)
      throw new Error("Legacy final-word replacements are stored phrases: no candidate list.");
    using replacements = this.#binding.legacyLastWords(request.text);
    const shown: ShownCandidate[] = [];
    let matched = 0;
    let warning: string | undefined;
    for (let at = 0; at < replacements.count; at++) {
      const phrase = replacements.phrase(at) ?? "";
      const word = phrase.split(" ").at(-1) ?? "";
      using row = this.#binding.wordLookup("word", word);
      const match = this.#compare(request.wallet, phrase);
      if (match?.matched === true) matched += 1;
      warning ??= match?.warning;
      shown.push({
        number: at + 1,
        phrase,
        found: `${word} · word number ${row.index} · ${replacements.keepsEntropy(at) ? "preserved" : "alternative"}`,
        ...(match === undefined ? {} : { matched: match.matched }),
        ...(match?.path === undefined ? {} : { path: match.path }),
      });
      onProgress({ checked: at + 1, total: replacements.count, found: at + 1, matched });
    }
    return {
      listFull: false,
      listEmpty: false,
      shown,
      count: replacements.count,
      matched,
      warning,
    };
  }

  /** The wallet's answer for `phrase`, or none without a wallet. */
  #compare(
    wallet: WalletEvidenceRequest | undefined,
    phrase: string,
  ): { matched: boolean; path?: string; warning?: string } | undefined {
    return wallet === undefined ? undefined : walletAnswer(this.#binding, wallet, phrase);
  }

  /** The phrases that dates with forgotten digits allow, compared with the wallet. */
  dates(
    request: MnemoCodeDateSearchSettings & {
      /** The codes as typed, a record's header included. */
      readonly codes: string;
      readonly format: EncodedFormat;
      readonly mode: MaskingMode;
      readonly dates: string;
      readonly wallet?: WalletEvidenceRequest;
      readonly list?: ListProtectionRequest;
      readonly listPassphrase?: string;
      readonly confirmed?: boolean;
    },
    onProgress: (progress: SearchProgress) => void,
  ): SearchOutcome | SearchQuestion {
    if (request.mode === "direct") throw new Error("Direct mode has no dates to search.");
    using recovery = walletRecovery(this.#binding, request.wallet);
    // MnemoCode's searches read the codes themselves; a record named their form and mode.
    const search = recovery.dateSearch(
      mnemoCodeCodesText(request.codes),
      request.format,
      request.mode,
      request.dates,
      request.maxShown ?? Number.NaN,
      request.list === undefined ? Number.NaN : LIST_KEEP,
    );
    const ran = run(search, {
      limit: request.maxCandidates,
      confirmed: request.confirmed,
      every: request.progressEvery,
      onProgress,
    });
    if ("question" in ran) return ran;
    using result = ran;
    return {
      ...listed(
        this.#binding,
        result,
        request.list,
        request.listPassphrase ?? request.wallet?.passphrase ?? "",
      ),
      shown: this.#shown(result, (_, at) => result.dates(at) ?? ""),
      count: result.count,
      matched: result.matched,
      warning: result.warning,
    };
  }

  /** The rows of a result as candidates to show. */
  #shown(result: Result, found: (phrase: string, at: number) => string): ShownCandidate[] {
    return Array.from({ length: result.rows }, (_, at) => {
      const phrase = result.phrase(at) ?? "";
      // A row the wallet did not match has no place, or an empty one.
      const path = result.matchedAt(at) || undefined;
      const number = result.number(at);
      return {
        number: number === undefined || number === 0 ? at + 1 : number,
        phrase,
        found: found(phrase, at),
        ...(result.matched > 0 || path !== undefined ? { matched: path !== undefined } : {}),
        ...(path === undefined ? {} : { path }),
      };
    });
  }
}
