import { DASH_COIN_ADAPTERS } from './adapters/dash.js';
import type { CoinAdapter } from './registry-base.js';

export const DASH_COMMUNITY_COIN_ADAPTERS: readonly CoinAdapter[] = [...DASH_COIN_ADAPTERS];
