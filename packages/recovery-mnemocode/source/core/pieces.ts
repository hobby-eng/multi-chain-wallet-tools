// Text or a list cut into pieces of one width: the digits of words and colors, the code points of
// Color Unicode, bits and hexadecimal bytes. Each caller keeps its own named width; a length that
// is no whole number of pieces is refused, never shortened.
//
// Host-neutral: it imports only typed-number.ts (test/portable-modules.test.ts).

import { inWholeRange, wholeNumbersFrom } from "./typed-number.js";

/** The widths a piece may have: whole numbers of 1 or more. */
const PIECE_WIDTHS = wholeNumbersFrom(1);

/** Refuses a width below 1, and a length that is no whole number of pieces of that width. */
function assertWholePieces(length: number, width: number): void {
  if (!inWholeRange(width, PIECE_WIDTHS))
    throw new RangeError("A piece needs a whole width of at least 1.");
  if (length % width !== 0)
    throw new RangeError(`A length of ${length} is no whole number of pieces of ${width}.`);
}

/** `text` cut into pieces of `width` characters (UTF-16 code units), in order. */
export function textPieces(text: string, width: number): string[];
/**
 * `text` cut into pieces of `width` characters, each read by `read` as it is cut: one array, for
 * the paths that a search runs for every candidate.
 */
export function textPieces<T>(text: string, width: number, read: (piece: string) => T): T[];
export function textPieces<T>(
  text: string,
  width: number,
  read?: (piece: string) => T,
): (string | T)[] {
  assertWholePieces(text.length, width);
  return Array.from({ length: text.length / width }, (_, index) => {
    const piece = text.slice(index * width, (index + 1) * width);
    return read === undefined ? piece : read(piece);
  });
}

/** `items` cut into pieces of `width` items, in order. */
export function listPieces<T>(items: readonly T[], width: number): T[][] {
  assertWholePieces(items.length, width);
  return Array.from({ length: items.length / width }, (_, index) =>
    items.slice(index * width, (index + 1) * width),
  );
}
