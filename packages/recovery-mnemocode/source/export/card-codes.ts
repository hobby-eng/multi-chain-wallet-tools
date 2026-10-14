// What a card prints for each element of a backup: the hex code of its color, which is the element
// itself in the color forms; or, for a Shamir share written in another form, the share's own code
// in that form (a word number, a Unicode code, a Bytewords word), when the colors only decorate the
// cards. Every card design prints through it, so that no design prints a color in place of a code.
// With the numbers in two digits that cards and the names of exported files share.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** The colors of the cards, and the codes they print when those are not the colors. */
export interface PrintedCodes {
  readonly colors: readonly string[];
  /** The codes printed in place of the colors' hex codes, one per color, in the same order. */
  readonly labels?: readonly string[] | undefined;
}

/** The code that the card of the element at `index` prints, without a #. */
export function printedCode(content: PrintedCodes, index: number): string {
  return content.labels?.[index] ?? content.colors[index]!.slice(1).toUpperCase();
}

/**
 * The file of page `index` of `count`, counted from 0, as every export names its pages: one page
 * has the name alone, several end in "-01", "-02" … ; `extension` without its point.
 */
export function pageFileName(
  base: string,
  index: number,
  count: number,
  extension: string,
): string {
  const suffix = count === 1 ? "" : `-${twoDigits(index + 1)}`;
  return `${base}${suffix}.${extension}`;
}

/** Refuses a card `index` that is not one of the `count` cards, counted from 0. */
export function assertCardIndex(index: number, count: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= count)
    throw new Error(`There is no card ${index + 1}: the cards are 1 to ${count}.`);
}

/**
 * The file name of separate card `index`, counted from 0: its place from 01, then the code it
 * prints, any spaces as hyphens so that the name needs no quotes in a shell, such as "03-A3F09C".
 */
export function separateCardName(content: PrintedCodes, index: number): string {
  return `${twoDigits(index + 1)}-${printedCode(content, index).replaceAll(" ", "-")}`;
}

/** A count or a number as cards print it: at least two digits, "07". */
export function twoDigits(number: number): string {
  return String(number).padStart(2, "0");
}

/**
 * The element at `index` as cards and sheets label it: its number, counted from 1 among all the
 * elements, then `gap` and its printed code, such as "07  A3F09C". Each design keeps its own gap.
 * No card names the count of the set: the cards end with decoys, which a count would tell apart
 * from nothing (owner, 2026-10-13).
 */
export function numberedCode(content: PrintedCodes, index: number, gap = "  "): string {
  return `${twoDigits(index + 1)}${gap}${printedCode(content, index)}`;
}
