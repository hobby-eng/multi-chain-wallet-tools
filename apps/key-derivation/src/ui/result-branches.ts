import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { selectAll } from './selection.js';

export type ResultBranch = 'receive' | 'change';

export interface ResultBranchPlan {
  kind: ResultBranch;
  branch: number;
}

export interface BranchResultState {
  result: DerivationResult;
  selected: Set<number>;
  windowStart: number;
}

/** Protocol-neutral branch plan driven only by adapter metadata. */
export function planResultBranches(
  adapter: CoinAdapter,
  selectedBranch: number,
  includeChange: boolean,
): ResultBranchPlan[] {
  if (!includeChange || adapter.addressBranches === undefined) {
    return [{ kind: 'receive', branch: selectedBranch }];
  }
  return [
    { kind: 'receive', branch: adapter.addressBranches.receive },
    { kind: 'change', branch: adapter.addressBranches.change },
  ];
}

/** Each branch receives fresh mutable UI state even when its row indices overlap. */
export function createBranchResultState(result: DerivationResult): BranchResultState {
  return {
    result,
    selected: selectAll(result.rows.map((row) => row.index)),
    windowStart: 0,
  };
}
