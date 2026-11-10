// TON's account addresses on the basechain of mainnet (ton-org/ton-core src/address/Address.ts, read
// 2026-11-10). The user-friendly form is 36 bytes in base64 or base64url: a tag (0x11 bounceable,
// "EQ…"; 0x51 non-bounceable, "UQ…"; 0x80 added for a testnet-only address), the workchain as a
// signed byte, the 32-byte account id, and CRC16-XModem of those 34 bytes, high byte first. The raw
// form is "0:" and the account id in hex, without a checksum. Crypto-free.
import { base64, base64urlnopad, hex } from "@scure/base";
import { crc16Xmodem } from "@ckd/core/crc16.js";

const BOUNCEABLE_TAG = 0x11;
const NON_BOUNCEABLE_TAG = 0x51;
const BASECHAIN = 0;
const ACCOUNT_ID_BYTES = 32;
const FRIENDLY_BYTES = 2 + ACCOUNT_ID_BYTES + 2;

/** The user-friendly form of the basechain account `accountId`: UQ…, or EQ… when `bounceable`. */
export function tonFriendlyAddress(accountId: Uint8Array, bounceable = false): string {
  if (accountId.length !== ACCOUNT_ID_BYTES) throw new Error("A TON account id has 32 bytes.");
  const bytes = new Uint8Array(FRIENDLY_BYTES);
  bytes[0] = bounceable ? BOUNCEABLE_TAG : NON_BOUNCEABLE_TAG;
  bytes[1] = BASECHAIN;
  bytes.set(accountId, 2);
  const crc = crc16Xmodem(bytes.subarray(0, FRIENDLY_BYTES - 2));
  bytes[FRIENDLY_BYTES - 2] = crc >> 8;
  bytes[FRIENDLY_BYTES - 1] = crc & 0xff;
  return base64urlnopad.encode(bytes);
}

/** The 36 bytes of a user-friendly address in either alphabet, or null. */
function friendlyBytes(text: string): Uint8Array | null {
  const urlSafe = /^[A-Za-z0-9_-]{48}$/u.test(text);
  if (!urlSafe && !/^[A-Za-z0-9+/]{48}$/u.test(text)) return null;
  try {
    return (urlSafe ? base64urlnopad : base64).decode(text);
  } catch {
    return null;
  }
}

/**
 * The 32-byte account id of a mainnet basechain address: a user-friendly form (bounceable or not,
 * either alphabet) with a valid checksum, or the raw form. Null for any other text, a testnet-only
 * address and another workchain.
 */
export function tonAccountId(text: string): Uint8Array | null {
  const rawId = /^0:([0-9a-fA-F]{64})$/u.exec(text)?.[1];
  if (rawId !== undefined) return hex.decode(rawId.toLowerCase());
  const bytes = friendlyBytes(text);
  if (bytes?.length !== FRIENDLY_BYTES) return null;
  const tag = bytes[0];
  if ((tag !== BOUNCEABLE_TAG && tag !== NON_BOUNCEABLE_TAG) || bytes[1] !== BASECHAIN) return null;
  const crc = crc16Xmodem(bytes.subarray(0, FRIENDLY_BYTES - 2));
  if (bytes[FRIENDLY_BYTES - 2] !== crc >> 8 || bytes[FRIENDLY_BYTES - 1] !== (crc & 0xff))
    return null;
  return bytes.slice(2, 2 + ACCOUNT_ID_BYTES);
}

/** Whether two address texts name the same mainnet basechain account, whatever their forms. */
export function tonAddressesEqual(derived: string, expected: string): boolean {
  const left = tonAccountId(derived);
  const right = tonAccountId(expected);
  return left !== null && right !== null && left.every((byte, index) => byte === right[index]);
}
