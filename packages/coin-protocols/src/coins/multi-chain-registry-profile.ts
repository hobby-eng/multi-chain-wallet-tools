import { BITCOIN_COIN_ADAPTERS } from './adapters/bitcoin.js';
import { DASH_COIN_ADAPTERS } from './adapters/dash.js';
import { ETHEREUM_COIN_ADAPTERS } from './adapters/ethereum.js';
import type { CoinAdapter } from './registry-base.js';

export const MULTI_CHAIN_COIN_ADAPTERS: readonly CoinAdapter[] = [
  ...BITCOIN_COIN_ADAPTERS,
  ...ETHEREUM_COIN_ADAPTERS,
  ...DASH_COIN_ADAPTERS,
];
