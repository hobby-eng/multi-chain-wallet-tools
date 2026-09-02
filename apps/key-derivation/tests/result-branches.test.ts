import { describe, expect, it } from 'vitest';
import { getCoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { createBranchResultState, planResultBranches } from '../src/ui/result-branches.js';

function result(id: string): DerivationResult {
  return {
    id,
    title: id,
    networkLabel: 'test',
    pathTemplate: 'm/i',
    basicSummary: [],
    summary: [],
    rows: [{ index: 0, path: 'm/0', title: '0', basic: [], advanced: [] }],
    notices: [],
  };
}

describe('receive/change result planning', () => {
  it('uses adapter metadata for Bitcoin and Dash Core without coin-specific UI branches', () => {
    expect(planResultBranches(getCoinAdapter('bitcoin-taproot'), 0, true)).toEqual([
      { kind: 'receive', branch: 0 },
      { kind: 'change', branch: 1 },
    ]);
    expect(planResultBranches(getCoinAdapter('dash-core'), 0, true)).toEqual([
      { kind: 'receive', branch: 0 },
      { kind: 'change', branch: 1 },
    ]);
  });

  it('preserves a selected custom/key-class branch when change semantics do not apply', () => {
    expect(planResultBranches(getCoinAdapter('ethereum'), 1, true)).toEqual([
      { kind: 'receive', branch: 1 },
    ]);
    expect(planResultBranches(getCoinAdapter('dash-platform'), 7, false)).toEqual([
      { kind: 'receive', branch: 7 },
    ]);
  });

  it('creates independent selection and paging state for overlapping row indices', () => {
    const receive = createBranchResultState(result('receive'));
    const change = createBranchResultState(result('change'));
    receive.selected.delete(0);
    receive.windowStart = 200;

    expect(change.selected.has(0)).toBe(true);
    expect(change.windowStart).toBe(0);
    expect(receive.selected).not.toBe(change.selected);
  });
});
