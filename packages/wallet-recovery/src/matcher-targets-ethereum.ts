import { EthereumAddress } from "@ckd/core/eip55.js";
import type { MatcherCoin } from "./matcher-targets.js";

/** Ethereum's part of the matcher: a 0x address, the same on every chain profile. */
export const ETHEREUM_MATCHER: MatcherCoin = {
  recognize: (value, network) =>
    EthereumAddress.accepts(value)
      ? { input: value, normalized: value.toLowerCase(), network, adapterIds: ["ethereum"] }
      : null,
  addressAdapters: ["ethereum"],
};
