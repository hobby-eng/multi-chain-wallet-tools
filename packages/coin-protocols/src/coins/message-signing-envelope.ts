// The message signing of the coins that sign in EIP-191's envelope with a recoverable signature:
// Ethereum and every EVM network, Ethereum Classic, and Tron (TIP-191, TronWeb's signMessageV2).
// A coin brings its envelope name, the field of its rows that holds the key, and the address of a
// recovered key as its rows show it; a signature proves the row's address when the key it
// recovers has that address.
import { secp256k1 } from "@ckd/core/crypto.js";
import { envelope191Digest, type Envelope191Name } from "@ckd/core/message-signing-envelope-191.js";
import { recoverRecoverable, signRecoverable } from "@ckd/core/message-signing-recoverable.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import {
  MessageSigningFormatError,
  type CoinMessageSigning,
  type MessageSigningRequest,
} from "./message-signing.js";

const REFUSALS = {
  INVALID_KEY: "Message signing requires a valid 32-byte private key.",
  SIGNING_FAILED: "The generated signature did not verify against the selected address.",
} as const;

/** The refusal of a key that cannot sign, or of a signature that does not prove its address. */
export class EnvelopeSigningError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "EnvelopeSigningError";
    this.code = code;
  }
}

/** A coin that signs messages in EIP-191's envelope. */
export interface EnvelopeCoinFacts {
  readonly envelope: Envelope191Name;
  /** The row field that holds the key as 64 hex digits (DerivedPrivateKey's `keyField`). */
  readonly keyField: string;
  /** The coin's formats, by format id, with the name of the standard each signs. */
  readonly formats: Readonly<Record<string, { readonly name: string }>>;
  /** The adapter ids of the coin's rows (CoinMessageSigning.adapters). */
  readonly adapters: readonly string[];
  /** Whether verification refuses a high S, as TronWeb's verifyMessageV2 (ethers v6) does. */
  readonly lowS?: boolean;
  /** The address of an uncompressed public key, as the coin's rows show it. */
  addressOf(publicKey: Uint8Array): string;
  /** Whether two address texts name the same account (EVM hex ignores case). */
  addressesEqual(derived: string, expected: string): boolean;
}

/** The envelope message signing of one coin, for its derivation worker. */
export function envelopeCoinSigning(facts: EnvelopeCoinFacts): CoinMessageSigning {
  const nameOf = (format: string): string => {
    const own = Object.hasOwn(facts.formats, format) ? facts.formats[format] : undefined;
    if (own === undefined) throw new MessageSigningFormatError("UNSUPPORTED_FORMAT");
    return own.name;
  };
  const digestOf = (message: string) =>
    envelope191Digest(facts.envelope, new TextEncoder().encode(message));
  const proves = (request: MessageSigningRequest, signature: string, digest: Uint8Array) =>
    facts.addressesEqual(
      facts.addressOf(recoverRecoverable(signature, digest, facts.lowS === true)),
      request.address.trim(),
    );
  return Object.freeze({
    formats: Object.freeze(Object.keys(facts.formats)),
    adapters: Object.freeze([...facts.adapters]),
    keyField: facts.keyField,
    sign: (privateKey: Uint8Array, request: MessageSigningRequest) => {
      const name = nameOf(request.format);
      if (!secp256k1.utils.isValidSecretKey(privateKey))
        throw new EnvelopeSigningError("INVALID_KEY");
      SigningMessage.require(request.message);
      const digest = digestOf(request.message);
      try {
        const signature = signRecoverable(privateKey, digest);
        if (!proves(request, signature, digest)) throw new EnvelopeSigningError("SIGNING_FAILED");
        return { signature, format: name, verified: true };
      } finally {
        digest.fill(0);
      }
    },
    verify: (request: MessageSigningRequest, signature: string) => {
      nameOf(request.format);
      const digest = digestOf(request.message);
      try {
        return proves(request, signature, digest);
      } finally {
        digest.fill(0);
      }
    },
  });
}
