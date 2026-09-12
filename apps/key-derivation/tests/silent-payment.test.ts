import { describe, expect, it } from 'vitest';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { deriveSilentPayment } from '../src/workers/silent-payment.js';

describe('BIP352 Silent Payment derivation', () => {
  it('uses the standard scan/spend paths and stable mainnet encoding', async () => {
    const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    try {
      const result = await deriveSilentPayment(seed, 'mainnet', 0);
      expect(result.scanPath).toBe("m/352'/0'/0'/1'/0");
      expect(result.spendPath).toBe("m/352'/0'/0'/0'/0");
      expect(result.address).toBe('sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g');
      expect(result.changeAddress).toBe('sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqc7cztt86v30fp7s8rdq99v4vxl5vs4r6naeha9dgwu38c2aszwlqdmad77');
      expect(result.labeledAddresses).toEqual([]);
      const labeled = await deriveSilentPayment(seed, 'mainnet', 0, [1]);
      expect(labeled.labeledAddresses).toHaveLength(1);
      expect(labeled.labeledAddresses[0]!.label).toBe(1);
      expect(labeled.labeledAddresses[0]!.address).toMatch(/^sp1q/u);
      expect(labeled.labeledAddresses[0]!.address).not.toBe(result.address);
      expect(labeled.labeledAddresses[0]!.address).not.toBe(result.changeAddress);
      expect(labeled.labeledAddress).toBe(labeled.labeledAddresses[0]!.address);
    } finally {
      seed.fill(0);
    }
  });

  it('derives multiple distinct labels in one request, deduplicated and sorted', async () => {
    const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    try {
      const result = await deriveSilentPayment(seed, 'mainnet', 0, [3, 1, 2, 1]);
      expect(result.labeledAddresses.map((entry) => entry.label)).toEqual([1, 2, 3]);
      const addresses = new Set(result.labeledAddresses.map((entry) => entry.address));
      expect(addresses.size).toBe(3);
    } finally {
      seed.fill(0);
    }
  });

  it('rejects label 0 and out-of-range labels', async () => {
    const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    try {
      await expect(deriveSilentPayment(seed, 'mainnet', 0, [0])).rejects.toThrow(/reserved for change/u);
      await expect(deriveSilentPayment(seed, 'mainnet', 0, [4294967296])).rejects.toThrow(/4294967295/u);
    } finally {
      seed.fill(0);
    }
  });
});
