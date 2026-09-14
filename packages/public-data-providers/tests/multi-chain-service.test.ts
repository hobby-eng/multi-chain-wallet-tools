import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBitcoinAddress, normalizeEthereumAddress } from '../src/address-normalization.js';
import { PublicMultiChainDataService } from '../src/multi-chain-service.js';

afterEach(() => vi.unstubAllGlobals());

describe('public multi-chain data service', () => {
  it('rejects invalid public identifiers before making provider requests', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const service = new PublicMultiChainDataService();

    await expect(service.utxoAddresses('mainnet', ['not-a-bitcoin-address'])).rejects.toThrow(/invalid Bitcoin/iu);
    await expect(service.evmAccounts('mainnet', ['0xnot-an-address'])).rejects.toThrow(/invalid Ethereum/iu);
    await expect(service.addressHistory('bitcoin', 'mainnet', 'not-an-address')).rejects.toThrow(/invalid Bitcoin/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preserves provider shape validation instead of treating malformed data as zero', async () => {
    const address = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );
    const service = new PublicMultiChainDataService();

    await expect(service.utxoAddresses('mainnet', [address])).rejects.toThrow();
  });

  it('preserves validated input normalization as the only public output boundary', () => {
    expect(normalizeBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'mainnet')).toBe(
      '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    );
    expect(normalizeEthereumAddress('0x5aeda56215b167893e80b4fe645ba6d5bab767de')).toBe(
      '0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE',
    );
  });

  it('propagates caller cancellation without converting it to a provider result', async () => {
    const address = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA';
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        await new Promise<void>((resolve) => init?.signal?.addEventListener('abort', () => resolve(), { once: true }));
        throw new DOMException('Aborted', 'AbortError');
      }),
    );
    const pending = new PublicMultiChainDataService().utxoAddresses('mainnet', [address], controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/iu);
  });
});
