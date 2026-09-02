import { registerRecoveryCoin } from './registry.js';
import { DASH_RECOVERY_ADAPTER } from './dash/index.js';

registerRecoveryCoin(DASH_RECOVERY_ADAPTER);

export { getRecoveryCoin, listRecoveryCoins } from './registry.js';
