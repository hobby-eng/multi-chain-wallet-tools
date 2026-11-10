import { EthereumPublicDataService } from "@ckd/public-data-providers/ethereum-service.js";
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import { EvmAccountService } from "@ckd/public-data-providers/evm-service.js";
import { BITCOIN_ACTIVITY_ADAPTER } from "./activity-bitcoin.js";
import { createEvmActivityAdapter } from "./activity-evm.js";

// The development build's adapters: every coin and every EVM network of the EVM network table. A
// composed build inlines the rows of its selected networks instead
// (tooling/activity-viewer-composition.mjs).
const evmAccounts = new EvmAccountService(EVM_NETWORKS);

export const SELECTED_EXTERNAL_ACTIVITY_ADAPTERS = [
  BITCOIN_ACTIVITY_ADAPTER,
  ...EVM_NETWORKS.map((facts) =>
    createEvmActivityAdapter(
      facts,
      evmAccounts,
      // Ethereum alone has a history provider (Blockscout).
      facts.id === "ethereum" ? new EthereumPublicDataService(facts) : undefined,
    ),
  ),
];
