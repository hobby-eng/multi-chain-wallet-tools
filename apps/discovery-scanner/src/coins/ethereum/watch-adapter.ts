import type { RecoveryCoinAdapter } from '../../types.js';
import { getEthereumHistory } from './history.js';
import { detectEthereumWatchOnly, scanEthereumWatchOnly } from './watch-only.js';

export const ETHEREUM_WATCH_ONLY_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'ethereum',
  amountUnit: () => ({ asset: 'ETH', atomicUnit: 'wei', decimals: 18 }),
  getHistory: getEthereumHistory,
  label: 'Ethereum',
  networks: ['mainnet', 'testnet'],
  customPath: {
    description: 'Optional; three standard profiles stay enabled.',
    placeholder: "m/44'/60'/0'/0/{index}",
    defaultTemplate: () => "m/44'/60'/0'/0/{index}",
    formats: [{ id: 'eoa', label: 'Ethereum EOA · EIP-55' }],
  },
  scan: async () => Promise.reject(new Error('Seed discovery is not included in this build.')),
  detectWatchOnly: detectEthereumWatchOnly,
  scanWatchOnly: scanEthereumWatchOnly,
};
