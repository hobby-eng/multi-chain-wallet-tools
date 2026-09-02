import { describe, expect, it, vi } from 'vitest';
import { queryPlatformAddressHistory } from '../src/platform-address-history.js';

const PLATFORM_ADDRESS = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs';

describe('Dash Platform Explorer address history', () => {
  it('requires a synchronized index and parses exact-credit totals and transitions', async () => {
    const fetcher = vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith('/status')) {
        body = {
          network: 'evo1',
          indexer: { status: 'synced', syncProgress: 100 },
          api: { block: { height: 426_096, timestamp: '2026-09-01T20:03:54.205Z' } },
        };
      } else if (url.endsWith('/info')) {
        body = {
          base58Address: 'Xexample',
          bech32mAddress: PLATFORM_ADDRESS,
          totalTxs: 1,
          incomingTxs: 1,
          outgoingTxs: 0,
          nonce: 0,
          balance: '800',
          totalIncomingAmount: '1000',
          totalOutgoingAmount: null,
        };
      } else {
        body = {
          resultSet: [{
            hash: 'AB'.repeat(32),
            blockHash: 'CD'.repeat(32),
            blockHeight: 426_000,
            type: 'ADDRESS_FUNDING_FROM_ASSET_LOCK',
            batchType: null,
            timestamp: '2026-09-01T19:03:54.205Z',
            gasUsed: 15_000,
            status: 'SUCCESS',
            error: null,
            incoming: true,
          }],
          pagination: { page: 1, limit: 1, total: 1 },
        };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const snapshot = await queryPlatformAddressHistory(PLATFORM_ADDRESS, 'mainnet', 20, undefined, fetcher);
    expect(snapshot.provider).toBe('Dash Platform Explorer');
    expect(snapshot.indexStatus).toBe('synced');
    expect(snapshot.indexedHeight).toBe(426_096);
    expect(snapshot.totalIncomingCredits).toBe(1_000n);
    expect(snapshot.totalOutgoingCredits).toBe(0n);
    expect(snapshot.explorerBalanceCredits).toBe(800n);
    expect(snapshot.requests).toBe(3);
    expect(snapshot.transitions).toHaveLength(1);
    expect(snapshot.transitions[0]).toMatchObject({
      incoming: true,
      type: 'ADDRESS_FUNDING_FROM_ASSET_LOCK',
      status: 'SUCCESS',
      gasUsed: 15_000n,
    });
  });

  it('fails closed when Platform Explorer reports a lagging index', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      network: 'evo1',
      indexer: { status: 'syncing' },
      api: { block: { height: 1, timestamp: '2026-09-01T00:00:00.000Z' } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, 'mainnet', 20, undefined, fetcher),
    ).rejects.toThrow(/not synchronized/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
