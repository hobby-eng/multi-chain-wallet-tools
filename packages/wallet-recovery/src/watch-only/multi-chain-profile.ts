import prefixCoins from "./prefix-coins.json";
import { WatchOnlyDepthPolicy } from "./dash-profile.js";

/** Canonical explicit-prefix ownership registry shared by runtime detection and build composition. */
export const MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS: Readonly<Record<string, string>> = prefixCoins;

const BITCOIN_BRANCH_DEPTH = 4;

/** Bitcoin scans account and branch xpubs; other profiles also accept indexed keys. */
export class MultiChainWatchOnlyDepthPolicy {
  static supported(adapterId: string): readonly number[] {
    return adapterId === "bitcoin"
      ? WatchOnlyDepthPolicy.through(BITCOIN_BRANCH_DEPTH)
      : WatchOnlyDepthPolicy.supported();
  }
}
