// MnemoCode's Shamir shares as the Deriver offers them: a split of a seed phrase, plain or masked
// with MnemoCode Seedshift, into one group of SSKR shares written in the form chosen; the restore
// of a phrase from shares, with unreadable elements marked ? repaired by the shares together and
// forgotten date digits searched, and on request the candidate list of its phrases for the
// Discovery Scanner; and the repair of damaged shares, which come back whole without the phrase
// being shown. The steps follow MnemoCode's sskr-split, sskr-combine and sskr-export;
// every rule is MnemoCode's (packages/recovery-mnemocode/source/sskr). This file supplies its host
// services: the SSKR library, HMAC-SHA256 and the master fingerprint of the Deriver.
import { mnemoCodeDatesFor } from "./mnemocode.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { TooManyForList } from "../../recovery-mnemocode/source/core/candidate-list.js";
import { DatesAnswer } from "../../recovery-mnemocode/source/core/date-search.js";
import type { EncodedFormat } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import type { WalletCheck } from "../../recovery-mnemocode/source/core/wallet-check.js";
import {
  type ReportLine,
  type ShareRepairs,
} from "../../recovery-mnemocode/source/sskr/repair-report.js";
import { ShareInput } from "../../recovery-mnemocode/source/sskr/share-input.js";
import {
  ShareRestore,
  type SearchLimits,
} from "../../recovery-mnemocode/source/sskr/share-restore.js";
import {
  ONE_GROUP,
  type SharePlatform,
} from "../../recovery-mnemocode/source/sskr/share-platform.js";
import { ShareSplit } from "../../recovery-mnemocode/source/sskr/split.js";
import { writeShare, type ShareFormat } from "../../recovery-mnemocode/source/sskr/transport.js";
import type { SskrCodec } from "./sskr-codec.js";
import { CheckedSskrPlatform } from "./mnemocode-share-platform.js";
import {
  CandidateListWriter,
  NO_CANDIDATE_TO_SAVE,
  type ListOutcome,
  type ListProtectionRequest,
  type SearchProgress,
} from "./mnemocode-search.js";

/**
 * The Deriver's SSKR library and HMAC-SHA256, as MnemoCode's share modules need them. MnemoCode
 * splits into one group of shares, with the 32 random bytes it draws itself.
 */
export function sskrSharePlatform(codec: SskrCodec): SharePlatform {
  return new CheckedSskrPlatform({
    hmacSha256: (key, message) => hmac(sha256, key, message),
    combineShares: async (records) => codec.recover(records, "compact-ur"),
    createShares: async (secret, threshold, count, seed) =>
      codec.create(secret, ONE_GROUP, [{ threshold, count }], seed),
  });
}

/** Where a seed phrase typed in place of a share is read on this page. */
const DECODE_ENTRY = "MnemoCode › Decode";
/** How a restore whose phrases are more than one list holds is narrowed. */
const NARROW_SHARE_LIST = "give the wallet's fingerprint, or fewer ? in the shares or dates";

export type ShareMode = "direct" | "seedshift";

export interface SplitRequest {
  readonly phrase: string;
  readonly mode: ShareMode;
  /** The Seedshift dates, whole; none without Seedshift. */
  readonly dates: string;
  readonly threshold: number;
  readonly count: number;
  readonly form: ShareFormat;
}

export interface SplitOutcome {
  /** Each share written in the form chosen, share 1 first. */
  readonly shares: readonly string[];
  /** The same shares as SSKR UR records, as share cards take them. */
  readonly records: readonly string[];
  /** The phrase that was split, every word in full. */
  readonly original: string;
  /** The phrase the shares hold: the original, or its Seedshift mask. */
  readonly split: string;
}

/** The shares as typed in one field, and what to do with them. */
export interface ShareRequest {
  /** The shares, one per line or separated by ;, with ? for each unreadable element. */
  readonly answer: string;
  readonly mode: ShareMode;
  /** The Seedshift dates, with ? for a forgotten digit; none without Seedshift. */
  readonly dates: string;
  /** Compares each phrase with the wallet; without it every phrase is kept. */
  readonly walletCheck?: WalletCheck;
  /** Whether the person said yes to the long search that a question announced. */
  readonly confirmed: boolean;
  /** Optional consent allowances; MnemoCode still covers the complete search. */
  readonly limits?: SearchLimits;
}

/** A restore, which can also write the candidate list of its phrases, as sskr-combine saves it. */
export interface RestoreRequest extends ShareRequest {
  /** How the list is protected; without it no list is written. */
  readonly list?: ListProtectionRequest;
  /** The BIP39 passphrase that the list stores, also when no wallet is compared. */
  readonly listPassphrase?: string;
}

/** A phrase that shares restored, the phrase they hold, and what a repair filled in. */
export interface RestoredPhrase {
  readonly mnemonic: string;
  /** The phrase the shares hold: the seed phrase, or its Seedshift mask. */
  readonly held: string;
  /** The dates that a date search found for it. */
  readonly dates?: string;
  /** Where the wallet matched in a date search. */
  readonly matchedAt?: string;
  /** What a repair filled in where ? marked an element, share by share. */
  readonly repairs: readonly ShareRepairs[];
  /**
   * The backup that was split, in the form its shares were written in, before the dates turn it
   * into the phrase; absent where it would be the same words again.
   */
  readonly backup?: { readonly form: EncodedFormat; readonly text: string };
}

/** A share written again, by its place among those typed, with its SSKR UR record. */
export interface RepairedShare {
  readonly number: number;
  readonly text: string;
  /** The form `text` is written in: the one asked for, or the share's own. */
  readonly format: ShareFormat;
  /** The share as an SSKR UR record, which the card export and a share file take. */
  readonly record: string;
}

/** A set of shares that fits, shown with the original fingerprint of its phrase, after the dates. */
export interface ShareVariant {
  readonly fingerprint: string | undefined;
  readonly shares: readonly RepairedShare[];
  readonly repairs: readonly ShareRepairs[];
}

/** Lines shown with every outcome: the assessment of marked shares and the notes on copies. */
interface Shown {
  readonly lines: readonly string[];
}

/** An outcome that ends a job without a result: a trouble to say, or a question to ask first. */
export type Stop =
  | (Shown & { readonly kind: "trouble"; readonly message: string })
  | (Shown & { readonly kind: "question"; readonly question: string });

export type RestoreOutcome =
  | Stop
  | (Shown &
      ListOutcome & {
        readonly kind: "phrases";
        readonly phrases: readonly RestoredPhrase[];
        readonly notes: readonly string[];
      });

export type RepairOutcome =
  | Stop
  | (Shown & {
      readonly kind: "shares";
      readonly shares: readonly RepairedShare[];
      /** The one form every share is written in; undefined when they keep different forms. */
      readonly form: ShareFormat | undefined;
      readonly repairs: readonly ShareRepairs[];
      readonly notes: readonly string[];
    })
  | (Shown & {
      readonly kind: "variants";
      readonly message: string;
      readonly variants: readonly ShareVariant[];
    });

/** One line of MnemoCode's repair report as a sentence. */
function lineText(line: ReportLine): string | undefined {
  if (line.kind === "status") return `${line.label} ${line.value}`;
  return line.kind === "more" ? undefined : line.text;
}

function reportLines(lines: readonly ReportLine[]): string[] {
  return lines.map(lineText).filter((line): line is string => line !== undefined);
}

/** Why no list was written although one was asked for, as a note; nothing otherwise. */
function listNotes(outcome: ListOutcome): string[] {
  if (outcome.listFull) return [new TooManyForList(NARROW_SHARE_LIST).message];
  return outcome.listEmpty ? [NO_CANDIDATE_TO_SAVE] : [];
}

/** The shares as typed, read from the field; a seed phrase typed there is refused as one. */
function typedShares(answer: string): ShareInput {
  const input = new ShareInput({ decodeEntry: DECODE_ENTRY });
  input.replaceAll(input.sharesOfAnswer(answer));
  return input;
}

export class MnemoCodeShares {
  readonly #platform: SharePlatform;
  readonly #restore: ShareRestore;
  readonly #fillRandom: (bytes: Uint8Array) => void;
  readonly #fingerprintOf: (mnemonic: string) => string;

  /**
   * `fillRandom` fills a buffer from the host's CSPRNG for a split; `fingerprintOf` gives the
   * master fingerprint of a phrase with an empty passphrase, shown for each set of repaired
   * shares instead of its phrase.
   */
  constructor(
    platform: SharePlatform,
    fillRandom: (bytes: Uint8Array) => void,
    fingerprintOf: (mnemonic: string) => string,
  ) {
    this.#platform = platform;
    this.#restore = new ShareRestore(platform);
    this.#fillRandom = fillRandom;
    this.#fingerprintOf = fingerprintOf;
  }

  /** Splits a phrase, masked first with MnemoCode Seedshift if chosen, into checked shares. */
  async split(request: SplitRequest): Promise<SplitOutcome> {
    const { records, original, held } = await new ShareSplit(
      this.#platform,
      this.#fillRandom,
    ).splitBackup({
      mnemonic: request.phrase,
      mode: request.mode,
      dates: mnemoCodeDatesFor(request.mode, request.dates),
      threshold: request.threshold,
      count: request.count,
    });
    return {
      shares: records.map((record) => writeShare(record, request.form)),
      records,
      original,
      split: held,
    };
  }

  /**
   * The phrases that typed shares restore, as sskr-combine restores them: complete shares checked
   * as a set, marked ones repaired together, then unmasked with the dates, searched where a date
   * holds ?, and compared with the wallet if one is given. A long search is made only after the
   * person's yes; several sets that fit are all given, with a note that the wallet tells them apart.
   * With a list asked for, every phrase goes into it, also the date matches beyond those shown; its
   * protection and the BIP39 passphrase it stores are checked before any work.
   */
  async restore(
    request: RestoreRequest,
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<RestoreOutcome> {
    const writer =
      request.list === undefined
        ? undefined
        : new CandidateListWriter(request.list, request.listPassphrase ?? "");
    const keep = writer === undefined ? 0 : CandidateListWriter.KEEP;
    const restored = await this.#restore.restore({
      ...this.#operation(request),
      keep,
      onProgress,
      signal,
    });
    if (restored.kind === "few")
      return { ...restored, kind: "trouble", lines: reportLines(restored.lines) };
    if (restored.kind !== "phrases") return { ...restored, lines: reportLines(restored.lines) };
    const listed =
      writer === undefined
        ? { listFull: false, listEmpty: false }
        : await writer.writePhrases(restored.listed);
    return {
      ...listed,
      kind: "phrases",
      phrases: restored.phrases.map((phrase) => ({
        mnemonic: phrase.mnemonic,
        held: phrase.held,
        ...(phrase.dates === undefined ? {} : { dates: phrase.dates }),
        ...(phrase.matchedAt === undefined ? {} : { matchedAt: phrase.matchedAt }),
        repairs: phrase.repairs,
        ...(phrase.backup === undefined ? {} : { backup: phrase.backup }),
      })),
      notes: [...restored.notes, ...listNotes(listed)],
      lines: reportLines(restored.lines),
    };
  }

  /**
   * Damaged shares written again whole, as sskr-export writes them: each in its own form, or in
   * `form`; the phrase is never shown. Complete shares need no quorum; marked ones are repaired
   * together, or each on its own when fewer than the threshold were typed. A wallet, with the
   * dates of a Seedshift phrase, tells apart several sets that fit; without one each set is shown
   * with its fingerprint and none is chosen.
   */
  async repair(
    request: ShareRequest & { readonly form?: ShareFormat },
    onProgress: (progress: SearchProgress) => void,
    signal: AbortSignal,
  ): Promise<RepairOutcome> {
    const repaired = await this.#restore.repair({
      ...this.#operation(request),
      form: request.form,
      fingerprintOf: this.#fingerprintOf,
      onProgress,
      signal,
    });
    const lines = reportLines(repaired.lines);
    if (repaired.kind === "shares")
      return {
        ...repaired,
        lines,
        shares: repaired.shares.map(({ number, text, format, record }) => ({
          number,
          text,
          format,
          record,
        })),
      };
    if (repaired.kind === "variants")
      return {
        ...repaired,
        lines,
        variants: repaired.variants.map((variant) => ({
          ...variant,
          shares: variant.shares.map(({ number, text, format, record }) => ({
            number,
            text,
            format,
            record,
          })),
        })),
      };
    return { ...repaired, lines };
  }

  /** Parse shares before dates so both operations refuse the same first error. */
  #operation(request: ShareRequest) {
    return {
      input: typedShares(request.answer),
      mode: request.mode,
      dates:
        request.mode === "seedshift"
          ? DatesAnswer.parse(request.dates, { patterns: true })
          : undefined,
      walletCheck: request.walletCheck,
      confirmed: request.confirmed,
      limits: request.limits,
    };
  }
}
