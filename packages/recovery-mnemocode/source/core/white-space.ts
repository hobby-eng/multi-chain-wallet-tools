// The rules of typed text that every reader shares: white space around what a person types or
// pastes, removed the same way by every wallet check, whether it reads an address, a key, a WIF or
// a fingerprint; the byte order mark that an editor may put at the start of a file; and the ASCII
// case that the address formats define.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** White space at either end of `text`, as people paste and type it. */
const WHITE_SPACE_AT_ENDS = /^\p{White_Space}+|\p{White_Space}+$/gu;

/**
 * `text` without white space at its ends: Unicode's White_Space, as Rust's str::trim takes it, so
 * that a value reads the same here as in the Rust implementations of these checks.
 * String.prototype.trim differs in two characters: it removes a byte order mark (U+FEFF), which is
 * no white space, and keeps NEL (U+0085), which is.
 */
export function trimWhiteSpace(text: string): string {
  return text.replace(WHITE_SPACE_AT_ENDS, "");
}

/** U+FEFF, which an editor may put at the start of a text file. */
const BYTE_ORDER_MARK = "\uFEFF";

/** The text of a file without the byte order mark that an editor may have put at its start. */
export function withoutByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
}

/** ASCII case only, as the address formats define it; other letters stay as they are. */
export function asciiLowercase(text: string): string {
  return text.replace(/[A-Z]+/gu, (letters) => letters.toLowerCase());
}

export function asciiUppercase(text: string): string {
  return text.replace(/[a-z]+/gu, (letters) => letters.toUpperCase());
}
