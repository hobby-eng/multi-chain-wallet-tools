import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import type { DerivationControlValues } from './inputs.js';
import type { ResultBranch, ResultBranchPlan } from './result-branches.js';
import { clearDerivationResult } from './secrets.js';
import type { DerivationWorkerClient } from '../workers/derive-client.js';

interface StreamedDerivationOptions {
  worker: DerivationWorkerClient;
  adapter: CoinAdapter;
  input: DerivationControlValues;
  branches: readonly ResultBranchPlan[];
  seed: Uint8Array;
  isStale: () => boolean;
  isCancelled: () => boolean;
  onInitialBatch: (branch: ResultBranch, result: DerivationResult) => void;
  onAppendedBatch: (branch: ResultBranch, rows: DerivationResult['rows']) => void;
  onProgress: (branch: ResultBranch, branchCount: number, totalCount: number) => void;
  yieldTurn: () => Promise<void>;
}

interface StreamedDerivationOutcome {
  generated: number;
  stale: boolean;
  cancelled: boolean;
}

/**
 * Runs bounded worker batches and owns the append/cleanup invariants. UI state
 * stays outside this module and is updated only through explicit callbacks.
 */
export async function runStreamedDerivation(options: StreamedDerivationOptions): Promise<StreamedDerivationOutcome> {
  const { worker, adapter, input, branches, seed } = options;
  const batchSize = adapter.batchSize ?? 50;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error(`Adapter ${adapter.id} declares an invalid internal batch size.`);
  }
  const baseInput = {
    network: input.network,
    account: input.account,
    branch: input.branch,
    start: input.start,
    count: input.count,
  };
  let generatedTotal = 0;
  for (const { kind, branch, workerAdapterId } of branches) {
    let destination: DerivationResult | null = null;
    let generated = 0;
    while (generated < input.count) {
      if (options.isStale()) return { generated: generatedTotal, stale: true, cancelled: false };
      if (options.isCancelled()) return { generated: generatedTotal, stale: false, cancelled: true };
      const count = Math.min(batchSize, input.count - generated);
      const batch = await worker.derive(workerAdapterId ?? adapter.id, {
        ...baseInput,
        branch,
        seed,
        start: input.start + generated,
        count,
      });
      if (options.isStale()) {
        clearDerivationResult(batch);
        return { generated: generatedTotal, stale: true, cancelled: false };
      }
      if (destination === null) {
        destination = batch;
        options.onInitialBatch(kind, destination);
      } else {
        if (batch.id !== destination.id || batch.rows.length !== count) {
          clearDerivationResult(batch);
          throw new Error('The derivation adapter returned an inconsistent streamed batch.');
        }
        const appended = batch.rows.splice(0);
        destination.rows.push(...appended);
        options.onAppendedBatch(kind, appended);
        clearDerivationResult(batch);
      }
      generated += count;
      generatedTotal += count;
      options.onProgress(kind, generated, generatedTotal);
      if (generated < input.count) await options.yieldTurn();
    }
  }
  return { generated: generatedTotal, stale: false, cancelled: false };
}
