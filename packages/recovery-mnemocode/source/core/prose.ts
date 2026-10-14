// Small rules of running text that the library and every front end share: a number as a word, a
// clause made the start of a sentence or put after other words, and a message after its place.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** The small numbers as running text writes them; larger ones stay in digits. */
const NUMBER_WORDS = Object.freeze([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const);

/** `value` as a word where running text writes it so, "three"; otherwise its digits, "12". */
export function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

/** `text` with its first letter in capitals, for a clause or label that starts a sentence. */
export function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Two capitals at the start: an abbreviation such as SSKR or PDF, which keeps its case. */
const ABBREVIATION_START = /^[A-Z]{2}/u;

/**
 * `text` with its first letter made small, to follow other words, unless it begins an
 * abbreviation such as SSKR or PDF.
 */
export function lowerFirst(text: string): string {
  return ABBREVIATION_START.test(text) ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * `message` after the place it is about and `joint`: "Share 2: unknown …", "Date 1: the day …",
 * "Share 2 cannot be read: …". The message's first letter is made small (lowerFirst).
 */
export function afterPlace(
  noun: string,
  place: number,
  message: string,
  joint: string = ": ",
): string {
  return `${noun} ${place}${joint}${lowerFirst(message)}`;
}
