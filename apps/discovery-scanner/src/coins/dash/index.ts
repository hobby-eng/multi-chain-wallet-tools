import type { RecoveryCoinAdapter } from '../../types.js';
import { DASH_SEED_RECOVERY_ADAPTER } from './seed.js';
import { DASH_WATCH_ONLY_RECOVERY_ADAPTER } from './watch-adapter.js';

export const DASH_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...DASH_SEED_RECOVERY_ADAPTER,
  detectWatchOnly: DASH_WATCH_ONLY_RECOVERY_ADAPTER.detectWatchOnly!,
  scanWatchOnly: DASH_WATCH_ONLY_RECOVERY_ADAPTER.scanWatchOnly!,
};

export type { RecoverySeedInput, RecoveryScanConfig } from '../../types.js';
