import { ACCOUNT_COIN_RECOVERY_ADAPTERS } from "./account-coins.js";
import { BITCOIN_RECOVERY_ADAPTER } from "./bitcoin/index.js";
import { DASH_RECOVERY_ADAPTER } from "./dash/index.js";
import { ETHEREUM_RECOVERY_ADAPTER } from "./ethereum/index.js";
import { EVM_NETWORK_RECOVERY_ADAPTERS } from "./evm-networks.js";
import { createRecoveryCoinRegistry } from "./registry.js";

export const { getRecoveryCoin, listRecoveryCoins } = createRecoveryCoinRegistry([
  BITCOIN_RECOVERY_ADAPTER,
  ETHEREUM_RECOVERY_ADAPTER,
  ...EVM_NETWORK_RECOVERY_ADAPTERS,
  DASH_RECOVERY_ADAPTER,
  ...ACCOUNT_COIN_RECOVERY_ADAPTERS,
]);
