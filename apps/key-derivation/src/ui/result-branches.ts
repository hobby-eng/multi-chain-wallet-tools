import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { selectAll } from './selection.js';

export type ResultBranch = 'receive' | 'change' | 'coinjoin-external' | 'coinjoin-internal';

/** Top-level result tab a branch belongs to. CoinJoin's two branches share one tab. */
export type ResultBranchGroup = 'receive' | 'change' | 'coinjoin';

export interface ResultBranchPlan {
  kind: ResultBranch;
  branch: number;
  /**
   * Worker-dispatch adapter id for this branch, when it differs from the
   * selected coin adapter. The DIP9 CoinJoin chain reuses Dash Core's
   * network/account controls but derives from a separate path template, so
   * it is routed to a distinct runtime derive() function.
   */
  workerAdapterId?: string;
}

export interface BranchResultState {
  result: DerivationResult;
  selected: Set<number>;
  windowStart: number;
}

export function resultBranchGroup(branch: ResultBranch): ResultBranchGroup {
  return branch === 'coinjoin-external' || branch === 'coinjoin-internal' ? 'coinjoin' : branch;
}

export function isCoinJoinResultBranch(branch: ResultBranch): boolean {
  return resultBranchGroup(branch) === 'coinjoin';
}

/** Protocol-neutral branch plan driven only by adapter metadata. */
export function planResultBranches(
  adapter: CoinAdapter,
  selectedBranch: number,
  includeChange: boolean,
  includeCoinJoin = false,
): ResultBranchPlan[] {
  const plans: ResultBranchPlan[] = includeChange && adapter.addressBranches !== undefined
    ? [
        { kind: 'receive', branch: adapter.addressBranches.receive },
        { kind: 'change', branch: adapter.addressBranches.change },
      ]
    : [{ kind: 'receive', branch: selectedBranch }];
  if (includeCoinJoin && adapter.coinJoin !== undefined) {
    const { branches, workerAdapterId } = adapter.coinJoin;
    plans.push(
      { kind: 'coinjoin-external', branch: branches.external, workerAdapterId },
      { kind: 'coinjoin-internal', branch: branches.internal, workerAdapterId },
    );
  }
  return plans;
}

/** Each branch receives fresh mutable UI state even when its row indices overlap. */
export function createBranchResultState(result: DerivationResult): BranchResultState {
  return {
    result,
    selected: selectAll(result.rows.map((row) => row.index)),
    windowStart: 0,
  };
}

