// Restores the seed phrase of a set of SSKR shares, and checks every share given against it.
//
// Needs from the host: a SharePlatform (share-platform.ts) whose combineShares is the host's SSKR
// library; shares with elements marked with ? are assessed and searched with the same platform
// (JointRepair, joint-repair.ts).
// Also: the names of the share forms, the form in which a restored backup is shown, the rule that
// tells a copy of a share, the texts for shares that took no part and for a wallet that no phrase
// restored matches, and the rules by which an export writes the shares of a set again
// (ShareExport).
// Does not: run the SSKR self-test (the Node.js wrapper in shares.ts does, and another host checks
// its own library first), ask for shares, name them by where they were typed (share-input.ts), or
// say what a repair filled in (repair-report.ts).

import { formatEncoded } from "../core/representations.js";
import { representMnemonic } from "../core/seedshift.js";
import { wordCountOfEntropy, WORD_NUMBERS_SPAN } from "../core/bip39-sizes.js";
import { fingerprintOfValidPhrase } from "../core/english-words.js";
import type { EncodedFormat } from "../core/types.js";
import {
  JointRepair,
  type MarkedElement,
  type RepairedSet,
  searchOnce,
  type RepairedShares,
} from "./joint-repair.js";
import type { ReadRepairableShare } from "./repair.js";
import { NO_PHRASE_FITS } from "./repair-report.js";
import type { SharePlatform } from "./share-platform.js";
import {
  assertShareCount,
  assertShareFormat,
  Share,
  type ShareFormat,
  type ShareInfo,
  MIRRORED_FORM,
} from "./transport.js";
import { copiesAmong, SetTopology, type PlacedShare, withoutCopies } from "./set-topology.js";
import { restoreCompleteShares, uncheckedField } from "./complete-shares.js";
import { Redacted } from "../core/redacted.js";
import { counted } from "../core/search-plan.js";
import { placeOf } from "../core/places.js";
import { unrepairedShare, isMarked } from "./repair.js";
// The copy rule belongs to set-topology.ts; here too for the modules that take it with a set.
export { copiesAmong, type PlacedShare };

/** The share forms as a person reads their names (ShareFormat, transport.ts). */
export const SHARE_FORMAT_NAMES: Readonly<Record<ShareFormat, string>> = {
  ur: "Compact UR",
  words: "Bytewords",
  indexes: `BIP39 word numbers (${WORD_NUMBERS_SPAN})`,
  unicode: "Unicode codes",
  colors: "RGB hexadecimal codes (ordered)",
  "colors-unicode": "Colors as Unicode codes",
};

/** The form in which a restored backup is shown: the one its shares look like (transport.ts). */
export const RESTORED_FORM: Readonly<Record<ShareFormat, EncodedFormat>> = MIRRORED_FORM;

/** Digest checks that a combine makes on its own: well under a second. */
const MAX_LIBRARY_TRIES = 2 ** 16;

/** The backup that was split, in the form its shares were written in (ShareSet.backup). */
export interface SetBackup {
  readonly form: EncodedFormat;
  readonly text: string;
}

/**
 * A group of the set as given: its index in the set, counted from 0 as SSKR stores it, its member
 * threshold, and its shares, counted from 1 in the order given.
 */
export interface ShareGroup {
  readonly index: number;
  readonly threshold: number;
  readonly members: readonly number[];
}

/**
 * The phrase that a set of SSKR shares restores, with every share as read or repaired, its groups
 * and thresholds, and what could not be checked. A class, so that a share set exists only once it
 * is restored and checked (its factories), and so that its phrase stays inside it: a caller takes
 * the phrase, or its fingerprint, on purpose; toString, toJSON and Node.js's inspect show none.
 */
export class ShareSet extends Redacted {
  readonly #set: RepairedSet;
  readonly #infos: readonly ShareInfo[];

  private constructor(set: RepairedSet) {
    super("ShareSet");
    if (set.shares.length === 0) throw new Error("A share set has at least one share.");
    // A copy that nothing can change: the set is handed out (toRepairedSet, shares) and must stay
    // what was restored and checked.
    this.#set = frozenSet(set);
    this.#infos = this.#set.shares.map((share) => Share.read(share.ur).info);
  }

  /**
   * Restores complete shares, each in any form MnemoCode writes, and checks every share given
   * against the phrase (restoreCompleteShares). A share that does not fit is refused by its place
   * in `places`, by its index among `records`; by that index, counted from 1, without them.
   */
  static async restore(
    records: readonly string[],
    platform: SharePlatform,
    places?: readonly number[],
  ): Promise<ShareSet> {
    assertShareCount(records.length);
    const shares = records.map(unrepairedShare);
    const { mnemonic, unchecked } = await restoreCompleteShares(
      shares.map((share) => share.ur),
      platform,
      places,
    );
    return new ShareSet({
      mnemonic,
      shares,
      unsettled: [],
      ...uncheckedField(unchecked),
    });
  }

  /**
   * Restores the one phrase that `records` hold, in any form, with elements marked with ? where
   * unreadable, all with `platform`: complete shares by its SSKR library, marked ones assessed and
   * searched with it (JointRepair). A repair that needs a long search, or that more than one
   * phrase passes, is refused; a host that shows the assessment and asks first uses JointRepair
   * and ShareSet.of for each phrase found. A refusal names each share by its place in `places`,
   * as restore does.
   */
  static async combine(
    records: readonly string[],
    platform: SharePlatform,
    places?: readonly number[],
  ): Promise<ShareSet> {
    if (!records.some(isMarked)) return ShareSet.restore(records, platform, places);
    assertShareCount(records.length);
    const plan = await new JointRepair(platform).plan(records, { places });
    const { assessment } = plan;
    if (assessment.reason !== undefined || assessment.combinations > MAX_LIBRARY_TRIES) {
      // A plan that is not searched is wiped here; searchOnce wipes the one that is.
      plan.wipe();
      throw new Error(
        assessment.reason ??
          "Too many combinations are open: read more of the marked elements, or add a share.",
      );
    }
    const found = await searchOnce(plan);
    if (found.length === 0) throw new Error(NO_PHRASE_FITS);
    if (found.length > 1)
      throw new Error(
        "More than one phrase fits these shares: read more of the marked elements, or add a share.",
      );
    return new ShareSet(found[0]!);
  }

  /** A phrase that a search of marked shares found (JointPlan.search), as a share set. */
  static of(set: RepairedSet): ShareSet {
    return new ShareSet(set);
  }

  /** Words of the phrase whose secret has `secretBytes`, as the shares and an assessment tell. */
  static wordCountOf(secretBytes: number): number {
    const words = wordCountOfEntropy(secretBytes);
    if (words === undefined) throw new Error("A share's secret has no BIP39 length.");
    return words;
  }

  /**
   * Why the phrases restored, `sets` of them, are not the wallet given: their own phrases, or,
   * after a search of `dateCombinations` dates with ?, the phrases those dates unmask.
   */
  static walletMismatch(sets: number, dateCombinations?: number): string {
    if (dateCombinations === undefined)
      return sets === 1
        ? "The phrase that these shares restore does not match the wallet given."
        : `None of the ${sets} phrases that fit these shares matches the wallet given.`;
    const dates = counted(dateCombinations, "date combination");
    return sets === 1
      ? `None of the ${dates} gives the wallet given.`
      : `None of the ${dates} gives the wallet given, with any of the ${sets} phrases that fit these shares.`;
  }

  /** The phrase that the shares hold: for a Seedshift backup, the masked phrase. */
  get mnemonic(): string {
    return this.#set.mnemonic;
  }

  /** Every share, in the order given, as read or repaired. */
  get shares(): readonly ReadRepairableShare[] {
    return this.#set.shares;
  }

  /** Elements that the phrase does not depend on and nothing settles: their values are a guess. */
  get unsettled(): readonly MarkedElement[] {
    return this.#set.unsettled;
  }

  /** Shares, counted from 1, of a group with fewer than its threshold: they took no part. */
  get unchecked(): readonly number[] {
    return this.#set.unchecked ?? [];
  }

  /**
   * The warning for the shares that took no part, each named by its place in `places`, by its
   * index in the set; undefined when every share took part.
   */
  uncheckedNote(places?: readonly number[]): string | undefined {
    if (this.unchecked.length === 0) return undefined;
    const named = this.unchecked.map((share) => placeOf(places, share));
    return `Share ${named.join(", ")}: too few shares of its group to take part; not checked.`;
  }

  /** Whether every share took part in the restore and every element of it is settled. */
  get checked(): boolean {
    return this.unchecked.length === 0 && this.unsettled.length === 0;
  }

  /** Groups of the set that restore the phrase. */
  get groupThreshold(): number {
    return this.#infos[0]!.groupThreshold;
  }

  /** Groups of the set, given or not. */
  get groupCount(): number {
    return this.#infos[0]!.groupCount;
  }

  /** The groups of the shares given, in the order they first come. */
  get groups(): readonly ShareGroup[] {
    const topology = new SetTopology(this.#infos);
    return topology.groups.map((members) => ({
      index: this.#infos[members[0]!]!.groupIndex,
      threshold: topology.thresholdOf(members),
      members: members.map((member) => member + 1),
    }));
  }

  /** Bytes of the secret that the shares hold. */
  get secretBytes(): number {
    return this.#infos[0]!.secretLength;
  }

  /** Words of the phrase that the shares hold. */
  get wordCount(): number {
    return ShareSet.wordCountOf(this.secretBytes);
  }

  /** The form in which the backup that was split is shown again: that of its first share. */
  get backupForm(): EncodedFormat {
    return RESTORED_FORM[this.shares[0]!.format];
  }

  /**
   * The backup that was split, in the form its shares were written in, which the dates turn into
   * the seed phrase `mnemonic`; undefined where it would be the same words again.
   */
  backup(mnemonic: string): SetBackup | undefined {
    const form = this.backupForm;
    const text = formatEncoded(representMnemonic(this.mnemonic), form);
    return text === mnemonic ? undefined : { form, text };
  }

  /**
   * The wallet fingerprint of the phrase that the shares hold, by `fingerprintOf` (the host's BIP32
   * master fingerprint, with its seed function and an empty BIP39 passphrase), or undefined when
   * that phrase is no valid BIP39 phrase. For a Seedshift backup it is the encoded fingerprint, to
   * be compared with the one noted at encoding before any date is typed.
   */
  fingerprint<T>(fingerprintOf: (mnemonic: string) => T): T | undefined {
    return fingerprintOfValidPhrase(this.mnemonic, fingerprintOf);
  }

  /** The set as plain data, as combineSskrShareSet and the searches give it; it cannot be changed. */
  toRepairedSet(): RepairedSet {
    return this.#set;
  }
}

/** A share as it is shown or written again: its UR, its form, and its place among those typed. */
export interface WrittenShare {
  readonly ur: string;
  readonly format: ShareFormat;
  readonly number: number;
}

/** The shares of `shown`, each once: the first of its copies (copiesAmong). */
function distinct(shown: readonly WrittenShare[]): WrittenShare[] {
  const placed = shown.map((share, place) => ({ place, share, ur: share.ur }));
  return withoutCopies(placed).map((placedShare) => placedShare.share);
}

/** A set that no caller can change: every array and object of it copied and frozen. */
function frozenSet(set: RepairedSet): RepairedSet {
  return Object.freeze({
    mnemonic: set.mnemonic,
    shares: Object.freeze(
      set.shares.map((share) =>
        Object.freeze({
          ...share,
          filled: Object.freeze(share.filled.map((element) => Object.freeze({ ...element }))),
        }),
      ),
    ),
    unsettled: Object.freeze(set.unsettled.map((element) => Object.freeze({ ...element }))),
    ...(set.unchecked === undefined ? {} : { unchecked: Object.freeze([...set.unchecked]) }),
  });
}

/**
 * The shares of a set to write again, as an export writes them: each in its own form or in one
 * form given, by its place among those typed. A share with an element that nothing settles, such
 * as one that could not be read at all, is left out: written down, it would be a guess passed off
 * as the share. Copies of one share are shown as typed and saved once. A class, so that what is
 * shown, what is saved and the forms among them follow the same rules.
 */
export class ShareExport {
  readonly #shown: readonly WrittenShare[];
  readonly #leftOut: readonly number[];
  readonly #total: number;

  private constructor(shown: readonly WrittenShare[], leftOut: readonly number[], total: number) {
    // Copied and frozen: the getters hand them out, and what is shown, saved and named must stay
    // what the export settled.
    this.#shown = Object.freeze(shown.map((share) => Object.freeze({ ...share })));
    this.#leftOut = Object.freeze([...leftOut]);
    this.#total = total;
  }

  /**
   * The shares of `set`, repaired or not, named by `places`, by their index in the set; each in
   * `format`, or without it in the form it was written in.
   */
  static of(set: RepairedShares, places: readonly number[], format?: ShareFormat): ShareExport {
    // Refused here, where it is bound to the shares, not once a share is written (AUD-001-API001).
    if (format !== undefined) assertShareFormat(format);
    // Array.from turns holes into undefined, which is refused: each share is named by its place,
    // and a missing one would be shown as "Share undefined".
    const named = Array.from(places);
    if (
      named.length < set.shares.length ||
      !named.every((place) => Number.isSafeInteger(place) && place >= 1)
    )
      throw new Error("Each share needs its place among those typed, a whole number from 1.");
    const leftOut = [...new Set(set.unsettled.map((element) => placeOf(named, element.share)))];
    const shown = set.shares.flatMap((share, index) =>
      leftOut.includes(named[index]!)
        ? []
        : [{ ur: share.ur, format: format ?? share.format, number: named[index]! }],
    );
    return new ShareExport(shown, leftOut, Math.max(...named));
  }

  /** The places of the shares left out, with an element that nothing settles. */
  get leftOut(): readonly number[] {
    return this.#leftOut;
  }

  /** Why each share left out is left out, one line each. */
  leftOutMessages(): string[] {
    return this.#leftOut.map(
      (place) =>
        `Share ${place} cannot be settled and is left out: read more of it, or use another copy.`,
    );
  }

  /** The shares to show, in the order typed, copies included. */
  get shown(): readonly WrittenShare[] {
    return this.#shown;
  }

  /** The shares to save: each once. */
  get saved(): readonly WrittenShare[] {
    return distinct(this.#shown);
  }

  /** The forms of the shares saved, each once, in their order. */
  get forms(): readonly ShareFormat[] {
    return [...new Set(this.saved.map((share) => share.format))];
  }

  /** The shares shown, by place, as a check that they belong to one set takes them. */
  get members(): readonly { readonly place: number; readonly ur: string }[] {
    return this.#shown.map((share) => ({ place: share.number, ur: share.ur }));
  }

  /** The highest place of the shares typed: the shares are shown as "N of" it. */
  get total(): number {
    return this.#total;
  }

  /** The note for copies saved once, or undefined when no share was typed twice. */
  get copiesNote(): string | undefined {
    return this.saved.length < this.#shown.length
      ? "Copies of one share are saved once."
      : undefined;
  }

  /** The same shares, every one in `format`, as cards show them. */
  inForm(format: ShareFormat): ShareExport {
    assertShareFormat(format);
    return new ShareExport(
      this.#shown.map((share) => ({ ...share, format })),
      this.#leftOut,
      this.#total,
    );
  }
}
