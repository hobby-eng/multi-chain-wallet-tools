import { CASHADDR_P2KH, decodeCashAddr } from "@ckd/core/cashaddr.js";
import { BITCOIN_CASH_ADDRESS } from "@ckd/coins/bitcoin-cash/profiles.js";
import { base58Hash } from "@ckd/core/crypto.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

const ADAPTERS = ["bitcoin-cash", "bitcoin-cash-coin-type-0"];

/**
 * Bitcoin Cash's part of the matcher: P2PKH CashAddr, with or without "bitcoincash:", and the legacy
 * 1… form, which Bitcoin's part reads too and which the rows show beside the CashAddr.
 */
export const BITCOIN_CASH_MATCHER = singleKeyMatcher(ADAPTERS, (value) => {
  if (base58Hash(value, [BITCOIN_CASH_ADDRESS.p2pkh]) !== null)
    return { normalized: value, adapterIds: ADAPTERS };
  const decoded = decodeCashAddr(value, BITCOIN_CASH_ADDRESS.prefix);
  if (decoded === null || decoded.type !== CASHADDR_P2KH) return null;
  const lower = value.toLowerCase();
  const prefix = `${BITCOIN_CASH_ADDRESS.prefix}:`;
  return {
    normalized: lower.startsWith(prefix) ? lower : `${prefix}${lower}`,
    adapterIds: ADAPTERS,
  };
});
