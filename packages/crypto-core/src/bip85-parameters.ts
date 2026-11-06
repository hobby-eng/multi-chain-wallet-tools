import { assertIndex } from "./bip32-limits.js";
import { BIP39_WORD_COUNTS, isBip39WordCount, type Bip39WordCount } from "./bip39-parameters.js";
import { BITCOIN_MAINNET_WIF, WifVersion } from "./wif-version.js";
import { BIP85_HEX_BYTES } from "./bip85-values.js";
export { BIP85_HEX_BYTES } from "./bip85-values.js";

/** Applications offered by the library and its browser worker. */
export type Bip85Application = "bip39" | "wif" | "xprv" | "hex";
/** Stable refusals of BIP85 requests and cryptographic results. */
const ERROR_CODES = [
  "bip85.application",
  "bip85.index",
  "bip85.words",
  "bip85.bytes",
  "bip85.private-key",
  "bip85.scalar",
] as const;
/** Stable identity of a refused BIP85 request or result. */
export type Bip85ErrorCode = (typeof ERROR_CODES)[number];

/** An input request; omitted application settings use protocol defaults. */
export interface Bip85RequestOptions {
  readonly application: Bip85Application;
  readonly index: number;
  readonly words?: Bip39WordCount;
  readonly bytes?: number;
  readonly wifVersion?: number;
}

/** The portable, text-only result of one BIP85 application. */
export interface Bip85Result {
  readonly path: string;
  readonly value: string;
  readonly entropyHex?: string;
  readonly kind: Bip85Application;
}

/** Refusal with a stable identity and no interpolated input or wallet material. */
export class Bip85Error extends Error {
  readonly #code: Bip85ErrorCode;

  constructor(code: Bip85ErrorCode) {
    super(code);
    this.name = "Bip85Error";
    this.#code = code;
  }

  /** Stable identity from this module's code list. */
  get code(): Bip85ErrorCode {
    return this.#code;
  }

  /** Recognize this module's code on an Error transported from a worker. */
  static codeOf(cause: unknown): Bip85ErrorCode | undefined {
    if (!(cause instanceof Error) || !("code" in cause)) return undefined;
    return ERROR_CODES.find((code) => code === cause.code);
  }
}

interface AdmittedOptions {
  readonly application: Bip85Application;
  readonly index: number;
  readonly words: Bip39WordCount;
  readonly bytes: number;
  readonly wifVersion: number;
}

interface Bip85Fields {
  readonly application: string;
  readonly index: string;
  readonly words: string;
  readonly bytes: string;
  readonly wifVersion?: string;
}

function fieldNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** Snapshots public application parameters before a host copies secrets or starts a worker. */
export class Bip85Parameters {
  readonly #options: AdmittedOptions;

  constructor(input: unknown) {
    if (input === null || typeof input !== "object" || Array.isArray(input))
      throw new Bip85Error("bip85.application");
    const raw = input as Record<string, unknown>;
    const application = raw.application;
    if (
      application !== "bip39" &&
      application !== "wif" &&
      application !== "xprv" &&
      application !== "hex"
    )
      throw new Bip85Error("bip85.application");
    const index = Bip85Parameters.index(raw.index);
    const words = Bip85Parameters.words(
      application === "bip39" && raw.words !== undefined ? raw.words : BIP39_WORD_COUNTS[0],
    );
    const bytes = Bip85Parameters.bytes(
      application === "hex" && raw.bytes !== undefined ? raw.bytes : BIP85_HEX_BYTES.default,
    );
    const wifVersion = new WifVersion(
      application === "wif" && raw.wifVersion !== undefined ? raw.wifVersion : BITCOIN_MAINNET_WIF,
    ).value;
    this.#options = Object.freeze({ application, index, words, bytes, wifVersion });
  }

  /** Admit the protocol index before key derivation; the request never repeats refused input. */
  static index(value: unknown): number {
    if (typeof value !== "number") throw new Bip85Error("bip85.index");
    try {
      return assertIndex(value, "BIP85 index");
    } catch {
      throw new Bip85Error("bip85.index");
    }
  }

  /** Admit an explicit BIP39 application width; omitted widths are refused by this operation. */
  static words(value: unknown): Bip39WordCount {
    if (!isBip39WordCount(value)) throw new Bip85Error("bip85.words");
    return value;
  }

  /** Admit an explicit hexadecimal width before entropy derivation. */
  static bytes(value: unknown): number {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < BIP85_HEX_BYTES.minimum ||
      value > BIP85_HEX_BYTES.maximum
    )
      throw new Bip85Error("bip85.bytes");
    return value;
  }

  /** Translate page fields through the same validator; blank active numeric fields are refused. */
  static fromFields(fields: Bip85Fields): Bip85Parameters {
    return new Bip85Parameters({
      application: fields.application,
      index: fieldNumber(fields.index),
      words: fieldNumber(fields.words),
      bytes: fieldNumber(fields.bytes),
      ...(fields.wifVersion === undefined ? {} : { wifVersion: fieldNumber(fields.wifVersion) }),
    });
  }

  /** Immutable admitted values; changing the original object cannot change a request. */
  get options(): AdmittedOptions {
    return this.#options;
  }
}
