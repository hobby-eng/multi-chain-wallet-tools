// MnemoCode's Shamir shares as the Deriver offers them: a split of a seed phrase, plain or masked
// with MnemoCode Seedshift, into one group of SSKR shares written in the form chosen; the restore
// of a phrase from shares, with unreadable elements marked ? repaired by the shares together and
// forgotten date digits searched, and on request the candidate list of its phrases for the
// Discovery Scanner; and the repair of damaged shares, which come back whole without the phrase
// being shown. MnemoCode's WebAssembly does each (SplitShares, Recovery.restoreShares and
// repairShares); a restore and a repair run in a worker, stepped as a search is.
import { mnemocode, type MnemoCodeBinding } from "./mnemocode-engine.js";
import { MNEMOCODE_DECODE_ENTRY } from "./mnemocode.js";
import type { ShareFormat } from "./mnemocode-facts.js";
import {
  NO_CANDIDATE_TO_SAVE,
  pacedSeconds,
  STEP_WORK,
  stepToEnd,
  type ListOutcome,
  type ListProtectionRequest,
  type RecoverySearch,
  type SearchProgress,
} from "./mnemocode-search.js";
import { walletRecovery, type WalletEvidenceRequest } from "./mnemocode-wallet.js";

export type ShareMode = "direct" | "seedshift";

export interface SplitRequest {
  readonly phrase: string;
  readonly mode: ShareMode;
  /** The Seedshift dates as typed; none without Seedshift. */
  readonly dates: string | undefined;
  readonly threshold: number;
  readonly count: number;
  readonly form: ShareFormat;
}

export interface SplitOutcome {
  /** Each share written in the form chosen, share 1 first. */
  readonly shares: readonly string[];
  /** The same shares as SSKR UR records, as share cards take them. */
  readonly records: readonly string[];
  /** The phrase that was split. */
  readonly original: string;
  /** The note the shares are kept with, saved as each packaging says. */
  readonly keepingNote: (packaging: "file" | "folder" | "files" | "folders" | "pages") => string;
}

/** Limits a restore goes by, as the person set them; MnemoCode's defaults where left out. */
export interface SearchLimits {
  /** Share combinations tried without a question. */
  readonly shares?: number;
  /** Date combinations tried without a question. */
  readonly dates?: number;
}

/** The shares as typed in one field, and what to do with them. */
export interface ShareRequest {
  /** The shares, one per line or separated by ;, with ? for each unreadable element. */
  readonly answer: string;
  readonly mode: ShareMode;
  /** The Seedshift dates, with ? for a forgotten digit; none without Seedshift. */
  readonly dates: string | undefined;
  /** Compares each phrase with the wallet; without it every phrase is kept. */
  readonly wallet?: WalletEvidenceRequest;
  /** Whether the person said yes to the long search that a question announced. */
  readonly confirmed: boolean;
  readonly limits?: SearchLimits;
}

/** A restore, which can also write the candidate list of its phrases. */
export interface RestoreRequest extends ShareRequest {
  readonly list?: ListProtectionRequest;
  /** The BIP39 passphrase that the list stores, also when no wallet is compared. */
  readonly listPassphrase?: string;
}

/** A phrase that shares restored, with what a repair filled in. */
export interface RestoredPhrase {
  readonly mnemonic: string;
  /** The dates that a date search found for it. */
  readonly dates?: string;
  /** Where the wallet matched in a date search. */
  readonly matchedAt?: string;
  /** What a repair filled in, a line for each share. */
  readonly repairs: readonly string[];
}

/** A share written again, by its place among those typed, with its SSKR UR record. */
export interface RepairedShare {
  readonly number: number;
  readonly text: string;
  readonly format: ShareFormat;
  readonly record: string;
}

/** A set of shares that fits, shown with the original fingerprint of its phrase. */
export interface ShareVariant {
  readonly fingerprint: string | undefined;
  readonly shares: readonly RepairedShare[];
  readonly repairs: readonly string[];
}

/** Lines shown with every outcome: the assessment of marked shares and the notes on copies. */
interface Shown {
  readonly lines: readonly string[];
}

/** An outcome that ends a job without a result: a trouble to say, or a question to ask first. */
export type Stop =
  | (Shown & { readonly kind: "stopped" })
  | (Shown & { readonly kind: "trouble"; readonly message: string })
  | (Shown & { readonly kind: "question"; readonly question: string });

export type RestoreOutcome =
  | Stop
  | (Shown &
      ListOutcome & {
        readonly kind: "phrases";
        readonly phrases: readonly RestoredPhrase[];
        readonly notes: readonly string[];
        /** What the wallet check said of the matches, such as that a fingerprint is only a filter. */
        readonly warnings: readonly string[];
      });

export type RepairOutcome =
  | Stop
  | (Shown & {
      readonly kind: "shares";
      readonly shares: readonly RepairedShare[];
      /** The one form every share is written in; undefined when they keep different forms. */
      readonly form: ShareFormat | undefined;
      readonly repairs: readonly string[];
      readonly notes: readonly string[];
      readonly warning?: string | undefined;
    })
  | (Shown & {
      readonly kind: "variants";
      readonly message: string;
      readonly variants: readonly ShareVariant[];
      readonly warning?: string | undefined;
    });

/** Candidates a restore keeps for a list: one more than a list holds, to tell they are too many. */
const LIST_KEEP = 2 ** 19 + 1;
const LIST_DESCRIPTIONS: Readonly<Record<ListProtectionRequest["kind"], string>> = {
  key: "encrypted to the Scanner's key",
  passphrase: "encrypted with the passphrase",
  none: "NOT encrypted",
};
/** How a restore whose phrases are more than one list holds is narrowed. */
const TOO_MANY_FOR_LIST =
  "More phrases fit than one list holds, so no list was written: give the wallet's fingerprint, or fewer ? in the shares or dates.";

/** The shares typed in one answer: one per line, or apart by ;. */
export function typedShares(answer: string): string[] {
  return answer
    .split(/;|\r?\n/u)
    .map((share) => share.trim())
    .filter((share) => share !== "");
}

/** Splits a phrase, masked first with MnemoCode Seedshift if chosen, into checked shares. */
export function splitShares(request: SplitRequest): SplitOutcome {
  const binding = mnemocode();
  const split = binding.SplitShares.split(
    request.phrase,
    request.mode === "seedshift" ? request.dates : undefined,
    request.mode,
    request.threshold,
    request.count,
    request.form,
  );
  const shares = split.shares();
  return {
    shares,
    records: shares.map((share) => binding.writeShare(share, "ur")),
    original: request.phrase,
    keepingNote: (packaging) => split.keepingNote(packaging),
  };
}

type Result = ReturnType<RecoverySearch["finish"]>;

/** Runs a restore or a repair to its end, its public pace sample timed first. */
function run(search: RecoverySearch, onProgress: (progress: SearchProgress) => void): Result {
  search.begin(pacedSeconds(search));
  return stepToEnd(search, STEP_WORK, onProgress);
}

/** A result that ends a job without phrases or shares, if it is one. */
function stopOf(result: Result): Stop | undefined {
  const lines = result.lines;
  switch (result.kind) {
    case "stopped":
      return { kind: "stopped", lines };
    case "question":
      return { kind: "question", question: result.message ?? "", lines };
    case "trouble":
    case "few":
    case "none":
      return { kind: "trouble", message: result.message ?? "", lines };
    default:
      return undefined;
  }
}

/** The repaired shares of the rows `at` of `result`. */
function repaired(result: Result, rows: readonly number[]): RepairedShare[] {
  return rows.map((at) => ({
    number: result.number(at) ?? at + 1,
    text: result.share(at) ?? "",
    format: (result.format(at) ?? "ur") as ShareFormat,
    record: result.record(at) ?? "",
  }));
}

/** The restores and repairs of a worker, by MnemoCode's search of shares. */
export class MnemoCodeShareJobs {
  readonly #binding: MnemoCodeBinding;

  constructor(binding: MnemoCodeBinding = mnemocode()) {
    this.#binding = binding;
  }

  /** The recovery of `request`, with its limits set. */
  #recovery(request: ShareRequest, keep: number) {
    const recovery = walletRecovery(this.#binding, request.wallet);
    recovery.setRestoreLimits(
      keep,
      request.limits?.shares ?? Number.NaN,
      request.limits?.dates ?? Number.NaN,
      request.confirmed,
    );
    return recovery;
  }

  /**
   * The phrases that typed shares restore: complete shares checked as a set, marked ones repaired
   * together, then unmasked with the dates, searched where a date holds ?, and compared with the
   * wallet if one is given. With a list asked for, every phrase goes into it.
   */
  restore(request: RestoreRequest, onProgress: (progress: SearchProgress) => void): RestoreOutcome {
    using recovery = this.#recovery(request, request.list === undefined ? Number.NaN : LIST_KEEP);
    using result = run(
      recovery.restoreShares(
        typedShares(request.answer),
        request.mode,
        request.mode === "seedshift" ? request.dates : undefined,
        MNEMOCODE_DECODE_ENTRY,
      ),
      onProgress,
    );
    const stop = stopOf(result);
    if (stop !== undefined) return stop;
    const listed = this.#listed(result, request);
    const notes = [
      ...result.notes,
      ...(listed.listFull ? [TOO_MANY_FOR_LIST] : listed.listEmpty ? [NO_CANDIDATE_TO_SAVE] : []),
    ];
    return {
      ...listed,
      kind: "phrases",
      phrases: Array.from({ length: result.rows }, (_, at) => {
        const dates = result.dates(at);
        const matchedAt = result.matchedAt(at) || undefined;
        return {
          mnemonic: result.phrase(at) ?? "",
          ...(dates === undefined || dates === "" ? {} : { dates }),
          ...(matchedAt === undefined ? {} : { matchedAt }),
          repairs: result.repairs(at) ?? [],
        };
      }),
      notes,
      warnings: result.warning === undefined ? [] : [result.warning],
      lines: result.lines,
    };
  }

  /** The list of a restore's phrases, protected as asked. */
  #listed(result: Result, request: RestoreRequest): ListOutcome {
    if (request.list === undefined) return { listFull: false, listEmpty: false };
    if (result.listFull) return { listFull: true, listEmpty: false };
    const list = result.candidateList(request.listPassphrase ?? request.wallet?.passphrase ?? "");
    if (list === undefined) return { listFull: false, listEmpty: true };
    try {
      const protection = request.list;
      const secret =
        protection.kind === "key"
          ? protection.recipient
          : protection.kind === "passphrase"
            ? protection.passphrase
            : undefined;
      return {
        list: {
          bytes: this.#binding.protectList(
            list,
            protection.kind,
            secret,
          ) as Uint8Array<ArrayBuffer>,
          description: LIST_DESCRIPTIONS[protection.kind],
          encrypted: protection.kind !== "none",
          records: result.rows,
        },
        listFull: false,
        listEmpty: false,
      };
    } finally {
      list.fill(0);
    }
  }

  /**
   * Damaged shares written again whole: each in its own form, or in `form`; the phrase is never
   * shown. A wallet, with the dates of a Seedshift phrase, tells apart several sets that fit;
   * without one each set is shown with its fingerprint and none is chosen.
   */
  repair(
    request: ShareRequest & { readonly form?: ShareFormat },
    onProgress: (progress: SearchProgress) => void,
  ): RepairOutcome {
    using recovery = this.#recovery(request, Number.NaN);
    using result = run(
      recovery.repairShares(
        typedShares(request.answer),
        request.mode,
        request.mode === "seedshift" ? request.dates : undefined,
        MNEMOCODE_DECODE_ENTRY,
        request.form,
      ),
      onProgress,
    );
    const stop = stopOf(result);
    if (stop !== undefined) return stop;
    const rows = Array.from({ length: result.rows }, (_, at) => at);
    if (result.kind === "variants") {
      const sets = [...new Set(rows.map((at) => result.set(at) ?? 0))];
      return {
        kind: "variants",
        message: result.message ?? "",
        variants: sets.map((set) => {
          const inSet = rows.filter((at) => (result.set(at) ?? 0) === set);
          return {
            fingerprint: result.fingerprint(inSet[0] ?? 0),
            shares: repaired(result, inSet),
            repairs: inSet.flatMap((at) => result.repairs(at) ?? []),
          };
        }),
        warning: result.warning,
        lines: result.lines,
      };
    }
    const shares = repaired(result, rows);
    const forms = new Set(shares.map((share) => share.format));
    return {
      kind: "shares",
      shares,
      form: forms.size === 1 ? shares[0]?.format : undefined,
      repairs: rows.flatMap((at) => result.repairs(at) ?? []),
      notes: result.notes,
      warning: result.warning,
      lines: result.lines,
    };
  }
}
