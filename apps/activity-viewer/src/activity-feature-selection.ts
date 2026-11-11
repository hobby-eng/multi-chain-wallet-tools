import { ACCOUNT_COIN_READERS } from "@ckd/public-data-providers/account-coins.js";
import { AccountStatesService } from "@ckd/public-data-providers/account-states-service.js";
import { EvmHistoryService } from "@ckd/public-data-providers/evm-history-service.js";
import { hasEvmHistory } from "@ckd/public-data-providers/evm-network-facts.js";
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import { EvmAccountService } from "@ckd/public-data-providers/evm-service.js";
import { createAccountActivityAdapter } from "./activity-account.js";
import { BITCOIN_ACTIVITY_ADAPTER } from "./activity-bitcoin.js";
import { createEvmActivityAdapter } from "./activity-evm.js";

// The development build's adapters: every coin, every EVM network of the EVM network table and
// every account coin of the account coin table. A composed build inlines the rows of its selected
// networks and coins instead (tooling/activity-viewer-composition.mjs).
const evmAccounts = new EvmAccountService(EVM_NETWORKS);
const evmHistory = new EvmHistoryService(EVM_NETWORKS.filter(hasEvmHistory));
const accountStates = new AccountStatesService(ACCOUNT_COIN_READERS);

export const SELECTED_EXTERNAL_ACTIVITY_ADAPTERS = [
  BITCOIN_ACTIVITY_ADAPTER,
  ...EVM_NETWORKS.map((facts) =>
    createEvmActivityAdapter(
      facts,
      evmAccounts,
      // Only a network whose row names a history endpoint has a history provider (Blockscout).
      hasEvmHistory(facts) ? evmHistory : undefined,
    ),
  ),
  ...ACCOUNT_COIN_READERS.map((reader) => createAccountActivityAdapter(reader, accountStates)),
];
