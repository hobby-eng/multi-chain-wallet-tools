import { DASH_COMMUNITY_COIN_ADAPTERS } from './dash-community-registry-profile.js';
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
} = createCoinRegistry(DASH_COMMUNITY_COIN_ADAPTERS);
