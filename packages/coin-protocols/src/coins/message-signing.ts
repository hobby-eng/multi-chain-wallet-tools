// The message signing of the coins a build holds: each coin brings its standards as one
// CoinMessageSigning (coins/<coin>/message-signing.ts), and MessageSigners routes a request to the
// coin that owns its format. Imported in derivation workers only, where the key is lent.
import type { DerivedKeySource } from "@ckd/core/derived-private-key.js";
import { MessageSignatureText, type MessageSignature } from "@ckd/core/message-signature.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import type { NetworkName, ResultField } from "@ckd/core/types.js";

/** One message for one address of a derived row, in one of its coin's formats. */
export interface MessageSigningRequest {
  readonly format: string;
  readonly address: string;
  readonly message: string;
  readonly network: NetworkName;
  /**
   * A standard's own inputs, such as NEAR's recipient and nonce or TON's domain and timestamp;
   * absent for the standards that sign the message alone. Each standard admits its own.
   */
  readonly inputs?: Readonly<Record<string, string>>;
}

/** A coin's message-signing standards, as a derivation worker runs them. */
export interface CoinMessageSigning {
  /**
   * The formats this coin signs and verifies, each with the adapter ids of the rows it signs: no
   * other row is signed or verified in it.
   */
  readonly formats: Readonly<Record<string, readonly string[]>>;
  /**
   * Where the rows keep the key and how it is written, such as Ethereum's hex `privateKey`; absent,
   * the key is read from `privateKeyHex` or `childPrivateKey` (DerivedPrivateKey).
   */
  readonly key?: DerivedKeySource;
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
  NOT_FOR_ROW: "This address does not sign messages in the selected format.",
} as const;

/** The refusal of a format that no coin of the build signs, or that a row's coin does not use. */
export class MessageSigningFormatError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "MessageSigningFormatError";
    this.code = code;
  }
}

/** A coin's format facts by format id, or the refusal of a format the coin does not own. */
export function ownFormat<T>(formats: Readonly<Record<string, T>>, format: string): T {
  const own = Object.hasOwn(formats, format) ? formats[format] : undefined;
  if (own === undefined) throw new MessageSigningFormatError("UNSUPPORTED_FORMAT");
  return own;
}

/**
 * A coin's formats as CoinMessageSigning lists them when each signs every one of the coin's rows,
 * `adapters`.
 */
export function formatsOnEveryRow(
  formats: Readonly<Record<string, unknown>>,
  adapters: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  const rows = Object.freeze([...adapters]);
  return Object.freeze(Object.fromEntries(Object.keys(formats).map((format) => [format, rows])));
}

/** The message signing of a build's coins, each request handed to the coin owning its format. */
export class MessageSigners {
  readonly #owners: ReadonlyMap<string, CoinMessageSigning>;

  constructor(coins: readonly CoinMessageSigning[]) {
    this.#owners = new Map(
      coins.flatMap((coin) => Object.keys(coin.formats).map((format) => [format, coin])),
    );
  }

  /** Signs with the borrowed `privateKey`; an unknown format is refused before the key is used. */
  readonly sign = async (
    privateKey: Uint8Array,
    request: MessageSigningRequest,
    fields: readonly ResultField[],
  ): Promise<MessageSignature> => this.#owner(request).sign(privateKey, request, fields);

  /**
   * Admits `format` for a row of `adapterId` before anything is derived or verified, and answers
   * where the row keeps the key (undefined for the default). Refuses a format that no coin of the
   * build signs, and one that the row's address type or coin does not sign, so that a coin's signer
   * never reads another coin's key.
   */
  readonly admit = (format: string, adapterId: string): DerivedKeySource | undefined => {
    const owner = this.#owner({ format });
    if (owner.formats[format]?.includes(adapterId) !== true)
      throw new MessageSigningFormatError("NOT_FOR_ROW");
    return owner.key;
  };

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

  #owner(request: Pick<MessageSigningRequest, "format">): CoinMessageSigning {
    const owner = this.#owners.get(request.format);
    if (owner === undefined) throw new MessageSigningFormatError("UNSUPPORTED_FORMAT");
    return owner;
  }
}
