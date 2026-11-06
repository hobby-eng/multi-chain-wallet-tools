import { base58 } from "@scure/base";

const IDENTIFIER_BYTES = 32;

/** A refused Platform identifier is never normalized or forwarded to a provider. */
export class PlatformIdentifierError extends Error {
  readonly code = "platform.identifier.invalid";
  constructor() {
    super(
      `Enter a canonical Base58 Platform Identity ID encoding exactly ${IDENTIFIER_BYTES} bytes.`,
    );
    this.name = "PlatformIdentifierError";
  }
}

/** One bounded canonical-byte rule for lookup, provider history and the network Worker. */
export class PlatformIdentifier {
  static readonly #maximumTextLength = base58.encode(new Uint8Array(IDENTIFIER_BYTES).fill(255))
    .length;

  /** Classifies a candidate among other lookup kinds; no decoding is attempted beyond the text bound. */
  static is(value: unknown): boolean {
    if (typeof value !== "string" || value.length > this.#maximumTextLength || value.length === 0)
      return false;
    try {
      const bytes = base58.decode(value);
      return bytes.length === IDENTIFIER_BYTES && base58.encode(bytes) === value;
    } catch {
      return false;
    }
  }

  /** Refuses wrong types, alphabets, whitespace and decoded widths before any provider call. */
  static require(value: unknown): asserts value is string {
    if (!this.is(value)) throw new PlatformIdentifierError();
  }
}
