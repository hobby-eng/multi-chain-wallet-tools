// What the searches of the library share in how they run in a host: what a host passes to a run
// (SearchRun: a signal and its own turn), a turn of the host's event loop now and then
// (SearchTurns), so that a page or a terminal can show progress and stop a search of hours
// (AUD-008-API001), the shape of their progress (SearchProgress), and the checks of the counts a
// host passes to a run. A small service that the date search, the word search, the search of
// marked codes and the share repair use by composition; it holds nothing.
//
// Needs from the host: nothing; setTimeout, which every host has, is the default turn.

import { inWholeRange, wholeNumbersFrom } from "./typed-number.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.search-turns", {
  "whole-number-more": {
    kind: "range",
    text: (value0: string, value1: string) =>
      `${value0} must be a whole number of ${value1} or more.`,
  },
});

/**
 * A search expected to take longer than this on the host's computer is asked for first: twelve
 * hours. Up to then it starts at once, with its progress shown and a way to stop it; a longer
 * one is a choice the person makes. The share repair and the date search both ask by it.
 */
export const QUESTION_HOURS = 12;
/** Seconds in a minute, an hour and a day: the units that search times are limited and said in. */
export const SECONDS_PER_MINUTE = 60;
/** Seconds in an hour. */
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
/** Seconds in a day. */
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
/** QUESTION_HOURS in seconds: a search expected to take longer is asked for first. */
export const QUESTION_SECONDS = QUESTION_HOURS * SECONDS_PER_HOUR;

/**
 * Whether a search of `count` combinations, about `seconds` long here, is asked for first: when it
 * tries more than `limit`, the person's own limit, or without one takes longer than
 * QUESTION_SECONDS. Every search asks by it.
 */
export function asksFirst(count: number, seconds: number, limit?: number): boolean {
  return limit !== undefined ? count > limit : seconds > QUESTION_SECONDS;
}

/** Milliseconds in a second, for the times of the clock below. */
export const MILLISECONDS_PER_SECOND = 1_000;

/**
 * The clock of the searches, in milliseconds: a monotonic one, which never goes back when the
 * system's time is set, so that neither a turn nor a pace is measured wrong.
 */
function now(): number {
  return performance.now();
}

/**
 * Starts timing: the function returned gives the seconds since. How every search times its pace,
 * with the start and the end read from one clock.
 */
export function startTimer(): () => number {
  const start = now();
  return () => (now() - start) / MILLISECONDS_PER_SECOND;
}

/** Milliseconds of search between two turns of the host's event loop. */
export const TURN_MILLISECONDS = 50;

/** Waits for the next task of the event loop, which lets a page or a worker take messages. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** What every search takes from its host to run: a signal that stops it, and its own turn. */
export interface SearchRun {
  /**
   * Stops the search at its next look at its turns (SearchTurns.due or take), even between two
   * turns. A stop is no failure (CORE-22): the search returns what it found before it, marked
   * as stopped, and publishes nothing found after it.
   */
  readonly signal?: AbortSignal | undefined;
  /** How the search lets the host's event loop run; a zero timeout by default. */
  readonly turn?: (() => Promise<void>) | undefined;
}

/**
 * How far a search has come, as every search tells it: the tries it has made, of how many when it
 * knows, and what passed its own check so far. Each search adds what else it counts, such as the
 * phrases that the wallet matched.
 */
export interface SearchProgress {
  /** Tries made so far: date combinations, candidates, or digest checks of shares. */
  readonly checked: number;
  /** Tries in all, where the search knows them. */
  readonly total?: number | undefined;
  /** What passed the search's own check so far: a BIP39 checksum, a digest or the host's check. */
  readonly found: number;
}

/**
 * What a look at the turns of a search tells: go on ("running"), the host's event loop ran and
 * the search tells its progress ("turned"), or the host's signal says stop ("stopped").
 */
export type TurnState = "running" | "turned" | "stopped";

/**
 * The turns of one search: when TURN_MILLISECONDS of work have passed since the last turn, it lets
 * the host's event loop run, then tells whether the host's signal says stop; a stop that came
 * between two turns is told at the next look. A stop is a state of the search, returned, not an
 * error (CORE-22). The date search, the word search, the search of marked codes and the share
 * repair each take one, so that they turn and stop alike.
 */
export class SearchTurns {
  readonly #turn: () => Promise<void>;
  readonly #signal: AbortSignal | undefined;
  #last: number;

  /** Starts the turns of a search; with a signal already aborted, it is stopped at once. */
  constructor(signal?: AbortSignal, turn: () => Promise<void> = nextTask) {
    this.#signal = signal;
    this.#turn = turn;
    this.#last = now();
  }

  /** The turns of a search that runs with `run`: its signal, and its turn or a zero timeout. */
  static of(run: SearchRun): SearchTurns {
    return new SearchTurns(run.signal, run.turn);
  }

  /** Whether the host's signal says stop. */
  get stopped(): boolean {
    return this.#signal?.aborted === true;
  }

  /**
   * Lets the host run if a turn is due: "turned" when it did, so that the search tells its
   * progress, "stopped" when the host's signal says stop, before or after the turn.
   */
  async due(): Promise<TurnState> {
    // Heard at once: a host may stop a search from its progress, between two turns.
    if (this.stopped) return "stopped";
    if (now() - this.#last < TURN_MILLISECONDS) return "running";
    return (await this.take()) === "stopped" ? "stopped" : "turned";
  }

  /**
   * Lets the host run now, however soon after the last turn: for steps that are few, each of
   * which may take a turn, such as the shares of a repair's assessment, so that a key read as
   * Ctrl+C is heard even when all of them take less than a turn's time.
   */
  async take(): Promise<"running" | "stopped"> {
    if (this.stopped) return "stopped";
    await this.#turn();
    this.#last = now();
    return this.stopped ? "stopped" : "running";
  }
}

/**
 * Whether the host's signal still lets the search go on. A search asks it just before it
 * publishes a match and before it returns what it found, after its last wait (a host's answer, a
 * turn), so that nothing found after a stop reaches the host (AUD-015-API001).
 */
export function stillRunning(run: SearchRun): boolean {
  return run.signal?.aborted !== true;
}

/** A count that a run keeps, such as the matches it shows: a whole number of 0 or more. */
export function keptCount(
  count: number | undefined,
  fallback: number,
  name: string,
  minimum = 0,
): number {
  if (count === undefined) return fallback;
  if (!inWholeRange(count, wholeNumbersFrom(minimum)))
    throw ERRORS.create("whole-number-more", [`${name}`, `${minimum}`]);
  return count;
}
