import type { EvmNetworkFacts } from "@ckd/public-data-providers/evm-network-facts.js";
import type { RecoveryCoinAdapter } from "../../types.js";
import type { EvmCoinOptions } from "./coin.js";
import { createEvmSeedRecoveryAdapter } from "./seed.js";
import { evmWatchOnlyScans } from "./watch-adapter.js";

/**
 * The adapter of the EVM network `facts` (a EVM network table row) with seed and watch-only scans; the
 * one factory of Ethereum and every other EVM network.
 */
export function createEvmRecoveryAdapter(
  facts: EvmNetworkFacts,
  options: EvmCoinOptions = {},
): RecoveryCoinAdapter {
  const seed = createEvmSeedRecoveryAdapter(facts, options);
  return { ...seed, ...evmWatchOnlyScans(facts, seed) };
}
