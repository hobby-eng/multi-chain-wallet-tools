// What a host says of a search before it starts: its size, about how long it takes here, whether
// it is asked for first, and whether its time is said; and what it says once a search filled in
// what could not be read. The date search, the search of marked codes and the share repair each
// plan through it, so that every question and notice reads alike; a host adds only its own words,
// such as the option that allows a longer search.
//
// Host-neutral: it imports only the rule of when a search is asked for (search-turns.ts).

import {
  asksFirst,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "./search-turns.js";

/**
 * What to do once a search filled in what could not be read, codes or the elements of shares: the
 * written copy is corrected, and the wallet checked.
 */
export const CORRECT_WRITTEN_COPY =
  "Correct the written copy; then check the wallet that comes back.";

/** A search expected to take at least a minute has its time said before it starts. */
export const TELL_SECONDS = SECONDS_PER_MINUTE;

/** The units that a length of time is said in, the largest first. */
const TIME_UNITS = [
  ["day", SECONDS_PER_DAY],
  ["hour", SECONDS_PER_HOUR],
  ["minute", SECONDS_PER_MINUTE],
  ["second", 1],
] as const;

/** A number as the messages write it: 65,536. */
export function counting(value: number): string {
  return value.toLocaleString("en-US");
}

/** A length of time in words: "about 3 minutes", or "under a second". */
export function duration(seconds: number): string {
  if (seconds < 1) return "under a second";
  const [name, size] = TIME_UNITS.find(([, size]) => seconds >= size)!;
  const rounded = Math.round(seconds / size);
  return `about ${counting(rounded)} ${name}${rounded === 1 ? "" : "s"}`;
}

/** `value` and `noun`, in the plural unless the value is 1: "1 share combination". */
export function counted(value: number, noun: string): string {
  return `${counting(value)} ${noun}${value === 1 ? "" : "s"}`;
}

/**
 * The plan of one search. A class, so that its question, its notice and its refusal are built
 * from the same size and time; a time under a second is not said.
 */
export class SearchPlan {
  /** What is searched, such as "128 candidates" or "10 date combinations". */
  readonly size: string;
  /** The combinations tried, counted against the person's limit. */
  readonly count: number;
  /** About how long it takes in this host, in seconds. */
  readonly seconds: number;
  /** Whether it is asked for first: over the person's limit, or without one too long. */
  readonly ask: boolean;
  /** Whether its time is said before it starts, when it is not asked for: TELL_SECONDS or more. */
  readonly tell: boolean;

  private constructor(size: string, count: number, seconds: number, ask: boolean) {
    this.size = size;
    this.count = count;
    this.seconds = seconds;
    this.ask = ask;
    this.tell = !ask && seconds >= TELL_SECONDS;
  }

  /**
   * The plan of `count` combinations about `seconds` long, with `limit`, the person's own, if
   * any.
   */
  static of(size: string, count: number, seconds: number, limit?: number): SearchPlan {
    return new SearchPlan(size, count, seconds, asksFirst(count, seconds, limit));
  }

  /** ", about 3 minutes", or nothing under a second. */
  get #time(): string {
    return this.seconds >= 1 ? `, ${duration(this.seconds)}` : "";
  }

  /**
   * The question before a search that is asked for: "Search 10 date combinations, about 9
   * hours?"
   */
  question(): string {
    return `Search ${this.size}${this.#time}?`;
  }

  /**
   * What the search tries, for a refusal where nothing can be asked; the host says what allows
   * it.
   */
  extent(): string {
    return `The search tries ${this.size}${this.#time}.`;
  }

  /** The notice before a search whose time is said (tell). */
  notice(): string {
    return `The search tries ${this.size}${this.#time}; ${PROGRESS_SHOWN}.`;
  }

  /**
   * The notice of the time alone, for a host that has said the size before: "It takes about 3
   * minutes; progress is shown." Said, as `notice`, only for a search whose time is told.
   */
  timeNotice(): string {
    return `It takes ${duration(this.seconds)}; ${PROGRESS_SHOWN}.`;
  }
}

/** How a notice before a search ends. */
const PROGRESS_SHOWN = "progress is shown";
