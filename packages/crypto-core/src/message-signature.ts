// What every message-signing standard returns, and the admission of a signature that a person
// pastes to verify. A signature is public, but its text still crosses into a worker: it is bounded
// before it is copied (CORE-48).

/** The longest signature text admitted for verification; a BIP-322 full signature is far shorter. */
const MAX_SIGNATURE_CHARACTERS = 4096;

const REFUSALS = {
  INVALID_SIGNATURE_TEXT: "The signature must be text.",
  EMPTY_SIGNATURE: "Paste the signature to verify.",
  SIGNATURE_TOO_LONG: `The signature exceeds ${MAX_SIGNATURE_CHARACTERS} characters.`,
} as const;

/** A signed message's signature text, the format that made it, and its local verification. */
export interface MessageSignature {
  readonly signature: string;
  readonly format: string;
  readonly verified: boolean;
}

/** Input-free refusals of a pasted signature, before it reaches a verifier. */
export class MessageSignatureTextError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "MessageSignatureTextError";
    this.code = code;
  }
}

/** Admits signature text exactly as pasted: each standard's decoder owns its own whitespace rule. */
export class MessageSignatureText {
  /** The verification limit, in UTF-16 code units of the pasted text. */
  static readonly maxCharacters = MAX_SIGNATURE_CHARACTERS;

  /** Refuses non-text, blank or oversized signature text. */
  static require(value: unknown): asserts value is string {
    if (typeof value !== "string") throw new MessageSignatureTextError("INVALID_SIGNATURE_TEXT");
    if (value.trim().length === 0) throw new MessageSignatureTextError("EMPTY_SIGNATURE");
    if (value.length > MAX_SIGNATURE_CHARACTERS)
      throw new MessageSignatureTextError("SIGNATURE_TOO_LONG");
  }
}
