import { MultiChainRecoveryNetworkService } from '../src/network-service-multichain.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bitcoinAddressHistory, ethereumAddressHistory, HISTORY_MAX_PAGES } from '../src/address-history-service.js';
import { emptyHistory, enrichRecoveryHistory, historyAmount, validateHistory } from '../src/history.js';
import { getDashHistory, dashAmountUnit } from '../src/coins/dash/history.js';
import { createRecoveryExport } from '../src/export.js';
import type { RecoveryCoinAdapter, RecoveryFinding, RecoveryScanContext, RecoveryWalletResult } from '../src/types.js';

const btc = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
const eth = `0x${'11'.repeat(20)}`;
const other = `0x${'22'.repeat(20)}`;
const txid = (n: number) => n.toString(16).padStart(64, '0');
const endpoints = [{ label: 'Esplora test', url: 'https://example.test/api' }];
const stats = (count: number, received = 1000, spent = 1000) => ({ address: btc, chain_stats: { tx_count: count, funded_txo_sum: received, spent_txo_sum: spent }, mempool_stats: { tx_count: 1 } });
const btcTx = (id: number, time: number, incoming: number, outgoing: number) => ({ txid: txid(id), status: { confirmed: true, block_time: time },
  vout: [{ scriptpubkey_address: btc, value: incoming }], vin: [{ prevout: { scriptpubkey_address: btc, value: outgoing } }] });
function fetchMock(fn: (url: string) => unknown) {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(fn(url))));
  vi.stubGlobal('fetch', fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe('Bitcoin history', () => {
  it('retains used-zero lifetime totals and separates receipt, spend and pending activity', async () => {
    fetchMock(url => url.endsWith('/txs/chain') ? [btcTx(2, 1700100000, 0, 1000), btcTx(1, 1700000000, 1000, 0)] : stats(2));
    const h = await bitcoinAddressHistory(btc, endpoints);
    expect(h).toMatchObject({ status: 'complete', totalReceivedAtomic: '1000', totalSentAtomic: '1000', pendingTransactionCount: 1, transactionCount: 2 });
    expect(h.firstReceived).toBe(new Date(1700000000000).toISOString());
    expect(h.lastSpent).toBe(new Date(1700100000000).toISOString());
    expect(h.totalFeesAtomic).toBeNull();
  });
  it('follows confirmed transaction cursors across pages', async () => {
    const page = Array.from({ length: 25 }, (_, i) => btcTx(i + 2, 1700000000 + i, 1, 0));
    const fetch = fetchMock(url => url.endsWith(`/chain/${txid(26)}`) ? [btcTx(1, 1690000000, 1, 0)] : url.endsWith('/txs/chain') ? page : stats(26, 26, 0));
    const h = await bitcoinAddressHistory(btc, endpoints);
    expect(h.status).toBe('complete');
    expect(h.firstSeen).toBe(new Date(1690000000000).toISOString());
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('rejects duplicates, inconsistent sums and changing snapshots', async () => {
    fetchMock(url => url.includes('/txs/') ? [btcTx(1, 1700000000, 1000, 0), btcTx(1, 1700000000, 0, 1000)] : stats(2));
    await expect(bitcoinAddressHistory(btc, endpoints)).rejects.toThrow('Repeated');
    fetchMock(url => url.includes('/txs/') ? [btcTx(1, 1700000000, 1000, 0)] : stats(1));
    await expect(bitcoinAddressHistory(btc, endpoints)).rejects.toThrow('totals mismatch');
    let count = 0;
    fetchMock(url => url.includes('/txs/') ? [btcTx(1, 1700000000, 1000, 1000)] : stats(++count === 1 ? 1 : 2));
    await expect(bitcoinAddressHistory(btc, endpoints)).rejects.toThrow('changed');
  });
  it('keeps full summary totals but withholds unproven dates when pagination is capped', async () => {
    let page = 0;
    fetchMock(url => url.includes('/txs/') ? Array.from({ length: 25 }, (_, i) => btcTx(++page, 1700000000 + i, 1, 0)) : stats(999, 999, 0));
    const h = await bitcoinAddressHistory(btc, endpoints);
    expect(page).toBe(HISTORY_MAX_PAGES * 25);
    expect(h).toMatchObject({ status: 'partial', totalReceivedAtomic: '999', firstSeen: null, lastSpent: null });
  });
});

function ethTx(n: number, from: string, to: string, value: string, status = 'ok') {
  return { hash: `0x${txid(n)}`, block_number: n, timestamp: new Date(1700000000000 + n * 1000).toISOString(), from: { hash: from }, to: { hash: to }, value, status, fee: { type: 'actual', value: '3' } };
}
function trace(n: number, index: number, from: string, to: string, value: string) {
  return { transaction_hash: `0x${txid(n)}`, index, block_number: n, timestamp: new Date(1700000000000 + n * 1000).toISOString(), from: { hash: from }, to: { hash: to }, value, success: true, error: null, type: 'call' };
}
describe('Ethereum history', () => {
  it('counts incoming/internal ETH exactly, separates gas and ignores failed transfers and duplicate root calls', async () => {
    fetchMock(url => ({ items: url.endsWith('/internal-transactions')
      ? [trace(1, 0, other, eth, '100'), trace(2, 1, other, eth, '7'), { ...trace(3, 1, other, eth, '999'), success: false, error: 'reverted' }]
      : [ethTx(4, eth, other, '99', 'error'), ethTx(3, eth, eth, '2'), ethTx(2, eth, other, '20'), ethTx(1, other, eth, '100')], next_page_params: null }));
    const h = await ethereumAddressHistory(eth, 'mainnet');
    expect(h).toMatchObject({ status: 'complete', asset: 'ETH', atomicUnit: 'wei', decimals: 18, totalReceivedAtomic: '109', totalSentAtomic: '22', totalFeesAtomic: '9', transactionCount: 4 });
    expect(h.lastSpent).toBe(ethTx(4, eth, other, '99').timestamp);
    expect(h.firstReceived).toBe(ethTx(1, other, eth, '100').timestamp);
  });
  it('follows numeric cursors without trusting arbitrary provider URLs', async () => {
    fetchMock(url => url.endsWith('/internal-transactions') ? { items: [], next_page_params: null }
      : url.includes('?') ? { items: [ethTx(1, other, eth, '1')], next_page_params: null }
      : { items: [ethTx(2, eth, other, '1')], next_page_params: { block_number: 2, index: 1, items_count: 50, hash: `0x${txid(2)}`, inserted_at: '2026-09-07T19:32:38.148793Z', value: '0', fee: '5324383402476' } });
    expect((await ethereumAddressHistory(eth, 'testnet')).totalReceivedAtomic).toBe('1');
    fetchMock(() => ({ items: [ethTx(1, other, eth, '1')], next_page_params: { url: 'https://attacker.test' } }));
    await expect(ethereumAddressHistory(eth, 'mainnet')).rejects.toThrow('cursor');
  });
  it('withholds lifetime sums when a history stream is truncated', async () => {
    let page = 0;
    fetchMock(url => url.endsWith('/internal-transactions') ? { items: [], next_page_params: null }
      : { items: [ethTx(++page, other, eth, '1')], next_page_params: { block_number: page, index: 1 } });
    expect(await ethereumAddressHistory(eth, 'mainnet')).toMatchObject({ status: 'partial', totalReceivedAtomic: null, totalSentAtomic: null, firstSeen: null });
  });
});

const finding = (): RecoveryFinding => ({ id: 'address', title: btc, subtitle: '', balanceAtomic: 0n, balanceLabel: '0 BTC', fields: [] });
const report = (): RecoveryWalletResult => ({ inputId: 'test', label: 'test', coinId: 'future', coinLabel: 'Future coin', network: 'mainnet', startedAt: '', completedAt: '', overview: [], warnings: [],
  sections: [{ id: 'core', title: 'Test', description: '', state: 'complete', scanned: 1, source: '', proof: '', metrics: [], findings: [finding()] }] });
const context = (): RecoveryScanContext => ({ signal: new AbortController().signal, networkApi: {} as RecoveryScanContext['networkApi'], onProgress: vi.fn(), onFinding: vi.fn() });
const adapter = (getHistory?: RecoveryCoinAdapter['getHistory']): RecoveryCoinAdapter => ({ id: 'future', label: 'Future coin', networks: ['mainnet'], scan: async () => report(), ...(getHistory ? { getHistory } : {}) });
describe('adapter history contract and exports', () => {
  it('supports a future adapter without coin switches in the runner and exports exact units', async () => {
    const h = { ...emptyHistory('TEST', 'tiny units', 18), status: 'complete' as const, totalReceivedAtomic: '123456789123456789123456789', totalSentAtomic: '0', firstSeen: '2024-01-01T00:00:00.000Z' };
    const result = report();
    await enrichRecoveryHistory(adapter(async () => h), result, context());
    const json = JSON.parse(createRecoveryExport([result], 'json').text);
    expect(json.results[0].sections[0].findings[0].history).toEqual(expect.objectContaining({
      firstSeen: h.firstSeen,
      lastSeen: h.lastSeen,
      totalReceivedAtomic: h.totalReceivedAtomic,
    }));
    for (const redundant of ['firstReceived', 'lastReceived', 'firstSpent', 'lastSpent']) {
      expect(json.results[0].sections[0].findings[0].history).not.toHaveProperty(redundant);
    }
    const csv = createRecoveryExport([result], 'csv').text;
    expect(csv).toContain('total_received_atomic'); expect(csv).toContain(h.totalReceivedAtomic);
    expect(csv).not.toContain('first_received_utc'); expect(csv).not.toContain('last_spent_utc');
    expect(csv).toContain('balance_atomic_unit');
    expect(json.results[0].sections[0].findings[0].balanceUnit).toEqual({ asset: 'TEST', atomicUnit: 'tiny units', decimals: 18 });
    expect(csv).toContain('123456789.123456789123456789'); expect(csv).toContain('tiny units');
    expect(historyAmount('1', emptyHistory('DASH', 'credits', 11))).toBe('0.00000000001 DASH');
  });
  it('keeps discoveries after optional history failures and explicitly marks unsupported adapters', async () => {
    const r = report();
    await enrichRecoveryHistory(adapter(async () => { throw new Error('HTTP 403'); }), r, context());
    expect(r.sections[0]!.findings[0]!.history?.status).toBe('unavailable');
    expect(r.sections[0]!.findings[0]!.balanceAtomic).toBe(0n);
    await enrichRecoveryHistory(adapter(), r, context());
    expect(r.sections[0]!.findings[0]!.history?.status).toBe('unsupported');
  });
  it('does not swallow cancellation or accept imprecise amounts from a worker', async () => {
    const abort = new AbortController();
    const ctx = { ...context(), signal: abort.signal };
    await expect(enrichRecoveryHistory(adapter(async () => { abort.abort(); throw new DOMException('Cancelled', 'AbortError'); }), report(), ctx)).rejects.toThrow();
    expect(() => validateHistory({ ...emptyHistory(), totalReceivedAtomic: 1 as unknown as string })).toThrow('amount');
  });
  it('adds watch-only Dash Core and Platform history with correct atomic units', async () => {
    const ctx = context();
    ctx.networkApi.coreAddressHistory = vi.fn(async () => ({ address: btc, txCount: 2, received: '123', sent: '123', firstSeenBlockTimestamp: '2024-01-01T00:00:00Z', lastSeenBlockTimestamp: '2024-01-02T00:00:00Z' }));
    const f = finding();
    expect(await getDashHistory(f, 'core', 'mainnet', ctx)).toMatchObject({ status: 'complete', atomicUnit: 'duffs', decimals: 8, totalReceivedAtomic: '123' });
    ctx.networkApi.platformAddressHistory = vi.fn(async () => ({ resource: btc, balance: '0', transactionCount: 2, incomingCount: 1, outgoingCount: 1, totalReceived: '100000000001', totalSent: '100000000001', totalFees: null, firstSeen: null, lastSeen: null, indexedHeight: 10 }));
    expect(await getDashHistory(f, 'platform', 'mainnet', ctx)).toMatchObject({ atomicUnit: 'credits', decimals: 11, totalReceivedAtomic: '100000000001' });
    expect(await getDashHistory(f, 'shielded', 'mainnet', ctx)).toMatchObject({ status: 'unsupported', asset: 'DASH', atomicUnit: 'credits', decimals: 11 });
  });
});


it('validates history RPC address, network and coin before network access', async () => {
  const fetch = fetchMock(() => { throw new Error('Must not request'); });
  const service = new MultiChainRecoveryNetworkService();
  await expect(service.addressHistory('bitcoin', 'mainnet', 'https://example.test')).rejects.toThrow('invalid Bitcoin');
  await expect(service.addressHistory('ethereum', 'mainnet', '../secret')).rejects.toThrow('invalid Ethereum');
  await expect(service.addressHistory('bitcoin', 'invalid' as 'mainnet', btc)).rejects.toThrow();
  await expect(service.addressHistory('unknown' as 'bitcoin', 'mainnet', btc)).rejects.toThrow('Unsupported history coin');
  expect(fetch).not.toHaveBeenCalled();
});


it('exports explicit Dash L1/L2 units even when history cannot be loaded', async () => {
  const r = report(); r.coinId = 'dash'; r.coinLabel = 'Dash';
  const base = r.sections[0]!;
  r.sections = (['core', 'legacyCore', 'coinjoin', 'providerCollateral', 'platform', 'identity', 'shielded'] as const)
    .map(id => ({ ...base, id, findings: [{ ...finding(), id, balanceAtomic: 1n }] }));
  const dash = { ...adapter(async () => { throw new Error('offline'); }), amountUnit: dashAmountUnit };
  await enrichRecoveryHistory(dash, r, context());
  const json = JSON.parse(createRecoveryExport([r], 'json').text);
  for (const section of json.results[0].sections) {
    const credit = ['platform', 'identity', 'shielded'].includes(section.id);
    expect(section.findings[0].balanceUnit).toEqual({ asset: 'DASH', atomicUnit: credit ? 'credits' : 'duffs', decimals: credit ? 11 : 8 });
    expect(section.findings[0].history.atomicUnit).toBe(credit ? 'credits' : 'duffs');
  }
});

it('rejects history expressed in the wrong unit instead of rendering a 1000x error', async () => {
  const r = report(); r.sections[0]!.id = 'platform';
  const badAdapter = { ...adapter(async () => ({ ...emptyHistory('DASH', 'duffs', 8), status: 'complete' as const, totalReceivedAtomic: '100000000000' })), amountUnit: dashAmountUnit };
  await enrichRecoveryHistory(badAdapter, r, context());
  expect(r.sections[0]!.findings[0]!.history).toMatchObject({ status: 'unavailable', atomicUnit: 'credits', totalReceivedAtomic: null });
});
