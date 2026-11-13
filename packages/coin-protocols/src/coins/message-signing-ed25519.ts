// The message signing of the coins whose keys are Ed25519: Solana, Stellar, NEAR, TON and Hedera's
// Ed25519 rows, through message-signing-public-key.ts. Signing is RFC 8032's, deterministic;
// verification is RFC 8032's strict rule (noble's zip215 false), as libsodium checks, so that only a
// canonical signature by the address's own key is valid.
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import type { CoinMessageSigning } from "./message-signing.js";
import {
  publicKeyCoinSigning,
  type PublicKeyCoinFacts,
  type PublicKeyFormat,
  type SignatureScheme,
} from "./message-signing-public-key.js";

/** An Ed25519 signature's bytes, R and S. */
const SIGNATURE_BYTES = 64;
/** An Ed25519 seed's bytes. */
const SEED_BYTES = 32;
/** RFC 8032's strict verification: canonical encodings only, as libsodium verifies. */
const STRICT = Object.freeze({ zip215: false });

/** One Ed25519 format of a coin (PublicKeyFormat): the bytes it signs are the message's own. */
export type Ed25519Format = PublicKeyFormat;

/** Ed25519 over the bytes themselves, with the 32-byte seed as the private key. */
const ED25519: SignatureScheme = Object.freeze({
  validKey: (privateKey: Uint8Array) => privateKey.length === SEED_BYTES,
  publicKey: (privateKey: Uint8Array) => ed25519.getPublicKey(privateKey),
  sign: (bytes: Uint8Array, privateKey: Uint8Array) => ed25519.sign(bytes, privateKey),
  verify: (signature: Uint8Array, bytes: Uint8Array, publicKey: Uint8Array) =>
    ed25519.verify(signature, bytes, publicKey, STRICT),
});

/** A signature in Base58, as Solana writes signatures. */
export function base58Signature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,88}$/u.test(trimmed)) return undefined;
  const bytes = base58.decode(trimmed);
  return bytes.length === SIGNATURE_BYTES ? bytes : undefined;
}

/** The Ed25519 message signing of one coin or part, for its derivation worker. */
export function ed25519CoinSigning(facts: PublicKeyCoinFacts): CoinMessageSigning {
  return publicKeyCoinSigning(ED25519, facts);
}
