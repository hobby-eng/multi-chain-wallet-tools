import type { RecoveryCoinAdapter } from '../../types.js';
import { BITCOIN_SEED_RECOVERY_ADAPTER } from './seed.js';
import { BITCOIN_WATCH_ONLY_RECOVERY_ADAPTER } from './watch-adapter.js';

export const BITCOIN_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...BITCOIN_SEED_RECOVERY_ADAPTER,
  detectWatchOnly: BITCOIN_WATCH_ONLY_RECOVERY_ADAPTER.detectWatchOnly!,
  scanWatchOnly: BITCOIN_WATCH_ONLY_RECOVERY_ADAPTER.scanWatchOnly!,
};
