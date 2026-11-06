import { BIP39_WORD_COUNTS } from "./bip39-word-counts.js";

// Generous admission padding for one human phrase, checked before and after Unicode expansion.
const MAX_PHRASE_TEXT_UNITS = 8192;
// Diagnostics also explain malformed phrases, up to twice BIP39's largest valid word count.
const MAX_DIAGNOSTIC_WORDS = 2 * Math.max(...BIP39_WORD_COUNTS);

/** Stable refusals at the phrase text and diagnostic-work boundaries. */
export type Bip39InputErrorCode =
  "bip39.input.text" | "bip39.input.text-size" | "bip39.input.diagnostic-count";

/** A phrase cannot enter normalization or the bounded diagnostic operation. */
export class Bip39InputError extends Error {
  /** Input-free identity translated by the front end. */
  readonly code: Bip39InputErrorCode;
  /** Refuse a shape or work bound without retaining any entered text. */
  constructor(code: Bip39InputErrorCode) {
    super(code);
    this.name = "Bip39InputError";
    this.code = code;
  }
}

/** Owns admission and canonical text conversion before phrase validation or diagnostic work. */
export class Bip39Input {
  /** Raw and Unicode-expanded phrase safety bound, in UTF-16 code units rather than bytes. */
  static get maximumTextUnits(): number {
    return MAX_PHRASE_TEXT_UNITS;
  }
  /** Maximum count inspected as a malformed phrase, derived from the protocol's word counts. */
  static get maximumDiagnosticWords(): number {
    return MAX_DIAGNOSTIC_WORDS;
  }

  /** Admit a native text view before trimming, Unicode normalization or copying it. */
  static text(value: unknown): string {
    if (typeof value !== "string") throw new Bip39InputError("bip39.input.text");
    if (value.length > MAX_PHRASE_TEXT_UNITS) throw new Bip39InputError("bip39.input.text-size");
    return value;
  }

  /** Preserve the established English NFKD/case/whitespace conversion; never truncate a phrase. */
  static normalize(value: unknown): string {
    const compatible = this.text(value).normalize("NFKD");
    return this.text(compatible).trim().toLowerCase().split(/\s+/u).filter(Boolean).join(" ");
  }

  /** Admit the word count before suggestions or per-word report allocation; returned views are temporary. */
  static diagnostic(value: unknown): { normalized: string; words: string[] } {
    const normalized = this.normalize(value);
    const words = normalized === "" ? [] : normalized.split(" ");
    if (words.length > MAX_DIAGNOSTIC_WORDS)
      throw new Bip39InputError("bip39.input.diagnostic-count");
    return { normalized, words };
  }
}
