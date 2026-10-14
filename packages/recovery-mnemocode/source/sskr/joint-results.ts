// What a joint repair of marked shares tells (joint-repair.ts): each share on its own, the shares
// together before a search, and the sets that the shares restore, with what was left unsettled.

import { type ReadRepairableShare } from "./repair.js";
import { type ShareFormat } from "./transport.js";

/** A marked element: its share and place, both counted from 1. */
export interface MarkedElement {
  readonly share: number;
  readonly position: number;
}

/** What one share is on its own. */
export interface ShareAssessment {
  readonly marks: number;
  readonly forms: readonly ShareFormat[];
  /** Bits still open when the share is solved alone, the fewest over its readings. */
  readonly openAlone: number;
}

/** What reading one more element would leave open. */
export interface ElementHelp extends MarkedElement {
  readonly openBits: number;
}

/** What the shares are together, before any search. */
export interface JointAssessment {
  readonly shares: readonly ShareAssessment[];
  readonly secretBytes?: number;
  readonly threshold?: number;
  /** Ways to read the shares that fit every equation. */
  readonly branches: number;
  /** Bits that only the digest can decide, the most over the branches. */
  readonly openBits: number;
  /** Digest checks of the search. */
  readonly combinations: number;
  /** Phrases expected to pass the digest by chance: every wrong try passes with 2^-32. */
  readonly expectedFalse: number;
  /** More shares without marks that would settle every open bit. */
  readonly moreShares: number;
  /** Elements whose reading would leave fewer bits open, best first. */
  readonly helps: readonly ElementHelp[];
  /** The share, counted from 1, that no reading fits: the one that a "no-fit" refusal names. */
  readonly unfit?: number;
  /**
   * "determined": no bit is open, and the search checks one candidate per way to read the shares;
   * "search": the digest decides among `combinations`; "stopped": the host stopped the assessment,
   * and nothing is planned (CORE-22); the others refuse, with `reason`.
   */
  readonly verdict: "determined" | "search" | "too-uncertain" | "no-fit" | "not-enough" | "stopped";
  readonly reason?: string;
}

/** The shares of a set as written again, and what a repair left unsettled in them. */
export interface RepairedShares {
  readonly shares: readonly ReadRepairableShare[];
  /** Elements that the phrase does not depend on and nothing settles: their values are a guess. */
  readonly unsettled: readonly MarkedElement[];
}

/** A phrase that the shares restore, with every share as repaired. */
export interface RepairedSet extends RepairedShares {
  readonly mnemonic: string;
  /**
   * Shares, counted from 1, that took no part and were not checked: members of a group with fewer
   * than its threshold, in a set of several groups.
   */
  readonly unchecked?: readonly number[];
}

/**
 * What a search of marked shares gives: every distinct set that passed, possibly none, and whether
 * the host stopped it (SearchRun.signal), when the sets are only those found before the stop.
 */
export interface RepairSearch {
  readonly sets: RepairedSet[];
  readonly stopped: boolean;
}
