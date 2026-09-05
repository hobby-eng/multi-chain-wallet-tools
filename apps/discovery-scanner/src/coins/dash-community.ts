import { DASH_RECOVERY_ADAPTER } from './dash/index.js';
import { createRecoveryCoinRegistry } from './registry.js';

export const {
  getRecoveryCoin,
  listRecoveryCoins,
} = createRecoveryCoinRegistry([
  DASH_RECOVERY_ADAPTER,
]);
