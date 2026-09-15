import type { RecoveryCoinAdapter } from '../../types.js';
import { ETHEREUM_SEED_RECOVERY_ADAPTER } from './seed.js';
import { ETHEREUM_WATCH_ONLY_RECOVERY_ADAPTER } from './watch-adapter.js';

export const ETHEREUM_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...ETHEREUM_SEED_RECOVERY_ADAPTER,
  detectWatchOnly: ETHEREUM_WATCH_ONLY_RECOVERY_ADAPTER.detectWatchOnly!,
  scanWatchOnly: ETHEREUM_WATCH_ONLY_RECOVERY_ADAPTER.scanWatchOnly!,
};
