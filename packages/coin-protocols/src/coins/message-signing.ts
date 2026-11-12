// The message signing of the coins a build holds: each coin brings its standards as one
// CoinMessageSigning (coins/<coin>/message-signing.ts), and MessageSigners routes a request to the
// coin that owns its format. Imported in derivation workers only, where the key is lent.
import { MessageSignatureText, type MessageSignature } from "@ckd/core/message-signature.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import type { NetworkName, ResultField } from "@ckd/core/types.js";

/** One message for one address of a derived row, in one of its coin's formats. */
export interface MessageSigningRequest {
  readonly format: string;
  readonly address: string;
  readonly message: string;
  readonly network: NetworkName;
}

/** A coin's message-signing standards, as a derivation worker runs them. */
export interface CoinMessageSigning {
  /** The formats this coin signs and verifies. */
  readonly formats: readonly string[];
  /**
   * Signs with a borrowed key, which the caller wipes; `fields` are the row's public fields, such
   * as the scripts BIP-322 needs. The result says whether the signature verified locally.
   */
  sign(
    privateKey: Uint8Array,
    request: MessageSigningRequest,
    fields: readonly ResultField[],
  ): MessageSignature | Promise<MessageSignature>;
  /** Whether `signature` signs the request's message for its address; malformed text is refused. */
  verify(request: MessageSigningRequest, signature: string): boolean | Promise<boolean>;
}

const REFUSALS = {
  UNSUPPORTED_FORMAT: "This build does not sign messages in the selected format.",
} as const;

/** The refusal of a format that no coin of the build signs. */
export class MessageSigningFormatError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "MessageSigningFormatError";
    this.code = code;
  }
}

/** The message signing of a build's coins, each request handed to the coin owning its format. */
export class MessageSigners {
  readonly #owners: ReadonlyMap<string, CoinMessageSigning>;

  constructor(coins: readonly CoinMessageSigning[]) {
    this.#owners = new Map(coins.flatMap((coin) => coin.formats.map((format) => [format, coin])));
  }

  /** Signs with the borrowed `privateKey`; an unknown format is refused before the key is used. */
  readonly sign = async (
    privateKey: Uint8Array,
    request: MessageSigningRequest,
    fields: readonly ResultField[],
  ): Promise<MessageSignature> => this.#owner(request).sign(privateKey, request, fields);

  /** Whether `signature` is valid for the request; it needs no key. */
  readonly verify = async (
    request: MessageSigningRequest,
    signature: unknown,
  ): Promise<boolean> => {
    const owner = this.#owner(request);
    SigningMessage.require(request.message, true);
    MessageSignatureText.require(signature);
    return await owner.verify(request, signature);
  };

  #owner(request: MessageSigningRequest): CoinMessageSigning {
    const owner = this.#owners.get(request.format);
    if (owner === undefined) throw new MessageSigningFormatError("UNSUPPORTED_FORMAT");
    return owner;
  }
}
