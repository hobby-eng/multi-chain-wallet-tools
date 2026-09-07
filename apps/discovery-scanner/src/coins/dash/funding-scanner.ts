import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { scanDashTransparentFamily } from './transparent-family-scanner.js';

export function scanDashIdentityFunding(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  return scanDashTransparentFamily(inputId, seed, config, gateway, signal, {
    id: 'identityFunding',
    title: 'Dash Platform identity funding',
    familyLabel: 'Identity funding',
    description: 'Scans Core P2PKH asset-lock funding chains for identity registration, bound and unbound top-ups, invitations, Platform address top-ups, and shielded-address top-ups.',
    proofLabel: 'current identity funding P2PKH scan',
    branches: [
      { key: 'registration', label: 'Registration funding', count: config.identityFundingCount, pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/1'` },
      { key: 'topup-unbound', label: 'Unbound identity top-up funding', count: config.identityFundingCount, pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/2'` },
      ...Array.from({ length: config.identityTopUpIdentityCount }, (_, registrationIndex) => ({
        key: `topup-identity-${registrationIndex}`,
        label: `Identity #${registrationIndex} top-up funding`,
        count: config.identityTopUpCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/2'/${registrationIndex}'`,
      })),
      { key: 'invitation', label: 'Invitation funding', count: config.identityFundingCount, hardenedIndex: true, pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/3'` },
      { key: 'address-topup', label: 'Platform address top-up funding', count: config.identityFundingCount, hardenedIndex: true, pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/4'` },
      { key: 'shielded-topup', label: 'Shielded address top-up funding', count: config.identityFundingCount, hardenedIndex: true, pathPrefix: (coinType: number) => `m/9'/${coinType}'/5'/5'` },
    ].filter(({ count }) => count > 0),
  }, onProgress, onFinding);
}

export function scanDashProviderCollateral(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  return scanDashTransparentFamily(inputId, seed, config, gateway, signal, {
    id: 'providerCollateral',
    title: 'Dash provider collateral/holdings',
    familyLabel: 'Provider collateral/holdings',
    description: 'Scans the masternode collateral holding P2PKH path m/9\'/coin_type\'/3\'/0\'/i (DashSync "provider funds", dashj MASTERNODE_HOLDINGS), which receives the 1000 DASH ProRegTx collateral output only for masternodes registered through DashSync-based software. Provider owner/voting/operator/platform-node auth keys are credentials and are not balance paths.',
    proofLabel: 'provider collateral/holdings P2PKH scan',
    branches: [
      { key: 'holdings', label: 'Provider holdings', count: config.providerCollateralCount, pathPrefix: (coinType: number) => `m/9'/${coinType}'/3'/0'` },
    ].filter(({ count }) => count > 0),
  }, onProgress, onFinding);
}
