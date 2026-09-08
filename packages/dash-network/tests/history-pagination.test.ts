import { describe, expect, it } from 'vitest';
import { queryCoreAddress } from '../src/public-address.js';
import { queryPlatformAddressHistory } from '../src/platform-address-history.js';
import { queryPlatformIdentityHistory } from '../src/platform-identity-history.js';

const core = 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5';
const platform = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs';
const identity = 'HhNWsiTQfpJwnqenTFVUG8JqNwAeccWmAYW2vjEvNNXY';
const timestamp = '2026-09-01T00:00:00.000Z';
const hash = (i: number): string => i.toString(16).padStart(64, '0');

describe('page-number explorer histories', () => {
  for (const kind of ['core', 'platform', 'identity'] as const) {
    for (const [historyLimit, fault] of [[150, 'none'], [200, 'none'], [150, 'short'], [150, 'changed']] as const) {
      it(`${kind}: ${historyLimit}-row display limit, ${fault} page`, async () => {
        const limits: number[] = [];
        const fetcher = async (input: string): Promise<Response> => {
          const url = new URL(input);
          let value: unknown;
          if (url.pathname.endsWith('/status')) value = kind === 'core' ? { status: 'ok' } : {
            network: 'evo1', indexer: { status: 'synced' }, api: { block: { height: 100, timestamp } },
          };
          else if (url.pathname.endsWith('/blocks')) value = { resultSet: [{ height: 100, timestamp }] };
          else if (url.pathname.endsWith('/transactions')) {
            const limit = Number(url.searchParams.get('limit'));
            const page = Number(url.searchParams.get('page'));
            limits.push(limit);
            // Model the provider offset contract, independently of the client loop.
            const rows = Array.from({ length: 150 }, (_, i) => ({
              hash: hash(i), type: 'CLASSIC', timestamp, vIn: [], vOut: [],
            }));
            value = { resultSet: page === 2 && fault === 'short' ? [] : rows.slice((page - 1) * limit, page * limit), pagination: { total: rows.length + (page === 2 && fault === 'changed' ? 1 : 0) } };
          } else if (url.search) value = { resultSet: [], pagination: { total: 0 } };
          else if (kind === 'core') value = { txCount: 150, balance: '0', received: '0', sent: '0' };
          else if (kind === 'platform') value = {
            totalTxs: 150, incomingTxs: 150, outgoingTxs: 0, nonce: 0,
            balance: '0', totalIncomingAmount: '0', totalOutgoingAmount: '0',
          };
          else value = { identifier: identity, totalTxs: 150, revision: '1', balance: '0', totalTransfers: 0, totalDocuments: 0, totalDataContracts: 0 };
          return new Response(JSON.stringify(value));
        };
        const queryIds = async (): Promise<string[]> => kind === 'core'
          ? (await queryCoreAddress(core, 'mainnet', historyLimit, undefined, fetcher)).transactions.map(tx => tx.txid)
          : kind === 'platform'
            ? (await queryPlatformAddressHistory(platform, 'mainnet', historyLimit, undefined, fetcher)).transitions.map(tx => tx.hash)
            : (await queryPlatformIdentityHistory(identity, 'mainnet', historyLimit, undefined, fetcher)).activity.map(tx => tx.transactionHash);
        if (fault !== 'none') {
          await expect(queryIds()).rejects.toThrow(fault === 'short' ? /ended before/u : /changed during/u);
          return;
        }
        const ids = await queryIds();
        expect(ids).toHaveLength(150);
        expect(new Set(ids)).toEqual(new Set(Array.from({ length: 150 }, (_, i) => hash(i))));
        expect(limits).toEqual([100, 100]);
      });
    }
  }
});
