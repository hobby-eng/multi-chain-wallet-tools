import { ACCOUNT_COIN_READERS } from "@ckd/public-data-providers/account-coins.js";
import { AccountStatesService } from "@ckd/public-data-providers/account-states-service.js";
import { EthereumPublicDataService } from "@ckd/public-data-providers/ethereum-service.js";
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import { EvmAccountService } from "@ckd/public-data-providers/evm-service.js";
import { createAccountActivityAdapter } from "./activity-account.js";
import { BITCOIN_ACTIVITY_ADAPTER } from "./activity-bitcoin.js";
import { createEvmActivityAdapter } from "./activity-evm.js";

// The development build's adapters: every coin, every EVM network of the EVM network table and
// every account coin of the account coin table. A composed build inlines the rows of its selected
// networks and coins instead (tooling/activity-viewer-composition.mjs).
const evmAccounts = new EvmAccountService(EVM_NETWORKS);
const accountStates = new AccountStatesService(ACCOUNT_COIN_READERS);

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
  ...ACCOUNT_COIN_READERS.map((reader) => createAccountActivityAdapter(reader, accountStates)),
];
