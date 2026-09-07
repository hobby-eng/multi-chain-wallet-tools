import { BITCOIN_RECOVERY_ADAPTER } from './bitcoin/index.js';
import { DASH_RECOVERY_ADAPTER } from './dash/index.js';
import { ETHEREUM_RECOVERY_ADAPTER } from './ethereum/index.js';
import { createRecoveryCoinRegistry } from './registry.js';

export const {
  getRecoveryCoin,
  listRecoveryCoins,
} = createRecoveryCoinRegistry([
  BITCOIN_RECOVERY_ADAPTER,
  ETHEREUM_RECOVERY_ADAPTER,
  DASH_RECOVERY_ADAPTER,
]);
