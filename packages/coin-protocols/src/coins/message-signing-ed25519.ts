// The message signing of the coins whose keys are Ed25519: Solana, Stellar, NEAR and TON. A coin
// brings, per format, the bytes its standard signs and how the standard writes a signature, and for
// the coin, the public key a request names and whether a key owns an address. Signing is RFC 8032's,
// deterministic; verification is RFC 8032's strict rule (noble's zip215 false), as libsodium checks,
// so that only a canonical signature by the address's own key is valid.
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64 } from "@scure/base";
import type { DerivedKeySource } from "@ckd/core/derived-private-key.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import {
  formatsOnEveryRow,
  ownFormat,
  type CoinMessageSigning,
  type MessageSigningRequest,
} from "./message-signing.js";

/** An Ed25519 signature's bytes, R and S. */
const SIGNATURE_BYTES = 64;
/** An Ed25519 seed's bytes. */
const SEED_BYTES = 32;
/** RFC 8032's strict verification: canonical encodings only, as libsodium verifies. */
const STRICT = Object.freeze({ zip215: false });

const REFUSALS = {
  INVALID_KEY: "Message signing requires a valid 32-byte private key.",
  INVALID_SIGNATURE: "The signature is not 64 bytes in this format's encoding.",
  SIGNING_FAILED: "The generated signature did not verify against the selected address.",
} as const;

/** The refusal of a key that cannot sign, of an unreadable signature, or of a failed self-check. */
export class Ed25519SigningError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "Ed25519SigningError";
    this.code = code;
  }
}

/** One Ed25519 format of a coin: what it signs, and how its signature is written and read. */
export interface Ed25519Format {
  /** The standard's name, as the signature reports it. */
  readonly name: string;
  /**
   * The bytes the standard signs for the request, its message and inputs admitted; the caller
   * wipes them.
   */
  signedBytes(request: MessageSigningRequest): Uint8Array;
  /** The signature as the standard returns it, made by `publicKey`'s seed. */
  write(signature: Uint8Array, request: MessageSigningRequest, publicKey: Uint8Array): string;
  /** The 64 bytes of a pasted signature, or undefined when the text is not in this encoding. */
  read(text: string): Uint8Array | undefined;
}

/** A coin that signs messages with Ed25519 keys. */
export interface Ed25519CoinFacts {
  /** Where the rows keep the Ed25519 seed (CoinMessageSigning.key). */
  readonly key: DerivedKeySource;
  /** The adapter ids of the coin's rows, which each of its formats signs. */
  readonly adapters: readonly string[];
  readonly formats: Readonly<Record<string, Ed25519Format>>;
  /**
   * The public key that verifies the request: the one its address holds, or for TON, whose
   * address is a contract's, the row's own; undefined when the request names none.
   */
  publicKeyOf(request: MessageSigningRequest): Uint8Array | undefined;
  /** Whether `publicKey` owns `address`, as the coin's rows derive it. */
  owns(publicKey: Uint8Array, address: string): boolean;
}

/** A signature in standard Base64 with its padding, as SEP-53 and most wallets write it. */
export function base64Signature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(trimmed)) return undefined;
  return base64.decode(trimmed);
}

/** A signature in Base58, as Solana writes signatures. */
export function base58Signature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,88}$/u.test(trimmed)) return undefined;
  const bytes = base58.decode(trimmed);
  return bytes.length === SIGNATURE_BYTES ? bytes : undefined;
}

/**
 * The signature of a pasted wallet response, a JSON object whose `signature` member is Base64, or
 * of the bare Base64 signature. The response's other members are not read: the dialog's message,
 * inputs and row are what a signature is checked against.
 */
export function responseSignature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return base64Signature(trimmed);
  let response: unknown;
  try {
    response = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  const signature =
    typeof response === "object" && response !== null && Object.hasOwn(response, "signature")
      ? (response as { signature: unknown }).signature
      : undefined;
  return typeof signature === "string" ? base64Signature(signature) : undefined;
}

/** The Ed25519 message signing of one coin, for its derivation worker. */
export function ed25519CoinSigning(facts: Ed25519CoinFacts): CoinMessageSigning {
  const formatOf = (format: string): Ed25519Format => ownFormat(facts.formats, format);
  const verifies = (
    format: Ed25519Format,
    request: MessageSigningRequest,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean => {
    const bytes = format.signedBytes(request);
    try {
      return ed25519.verify(signature, bytes, publicKey, STRICT);
    } finally {
      bytes.fill(0);
    }
  };
  return Object.freeze({
    formats: formatsOnEveryRow(facts.formats, facts.adapters),
    key: facts.key,
    sign: (privateKey: Uint8Array, request: MessageSigningRequest) => {
      const format = formatOf(request.format);
      if (privateKey.length !== SEED_BYTES) throw new Ed25519SigningError("INVALID_KEY");
      SigningMessage.require(request.message);
      const publicKey = ed25519.getPublicKey(privateKey);
      if (!facts.owns(publicKey, request.address)) throw new Ed25519SigningError("SIGNING_FAILED");
      const bytes = format.signedBytes(request);
      let signature: Uint8Array;
      try {
        signature = ed25519.sign(bytes, privateKey);
      } finally {
        bytes.fill(0);
      }
      if (!verifies(format, request, signature, publicKey))
        throw new Ed25519SigningError("SIGNING_FAILED");
      return {
        signature: format.write(signature, request, publicKey),
        format: format.name,
        verified: true,
      };
    },
    verify: (request: MessageSigningRequest, text: string) => {
      const format = formatOf(request.format);
      const signature = format.read(text);
      if (signature === undefined) throw new Ed25519SigningError("INVALID_SIGNATURE");
      const publicKey = facts.publicKeyOf(request);
      // A key that does not own the address proves nothing about it, whatever it signed.
      if (publicKey === undefined || !facts.owns(publicKey, request.address)) return false;
      return verifies(format, request, signature, publicKey);
    },
  });
}
