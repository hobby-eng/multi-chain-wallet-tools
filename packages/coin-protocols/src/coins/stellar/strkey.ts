// Stellar's StrKey (SEP-0023): base32 without padding of a version byte, the payload and its
// CRC-16/XMODEM, low byte first. The version bytes and the shape of a key's StrKey live in
// @ckd/core/strkey.js, which the public-input guard shares; the checksum lives here.
import { base32nopad } from "@scure/base";
import { crc16Xmodem } from "@ckd/core/crc16.js";
import { concatBytes, wipe } from "@ckd/core/crypto.js";
import { STRKEY_PUBLIC_KEY, strKeyVersion } from "@ckd/core/strkey.js";

/** A key's StrKey before its checksum: the version byte and the 32-byte key. */
const KEY_BODY_BYTES = 33;

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

/** The account ID ("G…") of a 32-byte Ed25519 public key. */
export function stellarAccountId(publicKey: Uint8Array): string {
  return strKey(STRKEY_PUBLIC_KEY, publicKey);
}

/** Whether `value` is the StrKey of a 32-byte Ed25519 public key (an account ID, "G…"). */
export function isStellarAccountId(value: string): boolean {
  if (strKeyVersion(value) !== STRKEY_PUBLIC_KEY) return false;
  const bytes = base32nopad.decode(value);
  const crc = crc16Xmodem(bytes.subarray(0, KEY_BODY_BYTES));
  return bytes[KEY_BODY_BYTES] === (crc & 0xff) && bytes[KEY_BODY_BYTES + 1] === crc >> 8;
}
