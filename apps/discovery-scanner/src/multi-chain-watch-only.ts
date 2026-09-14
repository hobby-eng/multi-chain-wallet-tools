import { MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS } from '@ckd/recovery/watch-only/multi-chain-profile.js';
export const MULTI_CHAIN_WATCH_ONLY_PROFILE = {
  prefixCoins: MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
  multiChain: true,
  networklessAdapterIds: ['ethereum'],
  supportedDepths: (adapterId: string): readonly number[] => (adapterId === 'bitcoin' ? [3, 4] : [3, 4, 5]),
} as const;
