// The shares that a person types or pastes to restore or export a seed phrase, each kept with the
// place it was typed at, by which every message names it: one answer split into shares (a share
// that a paste wrapped over lines joined again), a seed phrase typed where a share was asked for
// told apart, each share read, the set they make checked, copies of a share used once, and the
// share without which the others restore named; for an export of fewer shares than the threshold,
// each share repaired alone.
//
// Needs from the host: a SharePlatform (share-platform.ts) to restore complete shares, and the name
// of its own reader of an encoded seed phrase, which a seed phrase typed in place of a share is
// sent to: the command line names its menu entry, a page its tab.
// Does not: ask anything, show anything, or search shares with unreadable elements (joint-repair.ts
// assesses and searches them; this module only names the trouble that an assessment finds).

import { phraseChecksumValid, phraseOfIndexes } from "../core/english-words.js";
import { placesInWords } from "../core/places.js";
import { detectInputFormats, parseInput } from "../core/representations.js";
import { jointMarkLimitProblem } from "./joint-repair.js";
import { type JointAssessment, type RepairedSet, type RepairedShares } from "./joint-results.js";
import {
  markProblem,
  readRepairableShare,
  ShareVariantsError,
  type ReadRepairableShare,
  unrepairedShare,
} from "./repair.js";
import { isMarked } from "./repair-units.js";
import type { SharePlatform } from "./share-platform.js";
import { copiesAmong, ShareExport, ShareSet } from "./share-set.js";
import { LineWordHints, type WordHints } from "../core/word-hints.js";
import {
  assertShareCount,
  readShare,
  shareWordList,
  shareCountProblem,
  type ShareFormat,
  Share,
  type ShareInfo,
} from "./transport.js";
import {
  SET_CONFLICT_TEXTS,
  SetTopology,
  withoutCopies,
  type PlacedShare,
} from "./set-topology.js";
import { misfitMessage } from "./complete-shares.js";
import { refusalMessage } from "../core/refusal.js";
import { afterPlace } from "../core/prose.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog, suppliedMessage } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.share-input", {
  "share-input-name-host-s-reader-seed-phrase": {
    kind: "type",
    text: () => "ShareInput needs the name of the host's reader of a seed phrase.",
  },
  "shares-text-refused": suppliedMessage,
  "type-at-least-one-share": () => "Type at least one share.",
  "no-share-was-typed-at-place": (value0: string) => `No share was typed at place ${value0}.`,
});

/** Lines that one share may take in a paste, as a narrow column of a PDF wraps it. */
const MAX_WRAPPED_LINES = 8;
/** What a person types between the shares of one answer; prompts and messages name it. */
export const SHARE_SEPARATOR = ";";
/**
 * What separates the shares of one answer: SHARE_SEPARATOR (no regular-expression character), or a
 * line break.
 */
const SHARE_SEPARATORS = new RegExp(`${SHARE_SEPARATOR}|\\r?\\n`, "u");

/**
 * The hints below shares being typed: the words of the list that the share being typed, after
 * the shares before it, is written in (shareWordList), for every question that takes shares.
 */
export const SHARE_WORD_HINTS: WordHints = new LineWordHints(
  shareWordList,
  (line) => line.split(SHARE_SEPARATORS).at(-1) ?? "",
);

/** A share as typed, and its place among the shares typed, by which every message names it. */
export interface TypedShare {
  readonly place: number;
  readonly text: string;
}

/**
 * A problem of the shares as typed, and how a host mends it: "unreadable", the share is typed
 * again, or left out while others remain; "odd", a share that does not fit with the others is left
 * out or typed again; "few", more shares are needed; "refused", the person chooses which share to
 * change or leave out, also where the message names several shares of which nothing tells the
 * wrong one.
 */
export type ShareTrouble =
  | { readonly kind: "unreadable"; readonly place: number; readonly message: string }
  | { readonly kind: "odd"; readonly place: number; readonly message: string }
  | { readonly kind: "few"; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/** A share typed again as it was typed before: it is left out, and used once. */
export interface ShareCopy {
  readonly place: number;
  /** The place of the share it copies. */
  readonly of: number;
  readonly message: string;
}

/** The shares' first problem, as every outcome of shares tells it. */
export interface SharesTrouble {
  readonly kind: "trouble";
  readonly trouble: ShareTrouble;
}

/** What complete shares give: the phrase, with the secret's length, or their first problem. */
export type CompleteOutcome =
  | {
      readonly kind: "complete";
      readonly set: RepairedSet;
      readonly secretBytes: number;
      /**
       * The places of the set's shares among those typed, copies left out: those of the shares as
       * they were when the restore began, so that a host that changes the input while it awaits
       * the restore still gets the places of the set restored (AUD-014-API004).
       */
      readonly places: readonly number[];
    }
  | SharesTrouble;

/**
 * Each share repaired alone (ShareInput.repairEach): every one of them, or the first that cannot
 * be repaired, or the first that fits several ways, whose variants a host shows and never chooses.
 */
export type EachRepair =
  | { readonly kind: "repaired"; readonly shares: readonly ReadRepairableShare[] }
  | {
      readonly kind: "unreadable";
      readonly place: number;
      readonly message: string;
      readonly cause: Error;
    }
  | {
      readonly kind: "variants";
      readonly place: number;
      readonly variants: readonly ReadRepairableShare[];
      readonly message: string;
    };

/** Complete shares as one set to write again (ShareInput.rewritten), or their first problem. */
export type RewrittenShares =
  SharesTrouble | { readonly kind: "set"; readonly set: RepairedShares };

/** What an export of a set settles: the shares written, or why none or not these. */
export type CheckedExport =
  | { readonly kind: "written"; readonly written: ShareExport }
  /** Every share has an element that nothing settles: each is left out. */
  | { readonly kind: "none"; readonly written: ShareExport }
  /** Shares repaired each on its own may be of several sets, or the same member twice. */
  | (SharesTrouble & { readonly written: ShareExport });

/** A complete share as read, with its place and its metadata (Share.info). */
interface ReadShare extends PlacedShare {
  readonly info: ShareInfo;
}

/** `share`, given at a place, with its metadata, as the checks of a set take it. */
function withInfo(share: PlacedShare): ReadShare {
  return { ...share, info: Share.read(share.ur).info };
}

/**
 * What `text` is when it is a seed phrase rather than a share, or undefined: English words of a
 * phrase's length, or codes of another form whose BIP39 checksum holds, as those of an encoded
 * phrase do in direct mode and in MnemoCode Seedshift. A share in word numbers may have as many
 * numbers as a phrase has words; the checksum keeps a damaged one from passing for a phrase but
 * rarely (1 in 128 for 21 numbers).
 */
function phraseKind(text: string): "words" | "encoded" | undefined {
  for (const format of detectInputFormats(text)) {
    if (format === "english") return "words";
    if (phraseChecksumValid(phraseOfIndexes(parseInput(text, format)))) return "encoded";
  }
  return undefined;
}

/**
 * The share that parts of an answer from `start` on make together, and where it ends, or
 * undefined: parts that cannot be read alone, one after another, that read as a share once joined,
 * with spaces between them or, where a line break cut a UR, without. A host that takes a pasted
 * line break as ; gets a share wrapped over lines as such parts. Its own checksum makes parts of
 * different shares, or other text, read as one only by a chance of about one in four billion
 * (transport.ts).
 */
function wrappedShare(
  parts: readonly string[],
  start: number,
): { readonly text: string; readonly end: number } | undefined {
  const lines: string[] = [];
  for (let end = start; end < parts.length && lines.length < MAX_WRAPPED_LINES; end += 1) {
    const part = defined(parts[end]);
    if (shareOrMarked(part)) return undefined;
    lines.push(part);
    if (lines.length < 2) continue;
    for (const separator of [" ", ""]) {
      const text = lines.join(separator);
      if (Share.reads(text)) return { text, end: end + 1 };
    }
  }
  return undefined;
}

/** Whether `text` is a share as it stands: one that reads, or one with elements marked with ?. */
function shareOrMarked(text: string): boolean {
  return isMarked(text) || Share.reads(text);
}

/** The parts of an answer with each share that a paste wrapped over lines joined again. */
function joinWrapped(parts: readonly string[]): string[] {
  const shares: string[] = [];
  for (let start = 0; start < parts.length;) {
    const wrapped = wrappedShare(parts, start);
    shares.push(wrapped?.text ?? defined(parts[start]));
    start = wrapped?.end ?? start + 1;
  }
  return shares;
}

/**
 * Shares of which nothing tells the wrong one, named together: the person chooses which to change
 * or leave out. Naming only the later one would let only it be changed, also when the earlier one
 * is wrong, and the same message would come back for every share typed after.
 */
function undecided(places: readonly number[], what: string): ShareTrouble {
  return {
    kind: "refused",
    message: `Shares ${placesInWords(places)} ${what}, and nothing tells which is right.`,
  };
}

/**
 * The first problem of shares that do not all belong together, or undefined. A share of another
 * set than most of them is named alone ("odd"). Where nothing tells which share is wrong, the
 * shares are named together (undecided): sets with as many shares each, of which the first share of
 * each is named; two shares that are the same member of the set but differ; two that give their
 * group different thresholds. Copies are left out before.
 */
function setTrouble(shares: readonly ReadShare[]): ShareTrouble | undefined {
  // The shares of each set, by index, in the order typed.
  const sets = new Map<string, number[]>();
  shares.forEach((share, index) => {
    const set = SetTopology.setOf(share.info);
    sets.set(set, [...(sets.get(set) ?? []), index]);
  });
  const largest = Math.max(...[...sets.values()].map((indexes) => indexes.length));
  const main = [...sets.values()].filter((indexes) => indexes.length === largest);
  const placeOf = (index: number) => defined(shares[index]).place;
  if (main.length > 1)
    return undecided(
      main.map((indexes) => placeOf(defined(indexes[0]))),
      SET_CONFLICT_TEXTS.set.between,
    );
  const reference = defined(defined(main[0])[0]);
  const conflict = SetTopology.firstConflict(
    shares.map((share) => share.info),
    reference,
  );
  if (conflict === undefined) return undefined;
  const [earlier, later] = [placeOf(conflict.with), placeOf(conflict.at)];
  if (conflict.kind === "set")
    return {
      kind: "odd",
      place: later,
      message: `Share ${later} is of another set than share ${earlier}.`,
    };
  return undecided([earlier, later], SET_CONFLICT_TEXTS[conflict.kind].between);
}

/** Why complete shares of one set are too few to restore it, or undefined when they are enough. */
function fewTrouble(shares: readonly ReadShare[]): ShareTrouble | undefined {
  const { groupThreshold, groupCount } = defined(shares[0]).info;
  if (new SetTopology(shares.map((share) => share.info)).enough) return undefined;
  if (groupCount === 1) {
    const needed = defined(shares[0]).info.memberThreshold;
    const typed = shares.length === 1 ? "One share is" : `These ${shares.length} shares are`;
    return { kind: "few", message: `${typed} not enough: this set needs ${needed}.` };
  }
  return {
    kind: "few",
    message: `These shares are not enough: this set needs ${groupThreshold} of its ${groupCount} groups, each with as many shares as its threshold.`,
  };
}

/**
 * The shares typed, each with the place it was typed at, while one of them is typed again, left
 * out or joined by more. A class, so that the places stay consistent with the shares through every
 * change, and so that a page binds one object to its share fields; its checks name every share by
 * its place.
 */
export class ShareInput {
  #shares: TypedShare[] = [];
  #nextPlace = 1;
  readonly #decodeEntry: string;

  /**
   * `decodeEntry` names where the host reads an encoded seed phrase, which a seed phrase typed in
   * place of a share is sent to: "Decode numbers, codes or colors back into a seed phrase" in the
   * command line's menu, "The Decode tab" on a page.
   */
  constructor(options: { readonly decodeEntry: string }) {
    if (typeof options?.decodeEntry !== "string" || options.decodeEntry.trim() === "")
      throw ERRORS.create("share-input-name-host-s-reader-seed-phrase", []);
    this.#decodeEntry = options.decodeEntry;
  }

  /**
   * The parts of a share file or paste, with empty lines left out and wrapped shares joined.
   * Unreadable parts stay in place: the reader must name them, never silently drop them. Decode
   * uses the same boundaries before deciding whether the text holds shares or phrase codes.
   */
  static partsOfText(text: string): string[] {
    const parts = text
      .split(SHARE_SEPARATORS)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return [];
    // Bounds the work below: wrapped or not, the parts make no more shares than a set may have.
    assertShareCount(Math.ceil(parts.length / MAX_WRAPPED_LINES));
    const shares = joinWrapped(parts);
    assertShareCount(shares.length);
    return shares;
  }

  /**
   * `message` of a share after "Share N" and `joint`, such as "Share 2 cannot be read: unknown …".
   * Its first letter is made small, unless it begins an abbreviation such as SSKR.
   */
  static aboutShare(place: number, joint: string, message: string): string {
    return afterPlace("Share", place, message, joint);
  }

  /**
   * The first share of `shares` that does not belong with the others, for shares that need no
   * quorum, such as those written again by an export. A copy of a share is no problem.
   */
  static looseSetTrouble(shares: readonly PlacedShare[]): ShareTrouble | undefined {
    return setTrouble(withoutCopies(shares).map(withInfo));
  }

  /**
   * Why complete shares cannot be restored together, as sskr-combine says it before it tries:
   * shares that do not belong together (setTrouble) and, unless `more` are still to come, too
   * few for the quorum they record (fewTrouble). Copies are left out first. The restore here and
   * the backup check both ask it.
   */
  static completeSetProblem(shares: readonly PlacedShare[], more = false): string | undefined {
    const read = withoutCopies(shares).map(withInfo);
    if (read.length === 0) return undefined;
    return (setTrouble(read) ?? (more ? undefined : fewTrouble(read)))?.message;
  }

  /**
   * The shares of `shares` that copy an earlier one exactly (the same UR), each with the place of
   * the first and a note: a copy adds nothing to a restore, so it is left out and used once. The
   * restore here and the backup check (core/backup-check.ts) both apply this rule.
   */
  static copiesOf(shares: readonly PlacedShare[]): ShareCopy[] {
    return copiesAmong(shares).map((copy) => ({
      ...copy,
      message: `Share ${copy.place} is a copy of share ${copy.of}: it is used once.`,
    }));
  }

  /** The shares typed, each with its place; a copy, so that only this object's changes count. */
  get list(): readonly TypedShare[] {
    return Object.freeze([...this.#shares]);
  }

  /** The texts, in the order typed, as the share functions take them. */
  texts(): string[] {
    return this.#shares.map((share) => share.text);
  }

  /** The place of each share, by its index in texts(). */
  places(): number[] {
    return this.#shares.map((share) => share.place);
  }

  /** Whether an element of a share is marked with ? as unreadable. */
  get marked(): boolean {
    return this.#shares.some((share) => isMarked(share.text));
  }

  /** Whether a share was typed at `place`, and is not left out. */
  has(place: number): boolean {
    return this.#shares.some((share) => share.place === place);
  }

  /**
   * The shares in a text, typed, pasted or read from a file: split at ; and at line breaks, as a
   * page's field holds one share per line, with each share that a paste or a narrow column wrapped
   * over lines joined again (wrappedShare); none for a text without one. An empty part, from a ; at
   * the end or two in a row, is no share and is passed over. A seed phrase, also one word per line,
   * is refused as one: `subject` names the text in that message, "This is" or "The file holds".
   */
  sharesOfText(text: string, subject = "This is"): string[] {
    const shares = ShareInput.partsOfText(text);
    if (shares.length === 0) return [];
    // Looked for only when nothing reads as a share: a share in word numbers, wrapped or not, may
    // have as many numbers as a phrase has words.
    if (!shares.some(shareOrMarked)) {
      const kind = phraseKind(shares.join(" "));
      if (kind !== undefined)
        throw ERRORS.create("shares-text-refused", [this.#notShareMessage(kind, subject)]);
    }
    return shares;
  }

  /**
   * The shares of one answer (sharesOfText), at least one, checked to fit in a set: alone, or
   * `adding` them to those typed.
   */
  sharesOfAnswer(answer: string, adding = false): string[] {
    const shares = this.sharesOfText(answer);
    if (shares.length === 0) throw ERRORS.create("type-at-least-one-share", []);
    assertShareCount((adding ? this.#shares.length : 0) + shares.length);
    return shares;
  }

  /** Adds shares after those typed, each at the next place; adding none changes nothing. */
  add(texts: readonly string[]): void {
    if (texts.length === 0) return;
    assertShareCount(this.#shares.length + texts.length);
    for (const text of texts)
      this.#shares = [...this.#shares, Object.freeze({ place: this.#nextPlace++, text })];
  }

  /** Takes `texts` in place of every share typed before, at places from 1. */
  replaceAll(texts: readonly string[]): void {
    assertShareCount(texts.length);
    this.#shares = [];
    this.#nextPlace = 1;
    this.add(texts);
  }

  /** Takes `text` for the share at `place`, which keeps its place. */
  replace(place: number, text: string): void {
    if (!this.has(place)) throw ERRORS.create("no-share-was-typed-at-place", [`${place}`]);
    this.#shares = this.#shares.map((share) =>
      share.place === place ? Object.freeze({ place, text }) : share,
    );
  }

  /** Leaves out the share at `place`; the others keep their places. */
  leaveOut(place: number): void {
    this.#shares = this.#shares.filter((share) => share.place !== place);
  }

  /**
   * Why a share cannot be used even before the others are looked at, or undefined: a share without
   * ? must read as a share in one of its forms; one with ? may hold only as many marks as a joint
   * repair takes (planJointRepair), which tells later whether the rest of it fits.
   */
  readProblem(place: number, text: string): string | undefined {
    if (isMarked(text)) {
      const limit = jointMarkLimitProblem(place, text);
      if (limit !== undefined) return limit;
      const problem = markProblem(text);
      return problem === undefined ? undefined : afterPlace("Share", place, problem);
    }
    try {
      readShare(text);
      return undefined;
    } catch (error) {
      const message = refusalMessage(error);
      const kind = phraseKind(text);
      return kind === undefined
        ? ShareInput.aboutShare(place, " cannot be read: ", message)
        : this.#notShareMessage(kind, `Share ${place} is`);
    }
  }

  /** The first share typed that cannot be read (readProblem), or undefined. */
  firstUnreadable(): ShareTrouble | undefined {
    for (const { place, text } of this.#shares) {
      const trouble = this.#unreadable(place, text);
      if (trouble !== undefined) return trouble;
    }
    return undefined;
  }

  /**
   * The trouble of the share typed at `place` when it cannot be read (readProblem), named by its
   * place; undefined when it can. Every reader of the typed shares refuses one so
   * (AUD-012-ARC010).
   */
  #unreadable(place: number, text: string): ShareTrouble | undefined {
    const message = this.readProblem(place, text);
    return message === undefined ? undefined : { kind: "unreadable", place, message };
  }

  /**
   * The first problem of complete shares written again by an export, which needs no quorum: each
   * must be read, and all must be of one set; copies of a share are kept, to be shown as typed and
   * saved once.
   */
  looseTrouble(): ShareTrouble | undefined {
    const read = this.#readAll();
    return Array.isArray(read) ? ShareInput.looseSetTrouble(read) : read;
  }

  /**
   * Restores complete shares: each is read, copies are left out (and returned, with a note), the
   * set is checked (setTrouble, fewTrouble), and its phrase restored, every share checked against
   * it (ShareSet.restore). When they do not agree, the share without which the others restore a
   * phrase is named: each is left out once.
   */
  async restoreComplete(
    platform: SharePlatform,
  ): Promise<{ readonly outcome: CompleteOutcome; readonly copies: readonly ShareCopy[] }> {
    const read = this.#readAll();
    if (!Array.isArray(read)) return { outcome: { kind: "trouble", trouble: read }, copies: [] };
    const copies = this.#dropCopies(read);
    const distinct = read.filter((share) => this.has(share.place));
    const trouble = setTrouble(distinct) ?? fewTrouble(distinct);
    if (trouble !== undefined) return { outcome: { kind: "trouble", trouble }, copies };
    // Taken before the restore is awaited: the host may change the input meanwhile.
    return { outcome: await this.#restoreChecked(distinct, this.texts(), platform), copies };
  }

  /**
   * The complete shares as one set to write again: no phrase is restored and no quorum is needed.
   * A share that cannot be read, or shares that are not of one set, are refused.
   */
  rewritten(): RewrittenShares {
    const trouble = this.looseTrouble();
    if (trouble !== undefined) return { kind: "trouble", trouble };
    const shares = this.texts().map(unrepairedShare);
    return { kind: "set", set: { shares, unsettled: [] } };
  }

  /**
   * The shares of `set` to write again, named by `places`, in `form` or their own: a share that
   * nothing settles is left out, and shares repaired each on its own must still be of one set
   * (looseSetTrouble).
   */
  static checkedExport(
    set: RepairedShares,
    places: readonly number[],
    form: ShareFormat | undefined,
  ): CheckedExport {
    const written = ShareExport.of(set, places, form);
    if (written.shown.length === 0) return { kind: "none", written };
    const trouble = ShareInput.looseSetTrouble(written.members);
    if (trouble !== undefined) return { kind: "trouble", written, trouble };
    return { kind: "written", written };
  }

  repairEach(): EachRepair {
    const shares: ReadRepairableShare[] = [];
    for (const { place, text } of this.#shares) {
      try {
        shares.push(readRepairableShare(text));
      } catch (error) {
        // Narrowed here, not by refusalMessage: the result keeps the Error as its cause.
        if (!(error instanceof Error)) throw error;
        if (!(error instanceof ShareVariantsError))
          return {
            kind: "unreadable",
            place,
            message: ShareInput.aboutShare(place, ": ", error.message),
            cause: error,
          };
        return {
          kind: "variants",
          place,
          variants: error.variants,
          message: `Share ${place} fits ${error.variants.length} ways, so nothing is saved: use another copy of it, or more shares.`,
        };
      }
    }
    return { kind: "repaired", shares };
  }

  /**
   * The problem that an assessment of marked shares names, or undefined when they can be searched.
   * The assessment is of these shares, planned with their places (ShareRestore.read), so that its
   * reason names each share as it was typed. `places` are those it was planned with, which a host
   * that changed the input while the assessment ran no longer has (AUD-014-API004).
   */
  assessmentTrouble(
    assessment: JointAssessment,
    places: readonly number[] = this.places(),
  ): ShareTrouble | undefined {
    if (assessment.reason === undefined) return undefined;
    // A share that no reading fits is typed again or left out, by its place.
    if (assessment.unfit !== undefined)
      return {
        kind: "unreadable",
        place: defined(places[assessment.unfit - 1]),
        message: assessment.reason,
      };
    return {
      kind: assessment.verdict === "not-enough" ? "few" : "refused",
      message: assessment.reason,
    };
  }

  /**
   * The one line for a seed phrase typed where a share was asked for: what it is and which entry
   * reads it, without repeating it. `subject` is "This is", "The file holds" or "Share N is".
   */
  #notShareMessage(kind: "words" | "encoded", subject: string): string {
    return kind === "words"
      ? `${subject} a seed phrase in words, not a Shamir share: ${this.#decodeEntry} reads a masked one.`
      : `${subject} an encoded seed phrase, not a Shamir share: ${this.#decodeEntry} reads it.`;
  }

  /**
   * Reads every complete share; no share at all, or the first that cannot be read, is the trouble.
   * An input that is empty, as it starts and once every share is left out, is "few": more shares
   * are needed (AUD-014-API009).
   */
  #readAll(): ReadShare[] | ShareTrouble {
    const count = shareCountProblem(this.#shares.length);
    if (count !== undefined) return { kind: "few", message: count };
    const trouble = this.firstUnreadable();
    if (trouble !== undefined) return trouble;
    return this.#shares.map(({ place, text }) => {
      const share = Share.read(text);
      return { place, ur: share.ur, info: share.info };
    });
  }

  /** Leaves out each share typed again as an earlier one (copiesOf). */
  #dropCopies(read: readonly ReadShare[]): ShareCopy[] {
    const copies = ShareInput.copiesOf(read);
    for (const copy of copies) this.leaveOut(copy.place);
    return copies;
  }

  /**
   * The phrase of `read`, typed as `texts`, checked as a set before; or the share named as the one
   * that is wrong. Bound to `read` and `texts` alone, never to the input as it is after an await.
   */
  async #restoreChecked(
    read: readonly ReadShare[],
    texts: readonly string[],
    platform: SharePlatform,
  ): Promise<CompleteOutcome> {
    const places = read.map((share) => share.place);
    try {
      const set = (await ShareSet.restore(texts, platform, places)).toRepairedSet();
      return { kind: "complete", set, secretBytes: defined(read[0]).info.secretLength, places };
    } catch (error) {
      const message = refusalMessage(error);
      const fits: number[] = [];
      for (const [index, share] of read.entries()) {
        try {
          await ShareSet.restore(
            texts.filter((_, other) => other !== index),
            platform,
          );
          fits.push(share.place);
        } catch (other) {
          refusalMessage(other);
        }
      }
      if (fits.length === 1)
        return {
          kind: "trouble",
          trouble: {
            kind: "odd",
            place: defined(fits[0]),
            message: misfitMessage(defined(fits[0])),
          },
        };
      // The share set names each share by the place it was typed at.
      return { kind: "trouble", trouble: { kind: "refused", message } };
    }
  }
}
