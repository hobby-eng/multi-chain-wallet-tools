import {
  MultiChainWatchOnlyDepthPolicy,
  MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
} from "@ckd/recovery/watch-only/multi-chain-profile.js";
export const MULTI_CHAIN_WATCH_ONLY_PROFILE = {
  prefixCoins: MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
  multiChain: true,
  networklessAdapterIds: ["ethereum"],
  supportedDepths: MultiChainWatchOnlyDepthPolicy.supported,
} as const;
