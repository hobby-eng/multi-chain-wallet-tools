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
    for (const [historyLimit, fault] of [[150, 'none'], [200, 'none'], [150, 'short'], [150, 'changed'], [150, 'overlap'], [150, 'empty-unknown']] as const) {
      if (kind !== 'identity' && (fault === 'overlap' || fault === 'empty-unknown')) continue;
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
            value = { resultSet: fault === 'empty-unknown' || (page === 2 && fault === 'short') ? [] : rows.slice((page - 1) * limit - (page === 2 && fault === 'overlap' ? 1 : 0), fault === 'overlap' && page === 2 ? 149 : page * limit), pagination: { total: fault === 'empty-unknown' ? null : rows.length + (page === 2 && fault === 'changed' ? 1 : 0) } };
          } else if (url.search) value = { resultSet: [], pagination: { total: 0 } };
          else if (kind === 'core') value = { address: core, txCount: 150, balance: '0', received: '0', sent: '0' };
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
          await expect(queryIds()).rejects.toThrow(fault === 'short' || fault === 'empty-unknown' ? /ended before/u : fault === 'overlap' ? /repeated/u : /changed during/u);
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


describe('Audit regressions: complete Dash explorer pages', () => {
  it('accepts a pending-only DashScan page whose total includes the pending row', async () => {
    const pendingHash = hash(999);
    const fetcher = async (input: string): Promise<Response> => {
      const url = new URL(input);
      let value: unknown;
      if (url.pathname.endsWith('/status')) value = { status: 'ok' };
      else if (url.pathname.endsWith('/blocks')) value = { resultSet: [{ height: 100, timestamp }] };
      else if (url.pathname.endsWith('/transactions')) value = {
        resultSet: [{
          hash: pendingHash,
          timestamp: null,
          type: 'CLASSIC',
          blockHeight: null,
          blockHash: null,
          confirmations: 0,
          vIn: [],
          vOut: [],
        }],
        pagination: { total: 1 },
      };
      else value = { address: core, txCount: 0, balance: '0', received: '0', sent: '0' };
      return new Response(JSON.stringify(value));
    };
    const result = await queryCoreAddress(core, 'mainnet', 20, undefined, fetcher);
    expect(result.transactionCount).toBe(0);
    expect(result.transactions.map(({ txid }) => txid)).toEqual([pendingHash]);
  });

  it.each(['resource', 'missing-total', 'oversized', 'malformed-tail', 'pending'])('%s response boundary', async fault => {
    const calls: number[] = [];
    const fetcher = async (input: string): Promise<Response> => {
      const url = new URL(input); let value: unknown;
      if (url.pathname.endsWith('/status')) value = { status: 'ok' };
      else if (url.pathname.endsWith('/blocks')) value = { resultSet: [{ height: 100, timestamp }] };
      else if (url.pathname.endsWith('/transactions')) {
        const page = Number(url.searchParams.get('page')); const limit = Number(url.searchParams.get('limit')); calls.push(limit);
        const rows = Array.from({ length: 150 }, (_, i) => ({ hash: hash(i), timestamp, type: 'CLASSIC', blockHeight: 100, blockHash: hash(888), confirmations: 1, vIn: [], vOut: [] }));
        const items: unknown[] = rows.slice((page - 1) * limit, page * limit);
        if (fault === 'oversized') items.push(rows[0]);
        if (fault === 'malformed-tail') items[items.length - 1] = { hash: 'invalid' };
        if (fault === 'pending' && page === 1) items.unshift({ ...rows[0], hash: hash(999), timestamp: null, blockHash: null, blockHeight: null, confirmations: 0 });
        value = { resultSet: items, pagination: fault === 'missing-total' ? {} : { total: 150 } };
      } else value = { address: fault === 'resource' ? 'wrong-address' : core, txCount: 150, balance: '0', received: '0', sent: '0' };
      return new Response(JSON.stringify(value));
    };
    if (fault !== 'pending') { await expect(queryCoreAddress(core, 'mainnet', 120, undefined, fetcher)).rejects.toThrow(); return; }
    const result = await queryCoreAddress(core, 'mainnet', 200, undefined, fetcher);
    expect(result.transactions.map(row => row.txid)).toEqual([hash(999), ...Array.from({ length: 150 }, (_, i) => hash(i))]);
    expect(calls).toEqual([100, 100]);
  });
});
