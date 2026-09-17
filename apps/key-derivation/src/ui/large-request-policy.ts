import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationControlValues } from './inputs.js';
import { planResultBranches } from './result-branches.js';

const LARGE_REQUEST_CONFIRM_THRESHOLD = 10_000;

interface LargeRequestPolicyOptions {
  adapter: () => CoinAdapter;
  activeFeatureTab: () => 'silent-payment' | 'bip85' | 'coinjoin' | null;
  showConfirmation: () => void;
  showStatus: (message: string) => void;
}

export function createLargeRequestPolicy(options: LargeRequestPolicyOptions) {
  let pendingFingerprint: string | null = null;

  const plannedBranches = (input: DerivationControlValues) => {
    const adapter = options.adapter();
    if (options.activeFeatureTab() === 'coinjoin' && adapter.coinJoin !== undefined) {
      return planResultBranches(adapter, input.branch, false, true).filter(
        ({ kind }) => kind === 'coinjoin-external' || kind === 'coinjoin-internal',
      );
    }
    return planResultBranches(adapter, input.branch, input.includeChange, false);
  };

  const fingerprint = (input: DerivationControlValues): string => {
    return [
      options.adapter().id,
      options.activeFeatureTab(),
      input.network,
      input.account,
      input.branch,
      input.start,
      input.count,
      input.includeChange,
      input.includeCoinJoin,
    ].join(':');
  };

  const approximateMemoryRange = (count: number): string => {
    const lowMiB = Math.ceil((count * 4) / 1024);
    const highMiB = Math.ceil((count * 12) / 1024);
    return `roughly ${lowMiB.toLocaleString()}–${highMiB.toLocaleString()} MiB of result memory`;
  };

  return {
    plannedBranches,
    clear(): void {
      pendingFingerprint = null;
    },
    authorize(input: DerivationControlValues, automatic: boolean): boolean {
      const branchCount = plannedBranches(input).length;
      const totalCount = input.count * branchCount;
      if (automatic && totalCount >= LARGE_REQUEST_CONFIRM_THRESHOLD) {
        pendingFingerprint = null;
        options.showStatus(
          `Automatic generation was skipped because this selection would derive ${totalCount.toLocaleString()} results. Click Derive manually, then confirm the large request.`,
        );
        return false;
      }
      if (totalCount < LARGE_REQUEST_CONFIRM_THRESHOLD) {
        pendingFingerprint = null;
        return true;
      }
      const requestFingerprint = fingerprint(input);
      if (pendingFingerprint === requestFingerprint) {
        pendingFingerprint = null;
        return true;
      }
      pendingFingerprint = requestFingerprint;
      const adapter = options.adapter();
      const batches = Math.ceil(input.count / (adapter.batchSize ?? 50)) * branchCount;
      options.showConfirmation();
      options.showStatus(
        `Large request confirmation: ${totalCount.toLocaleString()} results across ${branchCount} address branch${branchCount === 1 ? '' : 'es'} in ${batches.toLocaleString()} visible batches; ${approximateMemoryRange(totalCount)}. ` +
          'Keep the tab open and click “Confirm large request” to proceed. You can cancel at any time.',
      );
      return false;
    },
  };
}
