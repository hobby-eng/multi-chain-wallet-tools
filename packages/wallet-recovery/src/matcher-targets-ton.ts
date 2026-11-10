import { tonAccountId, tonFriendlyAddress } from "@ckd/coins/ton/address.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/**
 * TON's part of the matcher: an address in any of its forms (UQ…, EQ…, base64 or base64url, or
 * raw 0:…), read as its non-bounceable UQ… form, which each row shows for every wallet contract. The
 * Matcher derives BIP39 seeds, so it searches Trust Wallet's and Ledger's keys; the Telegram
 * wallet's key comes from a TON phrase, which only the Deriver's Telegram wallet tab reads.
 */
const ADAPTERS = ["ton-trust", "ton-ledger"];

export const TON_MATCHER = singleKeyMatcher(ADAPTERS, (value) => {
  const accountId = tonAccountId(value);
  return accountId === null
    ? null
    : { normalized: tonFriendlyAddress(accountId), adapterIds: ADAPTERS };
});
