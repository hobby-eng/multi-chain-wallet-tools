import { orderCoins } from "./coin-order.js";
import { MULTI_CHAIN_COIN_ADAPTERS } from "./multi-chain-registry-profile.js";
import { createCoinRegistry } from "./registry-base.js";

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
} from "./registry-base.js";

/** The order of the coin lists that this build's pages compose from other sources (coin-order.ts). */
export { compareCoinNames } from "./coin-order.js";

// The Coin menu's order (coin-order.ts): the families by name, each family's variants as registered.
export const {
  COIN_ADAPTERS,
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getCoinFamily,
  getDefaultCoinAdapter,
} = createCoinRegistry(MULTI_CHAIN_COIN_ADAPTERS, (labels) => orderCoins(labels, (label) => label));
