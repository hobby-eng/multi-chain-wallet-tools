import { afterEach, expect, it, vi } from 'vitest';
import { MultiChainRecoveryNetworkService } from '../src/network-service-multichain.js';
vi.mock('@dashevo/evo-sdk', () => ({ EvoSDK: class {} }));
afterEach(() => vi.unstubAllGlobals());
it('requests fresh Bitcoin state on each call and bypasses the HTTP cache', async () => {
  const address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
  let balance = 100;
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ [address]: { final_balance: balance, n_tx: 1 } })));
  vi.stubGlobal('fetch', fetcher);
  const service = new MultiChainRecoveryNetworkService();
  expect((await service.utxoAddresses('mainnet', [address]))[0]?.balance).toBe('100');
  balance = 0;
  expect((await service.utxoAddresses('mainnet', [address]))[0]?.balance).toBe('0');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]).toEqual([expect.any(String), expect.objectContaining({ cache: 'no-store' })]);
});
it('rechecks Platform index status rather than retaining a prior synced result', async () => {
  let synced = true;
  const address = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs';
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/status')
    ? { network: 'evo1', indexer: { status: synced ? 'synced' : 'syncing' }, api: { block: { height: 100 } } }
    : { bech32mAddress: address, totalTxs: 0, incomingTxs: 0, outgoingTxs: 0, balance: '0', totalIncomingAmount: '0', totalOutgoingAmount: '0' })));
  vi.stubGlobal('fetch', fetcher);
  const service = new MultiChainRecoveryNetworkService();
  await service.platformAddressHistory('mainnet', address);
  synced = false;
  await expect(service.platformAddressHistory('mainnet', address)).rejects.toThrow('not synchronized');
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/status'))).toHaveLength(2);
});
