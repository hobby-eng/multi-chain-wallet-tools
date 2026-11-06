import { nonEmptyLines } from "./text-lines.js";
import { englishMnemonicToEntropy } from "./bip39.js";
import { BIP39_WORD_COUNTS } from "./bip39-parameters.js";

const ENTRY_WORD_COUNTS = [...BIP39_WORD_COUNTS].reverse();
const MAX_ENTRIES = 100;
const MAX_TEXT_UNITS = 65_536;
const MAX_WORDS = MAX_ENTRIES * Math.max(...BIP39_WORD_COUNTS);
const MESSAGES = {
  "mnemonic.entries.type": () => "A mnemonic list must be text.",
  "mnemonic.entries.text-size": () => `A mnemonic list must fit ${MAX_TEXT_UNITS} characters.`,
  "mnemonic.entries.count": () => `A mnemonic list accepts at most ${MAX_ENTRIES} seed phrases.`,
  "mnemonic.entries.words": () => `A mnemonic list accepts at most ${MAX_WORDS} words.`,
} as const;

/** Input-free refusals of the bounded public list parser. */
export type MnemonicEntriesErrorCode = keyof typeof MESSAGES;

/** An input-free refusal of raw size, word count or recovered list size. */
export class MnemonicEntriesError extends Error {
  readonly code: MnemonicEntriesErrorCode;

  constructor(code: MnemonicEntriesErrorCode) {
    super(MESSAGES[code]());
    this.name = "MnemonicEntriesError";
    this.code = code;
  }
}

/** Splits pasted BIP39 lists without depending on backup or search implementations. */
export class MnemonicEntries {
  /** The existing Matcher phrase ceiling, also used by paste normalization. */
  static get maximumEntries(): number {
    return MAX_ENTRIES;
  }

  /** Raw UTF-16 units admitted before splitting, normalization or checksum work. */
  static get maximumTextUnits(): number {
    return MAX_TEXT_UNITS;
  }

  /** Keeps valid explicit lines, or infers wrapped boundaries from lengths and checksums. */
  static parse(this: void, value: unknown): string[] {
    if (typeof value !== "string") throw new MnemonicEntriesError("mnemonic.entries.type");
    if (value.length > MAX_TEXT_UNITS) throw new MnemonicEntriesError("mnemonic.entries.text-size");
    const explicit = nonEmptyLines(value);
    if (explicit.length > MAX_ENTRIES) throw new MnemonicEntriesError("mnemonic.entries.count");
    const words = value.trim().split(/\s+/u).filter(Boolean);
    if (words.length > MAX_WORDS) throw new MnemonicEntriesError("mnemonic.entries.words");
    if (explicit.every(MnemonicEntries.#isValid)) return explicit;

    const memo = new Map<number, string[] | null>();
    const splitAt = (offset: number): string[] | null => {
      if (offset === words.length) return [];
      if (memo.has(offset)) return memo.get(offset) ?? null;
      for (const count of ENTRY_WORD_COUNTS) {
        if (offset + count > words.length) continue;
        const candidate = words.slice(offset, offset + count).join(" ");
        if (!MnemonicEntries.#isValid(candidate)) continue;
        const remaining = splitAt(offset + count);
        if (remaining !== null) {
          const result = [candidate, ...remaining];
          memo.set(offset, result);
          return result;
        }
      }
      memo.set(offset, null);
      return null;
    };
    const entries = splitAt(0) ?? explicit;
    if (entries.length > MAX_ENTRIES) throw new MnemonicEntriesError("mnemonic.entries.count");
    return entries;
  }

  static #isValid(this: void, value: string): boolean {
    let entropy: Uint8Array | null = null;
    try {
      entropy = englishMnemonicToEntropy(value);
      return true;
    } catch {
      return false;
    } finally {
      entropy?.fill(0);
    }
  }
}

/** Compatibility name for existing list consumers; the class owns the implementation. */
export const parseMnemonicEntries = MnemonicEntries.parse;
