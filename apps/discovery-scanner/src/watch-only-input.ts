import { parseInteger } from '@ckd/core/validation.js';
import type { RecoveryCoinRegistry } from './coins/registry.js';
import type { RecoveryInputSnapshot } from './view.js';
import type { RecoveryCoinAdapter, RecoveryWatchOnlyInput, RecoveryWatchOnlyScanConfig } from './types.js';

export interface WatchOnlyTarget {
  input: RecoveryWatchOnlyInput;
  adapter: RecoveryCoinAdapter;
  network?: 'mainnet' | 'testnet';
  ambiguous: boolean;
}

interface WatchOnlyInputDependencies {
  assertWatchOnlyBatchInput?: typeof import('@ckd/recovery/watch-only.js').assertWatchOnlyBatchInput;
  assertWatchOnlyMinimum?: typeof import('@ckd/recovery/watch-only.js').assertWatchOnlyMinimum;
  parseWatchOnlyLines?: typeof import('@ckd/recovery/watch-only.js').parseWatchOnlyLines;
  resolveWatchOnlyTargets?: typeof import('@ckd/recovery/watch-only.js').resolveWatchOnlyTargets;
  getRecoveryCoin: RecoveryCoinRegistry['getRecoveryCoin'];
  listRecoveryCoins: RecoveryCoinRegistry['listRecoveryCoins'];
}

export function watchOnlyScanConfig(
  snapshot: RecoveryInputSnapshot,
  dependencies: WatchOnlyInputDependencies,
): RecoveryWatchOnlyScanConfig {
  const minimumCount = parseInteger(snapshot.watchOnlyMinimumCount, 'Watch-only address minimum', 1);
  if (dependencies.assertWatchOnlyMinimum === undefined)
    throw new Error('Watch-only discovery is not included in this build.');
  dependencies.assertWatchOnlyMinimum(minimumCount);
  return {
    network: snapshot.network === 'testnet' ? 'testnet' : 'mainnet',
    minimumCount,
    includeUsedZeroBalance: snapshot.includeUsedZeroBalance,
  };
}

export function resolveWatchOnlyScanTargets(
  snapshot: RecoveryInputSnapshot,
  dependencies: WatchOnlyInputDependencies,
): WatchOnlyTarget[] {
  if (
    dependencies.assertWatchOnlyBatchInput === undefined ||
    dependencies.parseWatchOnlyLines === undefined ||
    dependencies.resolveWatchOnlyTargets === undefined
  )
    throw new Error('Watch-only discovery is not included in this build.');
  const assertBatch = dependencies.assertWatchOnlyBatchInput;
  const parseLines = dependencies.parseWatchOnlyLines;
  const resolveTargets = dependencies.resolveWatchOnlyTargets;
  assertBatch(snapshot.watchOnlyKeys);
  const lines = parseLines(snapshot.watchOnlyKeys);
  if (lines.length === 0)
    throw new Error(
      'Enter at least one public key, extended public key, descriptor, Identity value, or Orchard viewing key.',
    );
  const adapters =
    snapshot.coinId === 'auto' ? dependencies.listRecoveryCoins() : [dependencies.getRecoveryCoin(snapshot.coinId)];
  return lines.flatMap((line, index) => {
    const resolved = resolveTargets(line, adapters);
    if (snapshot.coinId === 'auto' && resolved.some(({ ambiguity }) => ambiguity !== undefined)) {
      const labels = [
        ...new Set(
          resolved.map(
            ({ material, adapterId }) => material.detectionLabel ?? dependencies.getRecoveryCoin(adapterId).label,
          ),
        ),
      ];
      throw new Error(
        `This public key does not identify one coin. Select Coin before scanning. A Dash xpub may also require an explicit Core, CoinJoin, or Platform prefix. Compatible candidates: ${labels.join(' · ')}.`,
      );
    }
    return resolved.map((target) => {
      const adapter = dependencies.getRecoveryCoin(target.adapterId);
      const number = index + 1;
      return {
        adapter,
        ...(target.network === undefined ? {} : { network: target.network }),
        ambiguous: resolved.length > 1,
        input: {
          id: `watch-${number}-${adapter.id}`,
          label: `Public key #${number} · ${target.material.detectionLabel ?? adapter.label}${resolved.length > 1 ? ' · candidate' : ''}`,
          ...target.material,
        },
      };
    });
  });
}

export function wipeWatchOnlyTargets(targets: readonly WatchOnlyTarget[]): void {
  for (const { input } of targets) input.value = '';
}
