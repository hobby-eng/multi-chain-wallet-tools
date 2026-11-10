// The shape of a StrKey (SEP-0023) of a 32-byte Ed25519 key: base32 without padding of a version
// byte, the key and its 2-byte checksum, 56 characters. Stellar's account IDs and secret seeds are
// such keys. The public-input guard reads a pasted value's version byte here to refuse a secret
// seed in every connected build, Dash's included, so this module names no coin and leaves the
// checksum to the coin's own module (coins/stellar/strkey.ts): a seed with a typo is just as secret.
import { base32nopad } from "@scure/base";
import { wipe } from "./crypto.js";

/** SEP-0023's version byte of an Ed25519 public key, an account ID ("G…"). */
export const STRKEY_PUBLIC_KEY = 6 << 3;
/** SEP-0023's version byte of an Ed25519 secret seed ("S…"). */
export const STRKEY_SECRET_SEED = 18 << 3;
/** 56 base32 characters: 35 bytes, the version byte, the 32-byte key and the checksum. */
const KEY_STRKEY_PATTERN = /^[A-Z2-7]{56}$/u;

/**
 * The version byte of `value` when it has the shape of a 32-byte key's StrKey, else undefined. The
 * checksum is not checked. The decoded bytes are wiped, since they may hold a secret seed.
 */
export function strKeyVersion(value: string): number | undefined {
  if (!KEY_STRKEY_PATTERN.test(value)) return undefined;
  // 56 characters are exactly 280 bits, so the decoding has no padding bits to refuse.
  const bytes = base32nopad.decode(value);
  try {
    return bytes[0];
  } finally {
    wipe(bytes);
  }
}
