// How codes are written as text: what separates the elements of one backup or one share, and how
// hexadecimal codes of one width are read, written apart or run together, with ? for what cannot
// be read. Every reader of codes and shares reads its text through it, and so does every guess of
// a text's form (sskr/transport.ts, core/encoded-form.ts), so that complete and marked text, codes
// and shares, and each guess and its reader take the same separators; what the units mean stays
// with each form's decoder.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** The spacing between elements: white space, commas and semicolons, as a character class. */
export const ELEMENT_SPACING = "\\s,;";

/**
 * What separates the elements of one backup or share: the spacing, and the # before a color. A
 * list of several shares is split at its semicolons before each is read (sskr/share-input.ts), so
 * that a semicolon inside one share's text separates elements only.
 */
export const ELEMENT_SEPARATORS = new RegExp(`[${ELEMENT_SPACING}#]+`, "u");

/** The hexadecimal digits of the Unicode code of a word (core/words.ts, UNICODE_CODES). */
export const UNICODE_CODE_DIGITS = 4;

/** A Unicode code point of the Basic Multilingual Plane as its four hexadecimal digits: "7684". */
export function hexCodePoint(point: number): string {
  return point.toString(16).toUpperCase().padStart(UNICODE_CODE_DIGITS, "0");
}

/** The elements of `text`, in capitals. */
export function codeTokens(text: string): string[] {
  return text.toUpperCase().split(ELEMENT_SEPARATORS).filter(Boolean);
}

/** The elements of `text` run together, in capitals: the text of codes written without spaces. */
export function compactCode(text: string): string {
  return codeTokens(text).join("");
}

/**
 * `text` in capitals without its spacing, the # before a color kept: for a reader that asks where
 * the # stand, as the colors of a seed phrase do (core/colors.ts, parseColors).
 */
export function unspacedCode(text: string): string {
  return text.toUpperCase().replace(new RegExp(`[${ELEMENT_SPACING}]+`, "gu"), "");
}

/**
 * Whether `text` is elements that each fit `element`, such as digits only: at least one, and
 * nothing but the separators between them. How a text looks to a guess of its form, which reads
 * it as its reader does (codeTokens).
 */
export function elementsFit(text: string, element: RegExp): boolean {
  const tokens = codeTokens(text);
  return tokens.length > 0 && tokens.every((token) => element.test(token));
}

/** Whether `token` is only marks: a code of which nothing can be read. */
export function wholeMark(token: string): boolean {
  return /^\?+$/u.test(token);
}

/**
 * What a ? means in codes run together, which the refusal of such codes adds: a whole code. One
 * digit is marked only where the codes are written apart, as a screen shows them beside the
 * joined text (owner, 2026-10-13).
 */
export const JOINED_MARKS_HINT =
  "In codes run together, a ? stands for a whole code; to mark one digit, write the codes apart, as the screen shows them.";

/** Whether `text` is hexadecimal codes run together with a ? among them (JOINED_MARKS_HINT). */
export function joinedWithMarks(text: string): boolean {
  const tokens = codeTokens(text);
  return (
    tokens.length === 1 &&
    /^[0-9A-F?]+$/u.test(tokens[0]!) &&
    tokens[0]!.includes("?") &&
    !wholeMark(tokens[0]!)
  );
}

/** `message`, with JOINED_MARKS_HINT after it where `text` is codes run together with marks. */
export function withJoinedMarksHint(message: string, text: string): string {
  return joinedWithMarks(text) ? `${message} ${JOINED_MARKS_HINT}` : message;
}

/** Whether `written` fits `pattern`, of the same length, a ? in the pattern fitting any symbol. */
export function fitsPattern(pattern: string, written: string): boolean {
  if (pattern.length !== written.length) return false;
  for (let index = 0; index < pattern.length; index += 1)
    if (pattern[index] !== "?" && pattern[index] !== written[index]) return false;
  return true;
}

/** How hexUnits reads codes written apart. */
export interface HexUnitsReading {
  /**
   * Whether a code written apart all of whose digits are ?, such as ???? or ??????, is given as a
   * lone ?, the same mark of the whole code: so a repair reads it (sskr/repair.ts). Kept as
   * written otherwise, as the search of marked codes takes it (core/missing-codes.ts).
   */
  readonly foldWholeMarks?: boolean;
}

/** A code of `width` hexadecimal digits written apart: a lone ?, or `width` digits or ?. */
function apartUnit(width: number): RegExp {
  return new RegExp(`^(?:\\?|[0-9A-F?]{${width}})$`, "u");
}

/**
 * Codes of `width` hexadecimal digits written apart, more than one, each a lone ? or `width`
 * symbols where each ? is one digit; undefined when the text is not written so. A single element
 * is read as codes run together (joinedHexUnits).
 */
export function apartHexUnits(text: string, width: number): string[] | undefined {
  const tokens = codeTokens(text);
  const unit = apartUnit(width);
  return tokens.length > 1 && tokens.every((token) => unit.test(token)) ? tokens : undefined;
}

/**
 * Codes of `width` hexadecimal digits run together, the separators left out, where each ? stands
 * for a whole code; undefined when the text is not written so.
 */
export function joinedHexUnits(text: string, width: number): string[] | undefined {
  const compact = compactCode(text);
  const units = compact.match(new RegExp(`[0-9A-F]{${width}}|\\?`, "gu"));
  return units !== null && units.join("") === compact ? units : undefined;
}

/**
 * Codes of `width` hexadecimal digits written apart (apartHexUnits), where each ? is one digit;
 * or run together (joinedHexUnits), where each ? stands for a whole code. Undefined when the text
 * is neither.
 */
export function hexUnits(
  text: string,
  width: number,
  reading: HexUnitsReading = {},
): string[] | undefined {
  const apart = apartHexUnits(text, width);
  if (apart === undefined) return joinedHexUnits(text, width);
  return reading.foldWholeMarks === true
    ? apart.map((token) => (wholeMark(token) ? "?" : token))
    : apart;
}

/** Complete codes of `width` hexadecimal digits, apart or run together; undefined otherwise. */
export function completeHexUnits(text: string, width: number): string[] | undefined {
  const units = hexUnits(text, width);
  return units !== undefined && units.every((unit) => !unit.includes("?")) ? units : undefined;
}
