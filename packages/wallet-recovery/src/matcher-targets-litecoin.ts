import { LITECOIN_ADDRESS } from "@ckd/coins/litecoin/profiles.js";
import { base58Hash, bech32Hash, singleKeyMatcher } from "./matcher-targets-single-key.js";

/**
 * Litecoin's part of the matcher: L… and M… addresses, ltc1q… addresses, and the old 3… form of a
 * P2SH address, which Bitcoin's part reads too and which the nested SegWit rows show.
 */
export const LITECOIN_MATCHER = singleKeyMatcher(
  ["litecoin-legacy", "litecoin-nested-segwit", "litecoin-native-segwit"],
  (value) => {
    if (base58Hash(value, [LITECOIN_ADDRESS.p2pkh]) !== null)
      return { normalized: value, adapterIds: ["litecoin-legacy"] };
    if (
      base58Hash(value, [LITECOIN_ADDRESS.p2sh]) !== null ||
      base58Hash(value, [LITECOIN_ADDRESS.oldP2sh]) !== null
    )
      return { normalized: value, adapterIds: ["litecoin-nested-segwit"] };
    return bech32Hash(value, LITECOIN_ADDRESS.bech32Hrp, true) === null
      ? null
      : { normalized: value.toLowerCase(), adapterIds: ["litecoin-native-segwit"] };
  },
);
