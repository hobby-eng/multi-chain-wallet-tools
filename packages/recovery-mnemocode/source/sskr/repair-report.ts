// What a repair of shares with unreadable elements tells the person, as lines of data with their
// texts: before the search, what the shares settle together, what is open and how long it takes on
// this machine, what would help, and the question or notice for the search, with the date search
// that follows for a Seedshift phrase; after it, what the repair filled in, share by share, or that
// no phrase fits.
//
// Needs from the host: the plan's assessment (joint-repair.ts), the digest checks per second that
// the host measured (JointRepair.triesPerSecond), the work of a date search (ShareUnmasking
// .dateWork), and the place at which each share was typed.
// Does not: search, ask whether to search, or show the lines: a host maps each kind of line to its
// own style (the command line: a status line, a grey hint, a warning, a README link).

import { asksFirst } from "../core/search-turns.js";
import type { JointAssessment } from "./joint-results.js";
import { CORRECT_WRITTEN_COPY, counted, counting, duration } from "../core/search-plan.js";
import type { RepairedShares } from "./joint-results.js";
import { placeOf } from "../core/places.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.repair-report", {
  "repair-report-positive-pace": () => "A repair report needs a positive pace.",
});

/** The refusal when the search of marked shares found no phrase. */
export const NO_PHRASE_FITS =
  "No phrase fits these shares: a ? may stand at a wrong place, or an element without ? be misread.";
/** Elements named as help after the assessment. */
const NAMED_HELPS = 3;
/** Wrong phrases expected by chance from which the assessment mentions them. */
const NOTABLE_FALSE = 0.01;
/** The README section on damaged shares, which the report and the command line's menu link to. */
export const REPAIR_ANCHOR = "damaged-shares";

/**
 * One line of a report: a status with its label and value, good or not; a hint that can be passed
 * over; a notice; a warning; or a pointer to the documentation section with `anchor`.
 */
export type ReportLine =
  | {
      readonly kind: "status";
      readonly label: string;
      readonly value: string;
      readonly good: boolean;
    }
  | { readonly kind: "hint" | "notice" | "warning"; readonly text: string }
  | { readonly kind: "more"; readonly anchor: string };

/** What a repair filled in at one element that ? marked. */
export interface RepairedElement {
  /** The element's position in its share, counted from 1. */
  readonly position: number;
  /** What the repair put there, in the share's own form. */
  readonly value: string;
  /** Nothing settles it: the phrase does not depend on it, and it is not to be copied. */
  readonly guess: boolean;
}

/** What a repair filled in in one share, the share named by its place among those typed. */
export interface ShareRepairs {
  readonly share: number;
  readonly elements: readonly RepairedElement[];
}

/** The texts around what a repair filled in, for a host that lays the elements out itself. */
export const REPAIR_NOTES = Object.freeze({
  heading: "Filled in where ? stood:",
  guesses: "The phrase does not depend on the guesses, and nothing settles them: do not copy them.",
  correct: CORRECT_WRITTEN_COPY,
});

/** A date search after the share search, for each phrase it finds: its size and its pace. */
export interface DateWork {
  readonly combinations: number;
  readonly secondsEach: number;
}

const count = counting;

/**
 * Seconds that the date search of `phrases` phrases takes, each searched with `work`: the one
 * reckoning of its time, which the notice, the question and the limits all take.
 */
function dateSeconds(work: DateWork, phrases: number): number {
  return work.combinations * work.secondsEach * phrases;
}

/** How a date search names its phrases when there are several: " for each of the 3 phrases". */
function forEachPhrase(phrases: number): string {
  return phrases > 1 ? ` for each of the ${phrases} phrases` : "";
}

/**
 * A copy of `assessment` that nothing can change, every array and object of it frozen: a report
 * keeps the assessment it was built with, and whether a search is asked for first must not change
 * with the caller's object (AUD-009-FUN001).
 */
function ownedAssessment(assessment: JointAssessment): JointAssessment {
  return Object.freeze({
    ...assessment,
    shares: Object.freeze(
      Array.from(assessment.shares, (share) =>
        Object.freeze({ ...share, forms: Object.freeze([...share.forms]) }),
      ),
    ),
    helps: Object.freeze(Array.from(assessment.helps, (help) => Object.freeze({ ...help }))),
  });
}

// The naming of a share by its place belongs to core/places.ts; here too for its old callers.
export { placeOf };

/**
 * The report of a repair: the assessment of the shares as typed, with the pace of this machine
 * and the place of each share, and its texts. A class, so that the time, the limit without a
 * question and the lines are all worked out from the same assessment and pace.
 */
export class RepairReport {
  readonly #assessment: JointAssessment;
  readonly #triesPerSecond: number;
  readonly #places: readonly number[] | undefined;

  /** `places` names each share by its place among those typed, by its index in the plan. */
  constructor(assessment: JointAssessment, triesPerSecond: number, places?: readonly number[]) {
    if (!(triesPerSecond > 0)) throw ERRORS.create("repair-report-positive-pace", []);
    this.#assessment = ownedAssessment(assessment);
    this.#triesPerSecond = triesPerSecond;
    this.#places = places === undefined ? undefined : Object.freeze([...places]);
  }

  /**
   * The notice before the date search of `phrases` phrases restored from complete shares, each
   * searched with `work`: its size and about how long it takes on this machine.
   */
  static dateSearchNotice(work: DateWork, phrases: number): string {
    return `The search tries ${counted(work.combinations, "date combination")}${forEachPhrase(phrases)}: ${duration(dateSeconds(work, phrases))}.`;
  }

  /**
   * What a repair filled in where ? marked an element, share by share, so that the written copy
   * can be corrected; shares without a ? are left out. An element that nothing settles is a guess.
   * Each share is named by its place in `places`, by its index in the set.
   */
  static repairs(set: RepairedShares, places?: readonly number[]): ShareRepairs[] {
    const repairs: ShareRepairs[] = [];
    set.shares.forEach((share, index) => {
      if (!share.repaired) return;
      const guesses = new Set(
        set.unsettled.filter((element) => element.share === index + 1).map((e) => e.position),
      );
      repairs.push({
        share: placeOf(places, index + 1),
        elements: share.filled.map(({ position, value }) => ({
          position,
          value,
          guess: guesses.has(position),
        })),
      });
    });
    return repairs;
  }

  /**
   * The repairs as lines of text (repairs), one warning for each share, a guess said to be one,
   * then the notes on guesses and on correcting the written copy (notes).
   */
  static repairLines(set: RepairedShares, places?: readonly number[]): ReportLine[] {
    const lines: ReportLine[] = RepairReport.repairs(set, places).map(({ share, elements }) => ({
      kind: "warning",
      text: `Share ${share}: ${elements
        .map((e) => `element ${e.position} is ${e.value}${e.guess ? " (a guess)" : ""}`)
        .join(", ")}.`,
    }));
    return [...lines, ...RepairReport.notes(set)];
  }

  /**
   * The notes after what a repair of `set` filled in: that the guesses are not to be copied, where
   * an element is unsettled, and, where a share was repaired, that the written copy is to be
   * corrected. A host that lays the repairs out itself, such as a table, shows these lines after
   * them.
   */
  static notes(set: RepairedShares): ReportLine[] {
    const lines: ReportLine[] = [];
    if (set.unsettled.length > 0) lines.push({ kind: "warning", text: REPAIR_NOTES.guesses });
    if (set.shares.some((share) => share.repaired))
      lines.push({ kind: "notice", text: REPAIR_NOTES.correct });
    return lines;
  }

  get assessment(): JointAssessment {
    return this.#assessment;
  }

  /** Digest checks per second on this machine. */
  get triesPerSecond(): number {
    return this.#triesPerSecond;
  }

  /** Digest checks of the search. */
  get combinations(): number {
    return this.#assessment.combinations;
  }

  /**
   * Seconds that the search takes here, with `dates` searched for each phrase it finds: the right
   * one, and those that pass the digest by chance (expectedFalse).
   */
  seconds(dates?: DateWork): number {
    const phrases = 1 + this.#assessment.expectedFalse;
    return (
      this.combinations / this.#triesPerSecond +
      (dates === undefined ? 0 : dateSeconds(dates, phrases))
    );
  }

  /** The time of the search in words, with `dates` as in seconds. */
  duration(dates?: DateWork): string {
    return duration(this.seconds(dates));
  }

  /**
   * Whether the search is to be asked for first: it takes more checks than `limit`, or the date
   * search of each phrase it finds, `dates`, more date combinations than `dateLimit`; without
   * either limit, it takes longer than QUESTION_SECONDS (search-turns.ts) on this machine, the date
   * search included.
   */
  needsQuestion(limit?: number, dates?: DateWork, dateLimit?: number): boolean {
    if (limit === undefined && dateLimit === undefined) return asksFirst(0, this.seconds(dates));
    const shares = limit !== undefined && this.combinations > limit;
    const dated = dateLimit !== undefined && dates !== undefined && dates.combinations > dateLimit;
    return shares || dated;
  }

  /**
   * Whether the date search of `phrases` phrases restored from complete shares, each searched with
   * `work`, is to be asked for first: it tries more date combinations in all than `limit`, the
   * person's own limit, or without one takes longer than QUESTION_SECONDS (search-turns.ts) on this
   * machine.
   */
  static dateSearchNeedsQuestion(work: DateWork, phrases: number, limit?: number): boolean {
    return asksFirst(work.combinations * phrases, dateSeconds(work, phrases), limit);
  }

  /** The question before such a date search: "Search 3,650 date combinations, about 9 hours?" */
  static dateSearchQuestion(work: DateWork, phrases: number): string {
    return `Search ${counted(work.combinations, "date combination")}${forEachPhrase(phrases)}, ${duration(dateSeconds(work, phrases))}?`;
  }

  /** What the search tries, as its question and notice name it, with `dates` as in seconds. */
  searchSize(dates?: DateWork): string {
    return dates === undefined
      ? `${count(this.combinations)} combinations`
      : `${counted(this.combinations, "share combination")}, then ${counted(dates.combinations, "date combination")} for each phrase found`;
  }

  /** The question before a search that needsQuestion, with `dates` as in seconds. */
  searchQuestion(dates?: DateWork): string {
    return `Search ${this.searchSize(dates)}, ${this.duration(dates)}?`;
  }

  /**
   * What the search takes, for a host that cannot ask its question and names the limit that
   * allows it instead: "The search takes 65,536 checks, about 2 seconds."
   */
  searchExtent(dates?: DateWork): string {
    return `The search takes ${count(this.combinations)} checks, ${this.duration(dates)}.`;
  }

  /** The notice before a search that goes ahead without a question, with `dates` as in seconds. */
  searchNotice(dates?: DateWork): string {
    return `The search tries ${this.searchSize(dates)}: ${this.duration(dates)}.`;
  }

  /** What the shares settle together, what is open and what would help; none for a refusal. */
  lines(): ReportLine[] {
    const assessment = this.#assessment;
    if (assessment.verdict === "determined")
      return [
        {
          kind: "status",
          label: "Marked elements:",
          value: "settled by the shares together",
          good: true,
        },
      ];
    if (assessment.verdict === "no-fit" || assessment.verdict === "not-enough") return [];
    const lines: ReportLine[] = [
      {
        kind: "status",
        label: "Open combinations:",
        value: `${count(assessment.combinations)} (2^${Math.ceil(Math.log2(assessment.combinations))}), ${this.duration()}`,
        good: false,
      },
    ];
    for (const help of assessment.helps.slice(0, NAMED_HELPS))
      lines.push({
        kind: "hint",
        text: `Reading element ${help.position} of share ${placeOf(this.#places, help.share)} would leave 2^${help.openBits}.`,
      });
    if (assessment.moreShares > 0)
      lines.push({
        kind: "hint",
        text: `${assessment.moreShares} more ${assessment.moreShares === 1 ? "share" : "shares"} without marks would settle everything.`,
      });
    if (assessment.expectedFalse >= NOTABLE_FALSE)
      lines.push({
        kind: "warning",
        text: `About ${assessment.expectedFalse.toPrecision(2)} wrong phrases may pass by chance; every phrase found is listed.`,
      });
    lines.push({ kind: "more", anchor: REPAIR_ANCHOR });
    return lines;
  }
}
