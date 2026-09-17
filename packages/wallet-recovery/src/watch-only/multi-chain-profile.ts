import prefixCoins from './prefix-coins.json';

/** Canonical explicit-prefix ownership registry shared by runtime detection and build composition. */
export const MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS: Readonly<Record<string, string>> = prefixCoins;
