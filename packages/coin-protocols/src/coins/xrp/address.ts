// The XRP Ledger's classic address: its type prefix 0x00 and a 20-byte account ID, in base58 with
// Ripple's alphabet and a four-byte double-SHA-256 checksum.
import { base58xrp } from "@scure/base";
import { concatBytes, sha256 } from "@ckd/core/crypto.js";

const ACCOUNT_ID_PREFIX = 0x00;

const checksumOf = (payload: Uint8Array) => sha256(sha256(payload)).slice(0, 4);

/** The classic address ("r…") of a 20-byte account ID. */
export function xrpClassicAddress(accountId: Uint8Array): string {
  const payload = concatBytes(Uint8Array.of(ACCOUNT_ID_PREFIX), accountId);
  return base58xrp.encode(concatBytes(payload, checksumOf(payload)));
}

/** The account ID of a classic address, or null when it is not one or its checksum fails. */
export function xrpAccountIdOf(address: string): Uint8Array | null {
  let bytes: Uint8Array;
  try {
    bytes = base58xrp.decode(address);
  } catch {
    return null;
  }
  if (bytes.length !== 25 || bytes[0] !== ACCOUNT_ID_PREFIX) return null;
  const checksum = checksumOf(bytes.subarray(0, 21));
  return checksum.every((byte, at) => byte === bytes[21 + at]) ? bytes.slice(1, 21) : null;
}
