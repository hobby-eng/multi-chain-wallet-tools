import { afterEach, expect, it, vi } from 'vitest';
import { bech32, bech32m } from '@scure/base';
import { normalizeBitcoinAddress, normalizeEthereumAddress } from '../src/public-address-multichain.js';
import { MultiChainRecoveryNetworkService } from '../src/network-service-multichain.js';
afterEach(() => vi.unstubAllGlobals());
it('validates base58 versions and checksum, and accepts uppercase witness addresses', () => {
  expect(normalizeBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'mainnet')).toBe('1BoatSLRHtKNngkdXEeobR76b53LETtpyT');
  expect(() => normalizeBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyU', 'mainnet')).toThrow();
  expect(() => normalizeBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'testnet')).toThrow();
  const address = 'bc1qmywt6wjv8rtm4w0uedtancvx2selp2nnaecuu0';
  expect(normalizeBitcoinAddress(address.toUpperCase(), 'mainnet')).toBe(address);
  expect(() => normalizeBitcoinAddress('BC' + address.slice(2), 'mainnet')).toThrow();
});
it('enforces witness version, program length, network and checksum family', () => {
  const words = bech32.toWords(new Uint8Array(32).fill(1));
  const taproot = bech32m.encode('bc', [1, ...words]);
  expect(normalizeBitcoinAddress(taproot, 'mainnet')).toBe(taproot);
  for (const address of [bech32.encode('bc', [1, ...words]), bech32m.encode('bc', [0, ...words]),
    bech32.encode('bc', [0, ...bech32.toWords(new Uint8Array(21))]), bech32m.encode('bc', [17, ...words]), bech32m.encode('tb', [1, ...words])]) {
    expect(() => normalizeBitcoinAddress(address, 'mainnet')).toThrow();
  }
});
it('checks mixed-case EIP55 while accepting uniformly cased public addresses', () => {
  const address = '0x5Aeda56215b167893e80B4fE645BA6d5Bab767DE';
  // EIP55 published example, compared independently with its canonical spelling.
  const canonical = '0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE';
  expect(normalizeEthereumAddress(address.toLowerCase())).toBe(canonical);
  expect(normalizeEthereumAddress(canonical)).toBe(canonical);
  expect(() => normalizeEthereumAddress(address)).toThrow(/checksum/u);
});
it('rejects invalid network inputs before fetch', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const service = new MultiChainRecoveryNetworkService();
  await expect(service.utxoAddresses('mainnet', ['1BoatSLRHtKNngkdXEeobR76b53LETtpyU'])).rejects.toThrow();
  await expect(service.addressHistory('bitcoin', 'mainnet', '1BoatSLRHtKNngkdXEeobR76b53LETtpyU')).rejects.toThrow();
  await expect(service.evmAccounts('mainnet', ['0x5Aeda56215b167893e80B4fE645BA6d5Bab767DE'])).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
