import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { scanDashTransparentFamily } from './transparent-family-scanner.js';

export function scanDashLegacyCore(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  return scanDashTransparentFamily(inputId, seed, config, gateway, signal, {
    id: 'legacyCore',
    title: 'Dash Core · legacy mobile',
    familyLabel: 'Legacy mobile Core',
    description: "Scans the historical DashSync legacy account root m/0' receive/change chains. Non-HD random keypool wallets still require wallet.dat or exported private keys.",
    proofLabel: 'historical DashSync legacy P2PKH scan',
    branches: [
      { key: 'receive', label: 'Legacy receive', count: config.legacyCoreCount, pathPrefix: () => "m/0'/0" },
      { key: 'change', label: 'Legacy change', count: config.legacyCoreCount, pathPrefix: () => "m/0'/1" },
    ].filter(({ count }) => count > 0),
  }, onProgress, onFinding);
}
