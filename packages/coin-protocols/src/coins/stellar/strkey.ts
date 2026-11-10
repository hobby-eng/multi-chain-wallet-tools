// Stellar's StrKey (SEP-0023): base32 without padding of a version byte, the payload and its
// CRC-16/XMODEM, low byte first.
import { base32nopad } from "@scure/base";
import { crc16Xmodem } from "@ckd/core/crc16.js";
import { concatBytes, wipe } from "@ckd/core/crypto.js";

/** SEP-0023's version byte of an Ed25519 public key, an account ID ("G…"). */
export const STRKEY_PUBLIC_KEY = 6 << 3;
/** SEP-0023's version byte of an Ed25519 secret seed ("S…"). */
export const STRKEY_SECRET_SEED = 18 << 3;

/** The StrKey of `payload` under `version`; its working copies are wiped, since a seed is secret. */
export function strKey(version: number, payload: Uint8Array): string {
  const body = concatBytes(Uint8Array.of(version), payload);
  const crc = crc16Xmodem(body);
  const bytes = concatBytes(body, Uint8Array.of(crc & 0xff, crc >> 8));
  try {
    return base32nopad.encode(bytes);
  } finally {
    wipe(body, bytes);
  }
}

/** Whether `value` is the StrKey of a 32-byte Ed25519 public key (an account ID, "G…"). */
export function isStellarAccountId(value: string): boolean {
  if (!/^G[A-Z2-7]{55}$/u.test(value)) return false;
  let bytes: Uint8Array;
  try {
    bytes = base32nopad.decode(value);
  } catch {
    return false;
  }
  const crc = crc16Xmodem(bytes.subarray(0, 33));
  return bytes[0] === STRKEY_PUBLIC_KEY && bytes[33] === (crc & 0xff) && bytes[34] === crc >> 8;
}
