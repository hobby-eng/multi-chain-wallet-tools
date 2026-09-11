import { afterEach, expect, it, vi } from 'vitest';
import { DirectRecoveryNetworkService, PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS } from '../src/network-service.js';
const identifier = '1'.repeat(44);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture(total: number) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url.endsWith('/status')) return Response.json({ network: 'mainnet', indexer: { status: 'synced' }, api: { block: { height: 10 } } });
    return Response.json({ identifier, totalTransfers: total, totalTxs: 0, balance: '0', totalGasSpent: '0', timestamp: null });
  });
  return calls;
}
it('rejects impossible transfer work before requesting any history pages', async () => {
  const calls = fixture(Number.MAX_SAFE_INTEGER);
  await expect(new DirectRecoveryNetworkService().platformIdentityHistory('mainnet', identifier)).rejects.toThrow(`${PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS}-transfer`);
  expect(calls).toHaveLength(2);
  expect(calls.some(url => url.includes('/transfers'))).toBe(false);
});
it('keeps the zero-transfer history valid', async () => {
  fixture(0);
  expect(await new DirectRecoveryNetworkService().platformIdentityHistory('mainnet', identifier)).toMatchObject({ totalReceived: '0', totalSent: '0' });
});
it('does not restart the time budget for each page', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const calls = fixture(0);
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    vi.setSystemTime(30_001);
    return response;
  });
  await expect(new DirectRecoveryNetworkService().platformIdentityHistory('mainnet', identifier)).rejects.toThrow('time budget');
  expect(calls).toHaveLength(1);
});
