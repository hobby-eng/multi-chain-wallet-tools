import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { scanDashTransparentFamily } from './transparent-family-scanner.js';

export function scanDashCoinJoin(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  return scanDashTransparentFamily(inputId, seed, config, gateway, signal, {
    id: 'coinjoin',
    title: 'Dash CoinJoin · DIP9 mobile compatibility',
    familyLabel: 'CoinJoin / DIP9 mobile compatibility',
    description: 'Scans the released mobile/DashSync DIP9 CoinJoin compatibility chains. Dash Core desktop CoinJoin outputs remain covered by the always-on BIP44 receive/change scan.',
    proofLabel: 'DIP9 mobile compatibility P2PKH scan',
    branches: [
      {
        key: 'external',
        label: 'External mobile/DashSync',
        count: config.coinJoinExternalCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/4'/0'/0`,
      },
      {
        key: 'internal',
        label: 'Internal defensive compatibility',
        count: config.coinJoinInternalCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/4'/0'/1`,
      },
    ].filter(({ count }) => count > 0),
  }, onProgress, onFinding);
}
