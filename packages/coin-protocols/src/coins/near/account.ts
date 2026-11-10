// NEAR's implicit account and key text: the account is the 64 lowercase hex digits of an Ed25519
// public key, and a key is written "ed25519:" and base58, as near-seed-phrase writes it. A named
// account such as name.near is a separate account that may hold the key; only the network knows
// that.
import { base58 } from "@scure/base";
import { bytesToHex } from "@ckd/core/crypto.js";

/** The prefix of NEAR's key text. */
const KEY_PREFIX = "ed25519:";
/** An Ed25519 public key's bytes. */
const PUBLIC_KEY_BYTES = 32;

/** The implicit account of a 32-byte Ed25519 public key. */
export function nearImplicitAccount(publicKey: Uint8Array): string {
  return bytesToHex(publicKey);
}

/** The implicit account `value` names in its canonical lowercase form, or null when it is none. */
export function canonicalNearImplicitAccount(value: string): string | null {
  return /^[0-9a-f]{64}$/iu.test(value) ? value.toLowerCase() : null;
}

/** NEAR's text of a key's bytes: "ed25519:" and base58. */
export function nearKeyText(bytes: Uint8Array): string {
  return `${KEY_PREFIX}${base58.encode(bytes)}`;
}

/**
 * The 32 bytes of a public key written as NEAR writes it ("ed25519:" and base58), or null for any
 * other text, a secret key's 64 bytes included.
 */
export function nearPublicKeyOf(value: string): Uint8Array | null {
  if (!value.startsWith(KEY_PREFIX)) return null;
  const body = value.slice(KEY_PREFIX.length);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(body)) return null;
  try {
    const bytes = base58.decode(body);
    return bytes.length === PUBLIC_KEY_BYTES ? bytes : null;
  } catch {
    return null;
  }
}
