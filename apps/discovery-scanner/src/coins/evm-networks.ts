// The EVM networks besides Ethereum, built from the EVM network table for the development build; a
// composed build inlines the rows of its selected networks instead
// (tooling/discovery-composition.mjs).
import type { CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import { ETHEREUM_CLASSIC_ADDRESSES } from "@ckd/coins/ethereum-classic/index.js";
import {
  hasEvmHistory,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import type { RecoveryCoinAdapter } from "../types.js";
import { evmNetworkPrivacy, type EvmCoinOptions } from "./evm/coin.js";
import { evmHistory } from "./evm/history.js";
import { createEvmRecoveryAdapter } from "./evm/index.js";

/**
 * The public address schemes of the Deriver coins that EVM rows name as their `walletCoin`, by that
 * coin's id (a composed build imports the one its row names, tooling/evm-networks.mjs).
 */
const WALLET_ADDRESSES: Readonly<Record<string, CoinAddressScheme>> = {
  "ethereum-classic": ETHEREUM_CLASSIC_ADDRESSES,
};

/** The privacy note of every EVM network of the table, as a full build shows it. */
const PRIVACY = evmNetworkPrivacy(EVM_NETWORKS);

/**
 * What the development build adds to the row `facts`: the privacy note of the whole table, the
 * history where the row names one, and the network's own wallets' layouts where it has them.
 */
export function developmentEvmOptions(facts: EvmNetworkFacts): EvmCoinOptions {
  const { walletCoin } = facts;
  const addresses = walletCoin === undefined ? undefined : WALLET_ADDRESSES[walletCoin];
  if (walletCoin !== undefined && addresses === undefined)
    throw new Error(`No public addresses of the Deriver coin ${walletCoin}.`);
  return {
    privacy: PRIVACY,
    ...(hasEvmHistory(facts) ? { getHistory: evmHistory(facts.id) } : {}),
    ...(addresses === undefined ? {} : { addresses }),
  };
}

/** Every EVM network of the EVM network table except Ethereum, in the table's order. */
export const EVM_NETWORK_RECOVERY_ADAPTERS: readonly RecoveryCoinAdapter[] = EVM_NETWORKS.filter(
  ({ id }) => id !== "ethereum",
).map((facts) => createEvmRecoveryAdapter(facts, developmentEvmOptions(facts)));
