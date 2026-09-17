import { describe, expect, it } from 'vitest';
import { createPublicActivityExport, publicActivityRows } from '../src/export-public.js';

const state = {
  coin: 'future-coin',
  asset: 'UNIT',
  decimals: 8,
  network: 'mainnet' as const,
  mode: 'batch' as const,
  results: [
    {
      coin: 'future-coin',
      address: '=unsafe',
      balanceAtomic: 42n,
      nonce: null,
      blockHeight: 100n,
      history: {
        asset: 'UNIT',
        atomicUnit: 'unit',
        decimals: 8,
        scope: 'lifetime',
        firstReceived: null,
        lastReceived: null,
        firstSpent: null,
        lastSpent: null,
        status: 'complete' as const,
        transactionCount: 2,
        pendingTransactionCount: 0,
        totalReceivedAtomic: '50',
        totalSentAtomic: '8',
        totalFeesAtomic: null,
        firstSeen: null,
        lastSeen: null,
        source: 'test',
        note: 'complete',
      },
    },
  ],
};

describe('public activity export', () => {
  it('exports any adapter coin using the shared schema', async () => {
    expect(publicActivityRows(state)[1]?.slice(0, 3)).toEqual(['future-coin', 'mainnet', '=unsafe']);
    const file = await createPublicActivityExport(state, 'csv', new Date('2026-01-02T03:04:05Z'));
    expect(file.filename).toBe('wallet-activity-future-coin-batch-20260102T030405Z.csv');
    const text = await file.blob.text();
    expect(text).toContain("' =unsafe".replace(' ', ''));
    expect(text).toContain('42');
  });
});
