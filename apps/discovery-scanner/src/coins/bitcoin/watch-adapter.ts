import type { RecoveryCoinAdapter } from '../../types.js';
import { getBitcoinHistory } from './history.js';
import { scanBitcoinWatchOnly } from './watch-only.js';
import { detectBitcoinWatchOnly } from '@ckd/recovery/watch-only/bitcoin.js';

export const BITCOIN_WATCH_ONLY_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'bitcoin',
  amountUnit: () => ({ asset: 'BTC', atomicUnit: 'satoshis', decimals: 8 }),
  getHistory: getBitcoinHistory,
  label: 'Bitcoin',
  networks: ['mainnet', 'testnet'],
  customPath: {
    description: 'Optional; four standard families stay enabled.',
    placeholder: "m/44'/0'/0'/0/{index}",
    defaultTemplate: (network) => `m/44'/${network === 'mainnet' ? 0 : 1}'/0'/0/{index}`,
    formats: [
      { id: 'legacy', label: 'Legacy · P2PKH' },
      { id: 'nested-segwit', label: 'Nested SegWit · P2SH-P2WPKH' },
      { id: 'native-segwit', label: 'Native SegWit · P2WPKH' },
      { id: 'taproot', label: 'Taproot · BIP86 P2TR' },
    ],
  },
  scan: async () => Promise.reject(new Error('Seed discovery is not included in this build.')),
  detectWatchOnly: detectBitcoinWatchOnly,
  scanWatchOnly: scanBitcoinWatchOnly,
};
