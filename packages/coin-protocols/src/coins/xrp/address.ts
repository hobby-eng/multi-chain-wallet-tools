// The XRP Ledger's classic address: its type prefix 0x00 and a 20-byte account ID, in Base58Check
// with Ripple's alphabet.
import { concatBytes } from "@ckd/core/crypto.js";
import { decodeRippleBase58Check, encodeRippleBase58Check } from "@ckd/core/ripple-base58check.js";

const ACCOUNT_ID_PREFIX = 0x00;
/** The payload of a classic address: the type prefix and the 20-byte account ID. */
const ADDRESS_PAYLOAD_BYTES = 21;

/** The classic address ("r…") of a 20-byte account ID. */
export function xrpClassicAddress(accountId: Uint8Array): string {
  return encodeRippleBase58Check(concatBytes(Uint8Array.of(ACCOUNT_ID_PREFIX), accountId));
}

/** The account ID of a classic address, or null when it is not one or its checksum fails. */
export function xrpAccountIdOf(address: string): Uint8Array | null {
  const payload = decodeRippleBase58Check(address);
  if (payload === null || payload.length !== ADDRESS_PAYLOAD_BYTES) return null;
  return payload[0] === ACCOUNT_ID_PREFIX ? payload.slice(1) : null;
}
