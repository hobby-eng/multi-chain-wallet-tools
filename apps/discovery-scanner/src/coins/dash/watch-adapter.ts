import type { RecoveryCoinAdapter } from '../../types.js';
import { getDashHistory, dashAmountUnit } from './history.js';
import { scanDashWatchOnly } from './watch-only.js';
import { detectDashWatchOnly } from '@ckd/recovery/watch-only/dash.js';

export const DASH_WATCH_ONLY_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'dash',
  getHistory: getDashHistory,
  amountUnit: dashAmountUnit,
  label: 'Dash',
  networks: ['mainnet', 'testnet'],
  customPath: {
    description: 'Optional; standard Dash recovery stays enabled.',
    placeholder: "m/44'/5'/0'/0/{index}",
    defaultTemplate: (network) => `m/44'/${network === 'mainnet' ? 5 : 1}'/0'/0/{index}`,
    formats: [{ id: 'p2pkh', label: 'Dash Core · P2PKH' }],
  },
  scan: async () => Promise.reject(new Error('Seed discovery is not included in this build.')),
  detectWatchOnly: detectDashWatchOnly,
  scanWatchOnly: scanDashWatchOnly,
};
