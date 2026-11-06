import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Bip39Input, Bip39InputError } from "./bip39-input.js";

type WordReadErrorCode = "bip39.word.text" | "bip39.word.unknown" | "bip39.word.missing";
const SUGGESTION_DISTANCE = 2;
const SUGGESTION_COUNT = 5;

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1)
      current.push(
        Math.min(
          (current[rightIndex] ?? 0) + 1,
          (previous[rightIndex + 1] ?? 0) + 1,
          (previous[rightIndex] ?? 0) + (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

/** A word-reading refusal; only the caller's trusted label, never the supplied word, is described. */
export class Bip39WordError extends Error {
  readonly code: WordReadErrorCode;
  constructor(code: WordReadErrorCode, label = "Word") {
    const messages = {
      "bip39.word.text": "BIP39 text must be a string.",
      "bip39.word.unknown": `${label} is not an English BIP39 word.`,
      "bip39.word.missing": "The English BIP39 word is unavailable.",
    };
    super(messages[code]);
    this.name = "Bip39WordError";
    this.code = code;
  }
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Bip39WordError("bip39.word.text");
  return Bip39Input.text(value);
}

/** English BIP39 spelling, including the unique four-letter prefixes MHFE accepts. */
export class Bip39WordReader {
  readonly #indexes = new Map(wordlist.map((word, index) => [word, index]));
  readonly #maximumWordUnits = Math.max(...wordlist.map((word) => word.length));

  /** Longest canonical English word, in UTF-16 code units, derived from the pinned dictionary. */
  get maximumWordUnits(): number {
    return this.#maximumWordUnits;
  }

  /** Exact canonical spelling only; no prefix, case or whitespace conversion is performed. */
  exactIndex(raw: unknown): number | undefined {
    return this.#indexes.get(text(raw));
  }

  /** Canonical word for a zero-based dictionary index; invalid indexes fail with bip39.word.missing. */
  at(index: number): string {
    const word = Number.isInteger(index) ? wordlist[index] : undefined;
    if (word === undefined) throw new Bip39WordError("bip39.word.missing");
    return word;
  }

  /** At most five dictionary indexes within edit distance two; longer input has provably no candidate. */
  suggestions(raw: unknown): readonly number[] {
    const value = text(raw);
    if (value.length > this.#maximumWordUnits + SUGGESTION_DISTANCE || !/^[a-z]+$/u.test(value))
      return [];
    return wordlist
      .flatMap((candidate, index) => {
        if (Math.abs(candidate.length - value.length) > SUGGESTION_DISTANCE) return [];
        const distance = editDistance(value, candidate);
        return distance <= SUGGESTION_DISTANCE ? [{ candidate, index, distance }] : [];
      })
      .sort(
        (left, right) =>
          left.distance - right.distance || left.candidate.localeCompare(right.candidate),
      )
      .slice(0, SUGGESTION_COUNT)
      .map(({ index }) => index);
  }

  /** Zero-based English word index; unknown/text refusals use stable codes and a trusted label. */
  index(raw: unknown, label = "Word"): number {
    const typed = text(raw).trim().toLowerCase();
    const exact = this.#indexes.get(typed);
    if (exact !== undefined) return exact;
    // BIP39's English list is unique at four letters; shorter complete words remain valid.
    if (typed.length >= 4 && /^[a-z]+$/u.test(typed)) {
      const matches = wordlist.filter((word) => word.startsWith(typed));
      const [match] = matches;
      if (matches.length === 1 && match !== undefined) {
        const index = this.#indexes.get(match);
        if (index !== undefined) return index;
        throw new Bip39WordError("bip39.word.missing");
      }
    }
    throw new Bip39WordError("bip39.word.unknown", label);
  }

  /** Canonical English word; index/text/unknown failures keep the reader's stable error code. */
  word(raw: unknown, label = "Word"): string {
    const word = wordlist[this.index(raw, label)];
    if (word === undefined) throw new Bip39WordError("bip39.word.missing");
    return word;
  }

  /** Whether input denotes a word; unexpected library failures are passed on, not read as unknown. */
  accepts(raw: unknown): boolean {
    try {
      this.index(raw);
      return true;
    } catch (cause) {
      if (cause instanceof Bip39InputError) return false;
      if (cause instanceof Bip39WordError && cause.code !== "bip39.word.missing") return false;
      throw cause;
    }
  }

  /** Lexical whitespace-delimited word count, without retaining text or asserting BIP39 validity. */
  wordCount(raw: unknown): number {
    const words = text(raw).matchAll(/\S+/gu);
    let count = 0;
    while (!words.next().done) count += 1;
    return count;
  }
}

/** Shared immutable-vocabulary reader; it holds no typed phrase or word between calls. */
export const ENGLISH_BIP39_WORDS = new Bip39WordReader();
