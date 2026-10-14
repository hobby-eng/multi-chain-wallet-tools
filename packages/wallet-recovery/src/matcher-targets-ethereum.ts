import type { MatcherCoin } from "./matcher-targets.js";

/** Ethereum's part of the matcher: a 0x address, the same on every chain profile. */
export const ETHEREUM_MATCHER: MatcherCoin = {
  recognize: (value, network) =>
    /^0x[0-9a-f]{40}$/iu.test(value)
      ? { input: value, normalized: value.toLowerCase(), network, adapterIds: ["ethereum"] }
      : null,
  addressAdapters: ["ethereum"],
};
