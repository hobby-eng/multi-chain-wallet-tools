import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import {
  MultiChainWatchOnlyDepthPolicy,
  MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
} from "@ckd/recovery/watch-only/multi-chain-profile.js";
export const MULTI_CHAIN_WATCH_ONLY_PROFILE = {
  prefixCoins: MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
  multiChain: true,
  // Every EVM network: an xpub names no chain, so the selected network applies.
  networklessAdapterIds: EVM_NETWORKS.map(({ id }) => id),
  supportedDepths: MultiChainWatchOnlyDepthPolicy.supported,
} as const;
