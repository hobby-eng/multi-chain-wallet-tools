import { describe, expect, it } from 'vitest';
import { detectBitcoinAddressTarget, detectBitcoinAddressTargets } from '../src/address-targets.js';

describe('Bitcoin recovery target detection', () => {
  it('selects the adapter family from the address encoding', () => {
    expect(detectBitcoinAddressTarget('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'mainnet').adapterId).toBe(
      'bitcoin-legacy',
    );
    expect(detectBitcoinAddressTarget('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf', 'mainnet').adapterId).toBe(
      'bitcoin-nested-segwit',
    );
    expect(detectBitcoinAddressTarget('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'mainnet').adapterId).toBe(
      'bitcoin-native-segwit',
    );
    expect(
      detectBitcoinAddressTarget('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', 'mainnet').adapterId,
    ).toBe('bitcoin-taproot');
  });

  it('deduplicates batch targets while preserving input order', () => {
    const targets = detectBitcoinAddressTargets(
      '1BoatSLRHtKNngkdXEeobR76b53LETtpyT\n1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      'mainnet',
    );
    expect(targets).toHaveLength(1);
  });

  it('rejects checksum-invalid and wrong-network addresses before derivation', () => {
    expect(() => detectBitcoinAddressTarget('1BoatSLRHtKNngkdXEeobR76b53LETtpyU', 'mainnet')).toThrow();
    expect(() => detectBitcoinAddressTarget('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', 'testnet')).toThrow();
  });
});
