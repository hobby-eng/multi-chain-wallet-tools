import { mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Bip39Input } from "./bip39-input.js";
import { ENGLISH_BIP39_WORDS } from "./bip39-word-reader.js";
import {
  BIP39_WORD_BITS,
  isBip39WordCount,
  bip39EntropyBits,
  bip39ChecksumBits,
} from "./bip39-parameters.js";
import { bytesToHex } from "./crypto.js";
import { SecretValue } from "./secret-value.js";

interface UnknownMnemonicWord {
  readonly index: number;
  readonly word: string;
  readonly suggestions: readonly string[];
}

interface MnemonicWordDiagnostic {
  readonly position: number;
  readonly word: string;
  readonly wordlistIndex: number | null;
  readonly indexHex: string | null;
  readonly bits: string | null;
}

interface MnemonicConstructionDiagnostic {
  readonly entropyHex: string;
  readonly entropyBinary: string;
  readonly providedChecksum: string;
  readonly expectedChecksum: string;
  readonly mnemonicBinary: string;
  readonly wordIndexes: readonly number[];
}

/** Borrowed diagnostic views; secret strings and arrays are temporary native copies. */
export interface MnemonicDiagnostic {
  readonly normalized: string;
  readonly wordCount: number;
  readonly wordCountValid: boolean;
  readonly allWordsKnown: boolean;
  readonly checksumValid: boolean;
  readonly entropyBits: number | null;
  readonly checksumBits: number | null;
  readonly unknownWords: readonly UnknownMnemonicWord[];
  readonly words: readonly MnemonicWordDiagnostic[];
  readonly construction: MnemonicConstructionDiagnostic | null;
}

/** An inspection's private views cannot outlive its owner or a broken internal state. */
export class MnemonicInspectionError extends Error {
  /** Stable, input-free lifetime/invariant identity. */
  readonly code: "bip39.diagnostic.retired" | "bip39.diagnostic.state";
  /** Report no phrase, word, index or entropy. */
  constructor(code: MnemonicInspectionError["code"]) {
    super(code);
    this.code = code;
    this.name = "MnemonicInspectionError";
  }
}

/** Owns normalized phrase, indexes, suggestions and entropy in bytes until wipe/disposal. */
export class MnemonicInspection implements MnemonicDiagnostic, Disposable {
  #text: SecretValue<readonly string[]> | undefined;
  #indexes: SecretValue<readonly number[]> | undefined;
  #suggestions: SecretValue<readonly (readonly number[])[]> | undefined;
  #entropy: Uint8Array | undefined;
  readonly #count: number;
  readonly #countValid: boolean;
  readonly #allKnown: boolean;
  readonly #checksumValid: boolean;
  readonly #entropyBits: number | null;
  readonly #checksumBits: number | null;
  readonly #unknownPositions: readonly number[];

  /** Admit bounded phrase text and diagnostic work; all private views must end before disposal. */
  constructor(value: unknown) {
    const { normalized, words } = Bip39Input.diagnostic(value);
    this.#count = words.length;
    this.#countValid = isBip39WordCount(words.length);
    const indexes = words.map((word) => ENGLISH_BIP39_WORDS.exactIndex(word) ?? -1);
    this.#unknownPositions = indexes.flatMap((index, position) => (index < 0 ? [position] : []));
    this.#allKnown = words.length > 0 && this.#unknownPositions.length === 0;
    this.#checksumValid =
      this.#countValid && this.#allKnown && validateMnemonic(normalized, wordlist);
    this.#entropyBits = isBip39WordCount(words.length) ? bip39EntropyBits(words.length) : null;
    this.#checksumBits = isBip39WordCount(words.length) ? bip39ChecksumBits(words.length) : null;
    const suggestions = this.#unknownPositions.map((position) => [
      ...ENGLISH_BIP39_WORDS.suggestions(this.#word(words, position)),
    ]);
    try {
      this.#text = SecretValue.utf16Texts([normalized]);
      this.#indexes = SecretValue.numbers(indexes);
      this.#suggestions = SecretValue.numberLists(suggestions);
      // The established library remains the normative checksum/entropy implementation.
      if (this.#checksumValid) this.#entropy = mnemonicToEntropy(normalized, wordlist);
    } catch (cause) {
      this.wipe();
      throw cause;
    } finally {
      indexes.fill(0);
      for (const list of suggestions) list.fill(0);
    }
  }

  #word(words: readonly string[], position: number): string {
    const word = words[position];
    if (word === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
    return word;
  }

  #live(): void {
    if (this.#text === undefined) throw new MnemonicInspectionError("bip39.diagnostic.retired");
  }

  #wordIndexes(): readonly number[] {
    this.#live();
    if (this.#indexes === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
    return this.#indexes.value;
  }

  /** Fresh normalized phrase view; reading after disposal fails with bip39.diagnostic.retired. */
  get normalized(): string {
    this.#live();
    const value = this.#text?.value[0];
    if (value === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
    return value;
  }
  /** Lexical count; aggregate non-secret facts remain readable after retirement. */
  get wordCount(): number {
    return this.#count;
  }
  /** Whether the count is one of BIP39's protocol choices. */
  get wordCountValid(): boolean {
    return this.#countValid;
  }
  /** Whether every position is in the canonical English dictionary. */
  get allWordsKnown(): boolean {
    return this.#allKnown;
  }
  /** The normative library's checksum verdict, never inferred from count alone. */
  get checksumValid(): boolean {
    return this.#checksumValid;
  }
  /** Entropy width in bits for a valid count, otherwise null. */
  get entropyBits(): number | null {
    return this.#entropyBits;
  }
  /** Checksum width in bits for a valid count, otherwise null. */
  get checksumBits(): number | null {
    return this.#checksumBits;
  }

  /** Fresh unknown-word/suggestion views, owned only by this synchronous caller. */
  get unknownWords(): readonly UnknownMnemonicWord[] {
    const words = this.normalized.split(" ");
    if (this.#suggestions === undefined)
      throw new MnemonicInspectionError("bip39.diagnostic.state");
    const suggestions = this.#suggestions.value;
    return this.#unknownPositions.map((position, index) => {
      const candidates = suggestions[index];
      if (candidates === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
      return {
        index: position,
        word: this.#word(words, position),
        suggestions: candidates.map((value) => ENGLISH_BIP39_WORDS.at(value)),
      };
    });
  }

  /** Fresh per-word views; the owner keeps no word or bit strings between calls. */
  get words(): readonly MnemonicWordDiagnostic[] {
    const normalized = this.normalized;
    const words = normalized === "" ? [] : normalized.split(" ");
    const indexes = this.#wordIndexes();
    return words.map((word, index) => {
      const value = indexes[index];
      if (value === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
      const known = value >= 0;
      return {
        position: index + 1,
        word,
        wordlistIndex: known ? value : null,
        // A hexadecimal digit holds four bits of the dictionary index.
        indexHex: known
          ? `0x${value.toString(16).padStart(Math.ceil(BIP39_WORD_BITS / 4), "0")}`
          : null,
        bits: known ? value.toString(2).padStart(BIP39_WORD_BITS, "0") : null,
      };
    });
  }

  /** Fresh construction views for checksum-valid input only; retained entropy stays in bytes. */
  get construction(): MnemonicConstructionDiagnostic | null {
    this.#live();
    if (!this.#checksumValid || this.#entropyBits === null) return null;
    if (this.#entropy === undefined) throw new MnemonicInspectionError("bip39.diagnostic.state");
    const wordIndexes = this.#wordIndexes();
    const mnemonicBinary = wordIndexes
      .map((index) => index.toString(2).padStart(BIP39_WORD_BITS, "0"))
      .join("");
    const checksum = mnemonicBinary.slice(this.#entropyBits);
    return {
      entropyHex: bytesToHex(this.#entropy),
      // Entropy bytes each contribute exactly eight binary digits.
      entropyBinary: Array.from(this.#entropy, (byte) => byte.toString(2).padStart(8, "0")).join(
        "",
      ),
      providedChecksum: checksum,
      expectedChecksum: checksum,
      mnemonicBinary,
      wordIndexes,
    };
  }

  /** Revoke private views and wipe owned storage; native immutable copies cannot be recalled. */
  wipe(): void {
    const owners = [this.#text, this.#indexes, this.#suggestions];
    const entropy = this.#entropy;
    this.#text = undefined;
    this.#indexes = undefined;
    this.#suggestions = undefined;
    this.#entropy = undefined;
    for (const owner of owners) owner?.wipe();
    entropy?.fill(0);
  }

  /** End the same lifetime as explicit wipe. */
  [Symbol.dispose](): void {
    this.wipe();
  }

  /** Compatibility factory; the caller owns and disposes the returned inspection. */
  static inspect(value: string): MnemonicInspection {
    return new MnemonicInspection(value);
  }
}
