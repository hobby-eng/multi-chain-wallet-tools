// The message signing of the standards that write a secp256k1 signature as r and s alone, with no
// recovery id: Cosmos's and Injective's ADR-036 (Keplr's signArbitrary) and Hedera's HIP-820 for
// ECDSA keys, through message-signing-public-key.ts. Such a signature names no key, so it is
// verified against the row's own compressed public key, which the request carries as an input, and
// only when that key owns the row's address. Each standard signs its own 32-byte digest, with RFC
// 6979 nonces and low S; verification refuses a high S, as the Cosmos SDK and the Hiero SDK do, so
// that each message has one valid signature per key.
import { secp256k1 } from "@ckd/core/crypto.js";
import type { CoinMessageSigning, MessageSigningRequest } from "./message-signing.js";
import {
  publicKeyCoinSigning,
  type PublicKeyCoinFacts,
  type SignatureScheme,
} from "./message-signing-public-key.js";

/** The request input that holds the row's compressed public key in hex (MessageFormatText.rowInputs). */
export const ROW_PUBLIC_KEY_INPUT = "publicKey";
/** A compressed secp256k1 public key in hex: 33 bytes, an even or odd y. */
const COMPRESSED_KEY_HEX = /^0[23][0-9a-f]{64}$/u;
/** Signing and verification take the standard's digest as it is, and only low S. */
const DIGEST = Object.freeze({ prehash: false, lowS: true });

/** ECDSA over a 32-byte digest, with the compressed public key. */
const SECP256K1: SignatureScheme = Object.freeze({
  validKey: (privateKey: Uint8Array) => secp256k1.utils.isValidSecretKey(privateKey),
  publicKey: (privateKey: Uint8Array) => secp256k1.getPublicKey(privateKey, true),
  sign: (digest: Uint8Array, privateKey: Uint8Array) => secp256k1.sign(digest, privateKey, DIGEST),
  verify: (signature: Uint8Array, digest: Uint8Array, publicKey: Uint8Array) =>
    secp256k1.verify(signature, digest, publicKey, DIGEST),
});

/** The row's compressed public key that the request carries, or undefined. */
function rowPublicKey(request: MessageSigningRequest): Uint8Array | undefined {
  const hex = request.inputs?.[ROW_PUBLIC_KEY_INPUT];
  if (hex === undefined || !COMPRESSED_KEY_HEX.test(hex)) return undefined;
  try {
    return secp256k1.Point.fromHex(hex).toBytes(true);
  } catch {
    // A text of the right shape whose x is not on the curve names no key.
    return undefined;
  }
}

/**
 * The message signing of one coin or part whose formats sign a digest (PublicKeyFormat's
 * signedBytes) and are verified against the row's compressed key.
 */
export function secp256k1CoinSigning(
  facts: Omit<PublicKeyCoinFacts, "publicKeyOf">,
): CoinMessageSigning {
  return publicKeyCoinSigning(SECP256K1, { ...facts, publicKeyOf: rowPublicKey });
}
