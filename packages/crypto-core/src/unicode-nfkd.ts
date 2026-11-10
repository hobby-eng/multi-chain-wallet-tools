// NFKD of Unicode 18.0.0, the Deriver's own (UAX #15): the compatibility decomposition of every code
// point, recursively, Hangul syllables by the standard's arithmetic, then combining marks in
// canonical order. BIP39 normalizes a passphrase with NFKD, and MHFE's specification pins Unicode
// 18.0.0; the browser's own String.prototype.normalize follows whatever version the browser
// carries, so a passphrase with a newly assigned character (U+209D, for one, became "w") would give
// another seed in another browser. The tables (unicode-nfkd-data.ts) are generated from Unicode
// 18.0.0's UnicodeData.txt; the unit test checks every line of its NormalizationTest.txt.
import { COMBINING_CLASSES, DECOMPOSITIONS, UNICODE_VERSION } from "./unicode-nfkd-data.js";

/** The Unicode version of this NFKD. */
export const NFKD_UNICODE_VERSION = UNICODE_VERSION;

// Hangul syllables (The Unicode Standard, section 3.12).
const S_BASE = 0xac00;
const L_BASE = 0x1100;
const V_BASE = 0x1161;
const T_BASE = 0x11a7;
const T_COUNT = 28;
const N_COUNT = 21 * T_COUNT;
const S_COUNT = 19 * N_COUNT;
/** Code points a call of String.fromCodePoint takes at once, well below any engine's limit. */
const CHUNK = 4096;

interface Tables {
  /** Each code point's full compatibility decomposition, recursion done. */
  readonly decompositions: ReadonlyMap<number, readonly number[]>;
  readonly classes: ReadonlyMap<number, number>;
}

let tables: Tables | undefined;

/** The tables, read from their strings once, each decomposition followed to its end. */
function loaded(): Tables {
  if (tables !== undefined) return tables;
  const direct = new Map<number, readonly number[]>();
  for (const entry of DECOMPOSITIONS.split(";")) {
    if (entry === "") continue;
    const [code = "", parts = ""] = entry.split(">");
    direct.set(
      Number.parseInt(code, 16),
      parts.split(" ").map((part) => Number.parseInt(part, 16)),
    );
  }
  const full = new Map<number, readonly number[]>();
  const expand = (point: number): readonly number[] => {
    const known = full.get(point);
    if (known !== undefined) return known;
    const parts = direct.get(point);
    if (parts === undefined) return [point];
    const expanded = parts.flatMap((part) => [...expand(part)]);
    full.set(point, expanded);
    return expanded;
  };
  for (const point of direct.keys()) expand(point);
  const classes = new Map<number, number>();
  for (const entry of COMBINING_CLASSES.split(";")) {
    if (entry === "") continue;
    const [range = "", value = ""] = entry.split(":");
    const [from = "", to = from] = range.split("-");
    for (let point = Number.parseInt(from, 16); point <= Number.parseInt(to, 16); point += 1)
      classes.set(point, Number(value));
  }
  tables = { decompositions: full, classes };
  return tables;
}

/** Appends the full compatibility decomposition of `point` to `out`. */
function decompose(point: number, out: number[], { decompositions }: Tables): void {
  const syllable = point - S_BASE;
  if (syllable >= 0 && syllable < S_COUNT) {
    out.push(L_BASE + Math.floor(syllable / N_COUNT));
    out.push(V_BASE + Math.floor((syllable % N_COUNT) / T_COUNT));
    if (syllable % T_COUNT !== 0) out.push(T_BASE + (syllable % T_COUNT));
    return;
  }
  const parts = decompositions.get(point);
  if (parts === undefined) out.push(point);
  else for (const part of parts) out.push(part);
}

/** Puts every run of combining marks of `points` in canonical order, stably, in place. */
function order(points: number[], { classes }: Tables): void {
  let start = 0;
  while (start < points.length) {
    if ((classes.get(points[start] ?? 0) ?? 0) === 0) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < points.length && (classes.get(points[end] ?? 0) ?? 0) !== 0) end += 1;
    if (end - start > 1) {
      // Array.prototype.sort is stable: marks of one class keep their order.
      const run = points.slice(start, end);
      run.sort((a, b) => (classes.get(a) ?? 0) - (classes.get(b) ?? 0));
      for (let at = 0; at < run.length; at += 1) points[start + at] = run[at] ?? 0;
      run.fill(0);
    }
    start = end;
  }
}

/**
 * The NFKD of `text` by Unicode 18.0.0. A code point that Unicode 18.0.0 does not assign, and a lone
 * surrogate, stays as it is.
 */
export function nfkd(text: string): string {
  const own = loaded();
  const points: number[] = [];
  try {
    for (const character of text) decompose(character.codePointAt(0) ?? 0, points, own);
    order(points, own);
    let result = "";
    for (let at = 0; at < points.length; at += CHUNK) {
      const chunk = points.slice(at, at + CHUNK);
      result += String.fromCodePoint(...chunk);
      chunk.fill(0);
    }
    return result;
  } finally {
    points.fill(0);
  }
}
