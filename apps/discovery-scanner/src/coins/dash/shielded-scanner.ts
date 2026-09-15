import { deriveDashShielded } from '@ckd/coins/dash/shielded.js';
import { assertValidMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import type { ResultField } from '@ckd/core/types.js';
import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { assertCanonicalViewingKey } from '@ckd/dash-network/orchard-scanner.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { SecretEgressGuard, disposeSecretBytes } from '@ckd/secret-boundary/secret-guard.js';
import type {
  RecoveryFinding,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoverySection,
  RecoverySeedInput,
} from '../../types.js';
import { sectionFromLedger } from './shielded-section.js';
import { streamShieldedPool, type ShieldedParticipant } from './shielded-stream.js';

function findField(fields: ResultField[], id: string): string {
  const field = fields.find((candidate) => candidate.key === id);
  if (field === undefined) throw new Error(`Dash Orchard derivation did not return ${id}.`);
  return field.value;
}

function deriveViewingKey(
  seed: Uint8Array,
  config: RecoveryScanConfig,
  guard: SecretEgressGuard,
  sessionSecretGuard?: SecretEgressGuard,
): NormalizedViewingKey {
  const shieldedSeed = seed.slice();
  const derived = deriveDashShielded({
    seed: shieldedSeed,
    network: config.network,
    account: config.account,
    start: 0,
    count: 1,
  });
  try {
    const fullViewingKey = findField(derived.summary, 'fullViewingKey');
    guard.registerString('Orchard Full Viewing Key', fullViewingKey);
    if (sessionSecretGuard !== undefined) {
      const fields = [
        ...derived.basicSummary,
        ...derived.summary,
        ...derived.rows.flatMap((row) => [...row.basic, ...row.advanced]),
      ];
      for (const field of fields) {
        if (field.secret) sessionSecretGuard.registerString(field.label, field.value);
      }
    }
    const viewingKey: NormalizedViewingKey = { kind: 'full', hex: fullViewingKey };
    assertCanonicalViewingKey(viewingKey);
    return viewingKey;
  } finally {
    shieldedSeed.fill(0);
    clearDerivationResult(derived);
  }
}

function skippedSection(): RecoverySection {
  return {
    id: 'shielded',
    title: 'Dash Orchard · shielded pool',
    description: 'Account-wide Orchard recovery was disabled in the scan settings.',
    state: 'skipped',
    metrics: [{ label: 'Status', value: 'Skipped' }],
    findings: [],
    scanned: 0n,
    source: 'Not connected',
    proof: 'Not requested',
  };
}

export async function scanDashShielded(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
  sessionSecretGuard?: SecretEgressGuard,
): Promise<RecoverySection> {
  if (!config.scanShieldedPool) return skippedSection();
  const viewingKey = deriveViewingKey(seed, config, gateway.guard, sessionSecretGuard);
  const ledger = new ShieldedActivityLedger('full');
  try {
    onProgress({
      inputId,
      section: 'shielded',
      message: 'Streaming proof-verified Orchard pages through bounded memory',
      completed: 0,
      total: null,
    });
    const outcome = await streamShieldedPool(
      [{ inputId, viewingKey, ledger }],
      config.network,
      gateway,
      signal,
      onProgress,
    );
    return sectionFromLedger(
      ledger,
      {
        includeUsedZeroBalance: config.includeUsedZeroBalance,
        accountPathLabel: `m/32'/${config.network === 'mainnet' ? 5 : 1}'/${config.account}'`,
      },
      outcome,
      false,
      onFinding,
    );
  } finally {
    viewingKey.hex = '';
  }
}

/**
 * Downloads each public Orchard page once, applies it to every locally derived
 * FVK, wipes the page, and only then requests the next page. Memory therefore
 * grows with matches, not with the total shielded pool size.
 */
export async function scanDashShieldedBatch(
  inputs: readonly RecoverySeedInput[],
  config: RecoveryScanConfig,
  context: Omit<RecoveryScanContext, 'preparedSections'>,
): Promise<ReadonlyMap<string, RecoverySection>> {
  if (!config.scanShieldedPool) return new Map(inputs.map((input) => [input.id, skippedSection()]));
  const guard = new SecretEgressGuard();
  const gateway = new RecoveryNetworkGateway(
    guard,
    context.networkApi,
    context.networkLimiter ?? new RecoveryConcurrencyLimiter(5),
  );
  const participants: ShieldedParticipant[] = [];
  try {
    // This preparation intentionally contains no await: every phrase is
    // consumed before per-wallet orchestration is allowed to clear its input.
    for (const input of inputs) {
      const mnemonic = assertValidMnemonic(input.mnemonic);
      const seed = mnemonicToSeed(mnemonic, input.passphrase);
      try {
        guard.registerString('BIP39 mnemonic', mnemonic);
        guard.registerString('BIP39 passphrase', input.passphrase);
        guard.registerBytes('BIP39 seed', seed);
        context.sessionSecretGuard?.registerString('BIP39 mnemonic', mnemonic);
        context.sessionSecretGuard?.registerString('BIP39 passphrase', input.passphrase);
        context.sessionSecretGuard?.registerBytes('BIP39 seed', seed);
        participants.push({
          inputId: input.id,
          viewingKey: deriveViewingKey(seed, config, guard, context.sessionSecretGuard),
          ledger: new ShieldedActivityLedger('full'),
        });
      } finally {
        disposeSecretBytes(seed);
      }
    }
    for (const participant of participants) {
      context.onProgress({
        inputId: participant.inputId,
        section: 'shielded',
        message: 'Waiting for the shared one-pass Orchard page stream',
        completed: 0,
        total: null,
      });
    }
    const outcome = await streamShieldedPool(participants, config.network, gateway, context.signal, context.onProgress);
    const results = new Map<string, RecoverySection>();
    for (const participant of participants) {
      results.set(
        participant.inputId,
        sectionFromLedger(
          participant.ledger,
          {
            includeUsedZeroBalance: config.includeUsedZeroBalance,
            accountPathLabel: `m/32'/${config.network === 'mainnet' ? 5 : 1}'/${config.account}'`,
          },
          outcome,
          true,
          (finding) => context.onFinding(participant.inputId, 'shielded', finding),
        ),
      );
    }
    return results;
  } finally {
    for (const participant of participants) participant.viewingKey.hex = '';
    guard.clear();
  }
}
