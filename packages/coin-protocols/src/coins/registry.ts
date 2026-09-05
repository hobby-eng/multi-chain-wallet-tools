import { BITCOIN_COIN_ADAPTERS } from './adapters/bitcoin.js';
import { DASH_COIN_ADAPTERS } from './adapters/dash.js';
import { ETHEREUM_COIN_ADAPTERS } from './adapters/ethereum.js';
import { createCoinRegistry } from './registry-base.js';

export type {
  AddressBranches,
  BranchControl,
  CoinAdapter,
  CoinDerivationInput,
  CoinFamily,
  CoinFieldRoles,
  CoinLimits,
  ControlOption,
} from './registry-base.js';

export const {
  COIN_ADAPTERS,
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getCoinFamily,
  getDefaultCoinAdapter,
} = createCoinRegistry([
  ...BITCOIN_COIN_ADAPTERS,
  ...ETHEREUM_COIN_ADAPTERS,
  ...DASH_COIN_ADAPTERS,
]);
