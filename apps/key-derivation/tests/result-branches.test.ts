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
    expect(planResultBranches(getCoinAdapter('dash-legacy-mobile'), 0, true)).toEqual([
      { kind: 'receive', branch: 0 },
      { kind: 'change', branch: 1 },
    ]);
  });

  it('preserves explicitly selected branches for callers without the extra change output', () => {
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

it('plans Platform receive and internal/change with hardened paths on both networks', () => {
  const adapter = getCoinAdapter('dash-platform');
  for (const network of ['mainnet', 'testnet'] as const) {
    const paths = planResultBranches(adapter, 0, true).map(plan => adapter.pathPreview({ network, account: 2, branch: plan.branch, start: 0, count: 1 }));
    const coin = network === 'mainnet' ? 5 : 1;
    expect(paths).toEqual([`m/9'/${coin}'/17'/2'/0'/0`, `m/9'/${coin}'/17'/2'/1'/0`]);
  }
});
