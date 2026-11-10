import type { EvmNetworkFacts } from "@ckd/public-data-providers/evm-network-facts.js";
import { evmWatchOnlyDetector } from "@ckd/recovery/watch-only/evm.js";
import type { RecoveryCoinAdapter } from "../../types.js";
import { watchOnlyAdapter, type RecoveryCoinFacts, type WatchOnlyScans } from "../registry.js";
import { evmCoinFacts, type EvmCoinOptions } from "./coin.js";
import { evmWatchOnlyScan } from "./watch-only.js";

/** The watch-only half of the EVM network `facts`, reported as the coin `coin`. */
export function evmWatchOnlyScans(facts: EvmNetworkFacts, coin: RecoveryCoinFacts): WatchOnlyScans {
  return {
    detectWatchOnly: evmWatchOnlyDetector(facts),
    scanWatchOnly: evmWatchOnlyScan(facts, coin),
  };
}

/** The adapter of a build that scans the EVM network `facts` from watch-only keys only. */
export function createEvmWatchOnlyRecoveryAdapter(
  facts: EvmNetworkFacts,
  options: EvmCoinOptions = {},
): RecoveryCoinAdapter {
  const coin = evmCoinFacts(facts, options);
  return watchOnlyAdapter(coin, evmWatchOnlyScans(facts, coin));
}
