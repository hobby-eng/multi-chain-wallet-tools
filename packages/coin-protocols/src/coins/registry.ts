import { MULTI_CHAIN_COIN_ADAPTERS } from './multi-chain-registry-profile.js';
import { createCoinRegistry } from './registry-base.js';

export type {
  AddressBranches,
  BranchControl,
  CoinAdapter,
  CoinDerivationInput,
  CoinFamily,
  CoinFieldRoles,
  CoinJoinBranches,
  CoinJoinPathPreview,
  CoinJoinSupport,
  CoinLimits,
  CoinRegistry,
  ControlOption,
} from './registry-base.js';

export const {
  COIN_ADAPTERS,
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getCoinFamily,
  getDefaultCoinAdapter,
} = createCoinRegistry(MULTI_CHAIN_COIN_ADAPTERS);
