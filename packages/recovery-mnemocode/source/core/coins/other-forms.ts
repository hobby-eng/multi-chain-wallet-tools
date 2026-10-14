// Whether a text is written as some coin's address is, valid in its own form: Bech32 or Bech32m,
// 0x and 40 hexadecimal digits, a prefixed CashAddr, or Base58Check in Bitcoin's or the XRP
// Ledger's alphabet. A coin that cannot read a text asks this before calling it damaged, so that
// an address of another coin is refused as such (Coin.parse). It names no coin.
//
// Host-neutral: it imports only base58-check.ts, bech32.ts and @scure/base
// (test/portable-modules.test.ts).

import { base58, base58xrp, bech32, bech32m } from "@scure/base";
import { checkedData } from "./base58-check.js";
import { BECH32_ALPHABET, bech32Groups, decodeBech32 } from "./bech32.js";
import { HASH160_BYTES, HEX_ACCOUNT_BYTES } from "./address-sizes.js";
import { asciiLowercase } from "../white-space.js";

/** What an Ethereum-style account begins with, in either case. */
const HEX_ACCOUNT_PREFIX = /^0x/iu;
/** The hexadecimal digits of an Ethereum-style account: two for each of its bytes. */
export const HEX_ACCOUNT_DIGITS = 2 * HEX_ACCOUNT_BYTES;
const HEX_ACCOUNT_BODY = new RegExp(`^[0-9a-f]{${HEX_ACCOUNT_DIGITS}}$`, "iu");

/**
 * The digits after 0x of `text`, an account written as Ethereum writes it; undefined without 0x.
 */
export function hexAccountDigits(text: string): string | undefined {
  return HEX_ACCOUNT_PREFIX.test(text) ? text.slice(2) : undefined;
}

/** Whether `digits`, after 0x, are the digits of an account. */
export function isHexAccount(digits: string): boolean {
  return HEX_ACCOUNT_BODY.test(digits);
}

/** CashAddr's checksum: eight five-bit groups after the data. */
export const CASHADDR_CHECKSUM_GROUPS = 8;
/**
 * A CashAddr of a 160-bit hash: its version byte and hash in five-bit groups, as Bech32 writes
 * its data (bech32Groups), then the checksum.
 */
const CASHADDR_160_GROUPS = bech32Groups(1 + HASH160_BYTES) + CASHADDR_CHECKSUM_GROUPS;
/** A CashAddr with its prefix: small letters, a colon and its groups in Bech32's alphabet. */
const PREFIXED_CASHADDR = new RegExp(`^[a-z]+:[${BECH32_ALPHABET}]{${CASHADDR_160_GROUPS}}$`, "u");

/** Whether `text`, trimmed, is a valid string in the form of some coin's addresses. */
export function writtenAsAnAddress(text: string): boolean {
  return (
    isHexAccount(hexAccountDigits(text) ?? "") ||
    PREFIXED_CASHADDR.test(asciiLowercase(text)) ||
    decodeBech32(text, bech32) !== undefined ||
    decodeBech32(text, bech32m) !== undefined ||
    checkedData(text, base58) !== undefined ||
    checkedData(text, base58xrp) !== undefined
  );
}
