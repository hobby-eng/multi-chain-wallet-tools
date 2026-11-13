// The message signing of the standards whose signature names no key and is verified against a
// public key: the Ed25519 coins (Solana, Stellar, NEAR, TON, Hedera's Ed25519 rows) and the
// secp256k1 standards without a recovery id (ADR-036, Hedera's ECDSA rows). A scheme brings the
// curve's operations; a coin brings, per format, the bytes its standard signs and how it writes and
// reads a signature, and for the coin the public key a request names and whether a key owns an
// address. A signature proves an address only when the key that verifies it owns that address.
import type { DerivedKeySource } from "@ckd/core/derived-private-key.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import {
  formatsOnEveryRow,
  ownFormat,
  type CoinMessageSigning,
  type MessageSigningRequest,
} from "./message-signing.js";

const REFUSALS = {
  INVALID_KEY: "Message signing requires a valid 32-byte private key.",
  INVALID_SIGNATURE: "The signature is not 64 bytes in this format's encoding.",
  SIGNING_FAILED: "The generated signature did not verify against the selected address.",
} as const;

/** The refusal of a key that cannot sign, of an unreadable signature, or of a failed self-check. */
export class PublicKeySigningError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "PublicKeySigningError";
    this.code = code;
  }
}

/** A curve's signing operations over the bytes a standard signs. */
export interface SignatureScheme {
  /** Whether `privateKey` is a key of the curve. */
  validKey(privateKey: Uint8Array): boolean;
  /** The public key the coins' addresses and responses use. */
  publicKey(privateKey: Uint8Array): Uint8Array;
  sign(bytes: Uint8Array, privateKey: Uint8Array): Uint8Array;
  /** Whether `signature` signs `bytes` for `publicKey`, by the scheme's strict rule. */
  verify(signature: Uint8Array, bytes: Uint8Array, publicKey: Uint8Array): boolean;
}

/** One format of a coin: what it signs, and how its signature is written and read. */
export interface PublicKeyFormat {
  /** The standard's name, as the signature reports it. */
  readonly name: string;
  /**
   * The bytes the scheme signs for the request, its message and inputs admitted: the message
   * itself, or a digest; the caller wipes them.
   */
  signedBytes(request: MessageSigningRequest): Uint8Array;
  /** The signature as the standard returns it, made by `publicKey`'s private key. */
  write(signature: Uint8Array, request: MessageSigningRequest, publicKey: Uint8Array): string;
  /** The 64 bytes of a pasted signature, or undefined when the text is not in this encoding. */
  read(text: string): Uint8Array | undefined;
}

/** A coin, or one part of a coin, whose signatures are verified against a public key. */
export interface PublicKeyCoinFacts {
  /** Where the rows keep the key (CoinMessageSigning.key). */
  readonly key: DerivedKeySource;
  /** The adapter ids of the coin's rows, which each of its formats signs. */
  readonly adapters: readonly string[];
  readonly formats: Readonly<Record<string, PublicKeyFormat>>;
  /** The public key that verifies the request, or undefined when the request names none. */
  publicKeyOf(request: MessageSigningRequest): Uint8Array | undefined;
  /** Whether `publicKey` owns `address`, as the coin's rows derive it. */
  owns(publicKey: Uint8Array, address: string): boolean;
}

/** The message signing of one coin or part under `scheme`, for its derivation worker. */
export function publicKeyCoinSigning(
  scheme: SignatureScheme,
  facts: PublicKeyCoinFacts,
): CoinMessageSigning {
  const verifies = (
    format: PublicKeyFormat,
    request: MessageSigningRequest,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean => {
    const bytes = format.signedBytes(request);
    try {
      return scheme.verify(signature, bytes, publicKey);
    } finally {
      bytes.fill(0);
    }
  };
  return Object.freeze({
    formats: formatsOnEveryRow(facts.formats, facts.adapters),
    key: facts.key,
    sign: (privateKey: Uint8Array, request: MessageSigningRequest) => {
      const format = ownFormat(facts.formats, request.format);
      if (!scheme.validKey(privateKey)) throw new PublicKeySigningError("INVALID_KEY");
      SigningMessage.require(request.message);
      const publicKey = scheme.publicKey(privateKey);
      if (!facts.owns(publicKey, request.address))
        throw new PublicKeySigningError("SIGNING_FAILED");
      const bytes = format.signedBytes(request);
      let signature: Uint8Array;
      try {
        signature = scheme.sign(bytes, privateKey);
      } finally {
        bytes.fill(0);
      }
      if (!verifies(format, request, signature, publicKey))
        throw new PublicKeySigningError("SIGNING_FAILED");
      return {
        signature: format.write(signature, request, publicKey),
        format: format.name,
        verified: true,
      };
    },
    verify: (request: MessageSigningRequest, text: string) => {
      const format = ownFormat(facts.formats, request.format);
      const signature = format.read(text);
      if (signature === undefined) throw new PublicKeySigningError("INVALID_SIGNATURE");
      const publicKey = facts.publicKeyOf(request);
      // A key that does not own the address proves nothing about it, whatever it signed.
      if (publicKey === undefined || !facts.owns(publicKey, request.address)) return false;
      return verifies(format, request, signature, publicKey);
    },
  });
}
