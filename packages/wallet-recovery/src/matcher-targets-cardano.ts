import { isCardanoMainnetAddress } from "@ckd/coins/cardano/address.js";
import type { MatcherCoin } from "./matcher-targets.js";

/**
 * Cardano's part of the matcher, which searches none of its keys yet: the Matcher derives from
 * BIP39's seed, while Cardano's Icarus variants derive from the CIP-3 root of the phrase. A Cardano
 * mainnet address is refused in plain words, rather than read as an address of no coin.
 */
export const CARDANO_MATCHER: MatcherCoin = {
  recognize: (value, network) => {
    if (network === "mainnet" && isCardanoMainnetAddress(value))
      throw new Error(
        "The Wallet Matcher cannot search Cardano addresses yet. Derive them in Generate & Derive, under Cardano.",
      );
    return null;
  },
  addressAdapters: [],
};
