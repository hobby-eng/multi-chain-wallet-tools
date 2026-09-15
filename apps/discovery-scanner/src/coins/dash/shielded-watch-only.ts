import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { assertCanonicalViewingKey } from '@ckd/dash-network/orchard-scanner.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { RecoveryFinding, RecoveryNetwork, RecoveryProgress, RecoverySection } from '../../types.js';
import { sectionFromLedger } from './shielded-section.js';
import { streamShieldedPool } from './shielded-stream.js';

/**
 * Scans a pasted FVK/IVK/OVK without importing mnemonic or seed derivation.
 * Only public encrypted pages cross the gateway; the viewing key remains local.
 */
export async function scanDashShieldedWatchOnly(
  inputId: string,
  viewingKey: NormalizedViewingKey,
  network: RecoveryNetwork,
  includeUsedZeroBalance: boolean,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  assertCanonicalViewingKey(viewingKey);
  const ledger = new ShieldedActivityLedger(viewingKey.kind);
  onProgress({
    inputId,
    section: 'shielded',
    message: 'Streaming proof-verified Orchard pages through bounded memory',
    completed: 0,
    total: null,
  });
  const outcome = await streamShieldedPool([{ inputId, viewingKey, ledger }], network, gateway, signal, onProgress);
  return sectionFromLedger(
    ledger,
    { includeUsedZeroBalance, accountPathLabel: 'Pasted watch-only Orchard viewing key (no BIP32 account path)' },
    outcome,
    false,
    onFinding,
  );
}
