// Base58Check in Ripple's alphabet: a payload and the first four bytes of its double SHA-256, in
// base58 with the XRP Ledger's alphabet. The XRP Ledger's classic addresses and family seeds use it.
// The public-input guard shares it to refuse a family seed in every connected build, Dash's
// included, so this module names no coin.
import { base58xrp } from "@scure/base";
import { concatBytes, sha256, wipe } from "./crypto.js";

const CHECKSUM_BYTES = 4;

/** The checksum of `payload`; the intermediate digest is wiped, since a payload may be a seed. */
function checksumOf(payload: Uint8Array): Uint8Array {
  const once = sha256(payload);
  try {
    return sha256(once).slice(0, CHECKSUM_BYTES);
  } finally {
    wipe(once);
  }
}

/** The Base58Check text of `payload` in Ripple's alphabet. */
export function encodeRippleBase58Check(payload: Uint8Array): string {
  return base58xrp.encode(concatBytes(payload, checksumOf(payload)));
}

/**
 * The payload of a Base58Check `text` in Ripple's alphabet, or null when it is not base58 in that
 * alphabet or its checksum fails. The decoded copy is wiped; the caller owns the payload returned.
 */
export function decodeRippleBase58Check(text: string): Uint8Array | null {
  let bytes: Uint8Array;
  try {
    bytes = base58xrp.decode(text);
  } catch {
    return null;
  }
  try {
    if (bytes.length <= CHECKSUM_BYTES) return null;
    const payload = bytes.slice(0, -CHECKSUM_BYTES);
    const checksum = checksumOf(payload);
    if (checksum.every((byte, at) => byte === bytes[payload.length + at])) return payload;
    wipe(payload);
    return null;
  } finally {
    wipe(bytes);
  }
}
