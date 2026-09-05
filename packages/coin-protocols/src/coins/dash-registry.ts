import { DASH_COIN_ADAPTERS } from './adapters/dash.js';
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
} = createCoinRegistry(DASH_COIN_ADAPTERS);
