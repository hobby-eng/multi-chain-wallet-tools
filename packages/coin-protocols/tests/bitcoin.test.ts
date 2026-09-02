import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { HDNodeWallet } from 'ethers';
import { deriveBitcoin } from '../src/coins/bitcoin/index.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { secp256k1 } from '@ckd/core/crypto.js';
import { rowValue, TEST_MNEMONIC, value } from '@ckd/test-support/helpers.js';

function derive(mode: Parameters<typeof deriveBitcoin>[0], network: 'mainnet' | 'testnet' = 'mainnet') {
  const seed = mnemonicToSeed(TEST_MNEMONIC);
  try {
    return deriveBitcoin(mode, { seed, network, account: 0, branch: 0, start: 0, count: 2 });
  } finally {
    seed.fill(0);
  }
}

describe('Bitcoin official application vectors', () => {
  it('matches the SLIP-0014 BIP44 mainnet vector', () => {
    const seed = mnemonicToSeed('all all all all all all all all all all all all');
    try {
      const result = deriveBitcoin('legacy', {
        seed,
        network: 'mainnet',
        account: 0,
        branch: 0,
        start: 0,
        count: 1,
      });
      expect(result.rows[0]?.path).toBe("m/44'/0'/0'/0/0");
      expect(rowValue(result, 'privateKey')).toBe('L1KjqxZkUwdXaKNL15F2jJZVZpgi2HkHPHGyqTrQNNegyZez3A7Z');
      expect(rowValue(result, 'publicKey')).toBe('03c6d9cc725bb7e19c026df03bf693ee1171371a8eaf25f04b7a58f6befabcd38c');
      expect(rowValue(result, 'address')).toBe('1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL');
    } finally {
      seed.fill(0);
    }
  });

  it('matches the BIP49 P2SH-P2WPKH testnet vector', () => {
    const result = derive('nested-segwit', 'testnet');
    expect(result.rows[0]?.path).toBe("m/49'/1'/0'/0/0");
    expect(rowValue(result, 'privateKey')).toBe('cULrpoZGXiuC19Uhvykx7NugygA3k86b3hmdCeyvHYQZSxojGyXJ');
    expect(rowValue(result, 'publicKey')).toBe('03a1af804ac108a8a51782198c2d034b28bf90c8803f5a53f76276fa69a4eae77f');
    expect(rowValue(result, 'address')).toBe('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2');
  });

  it('matches the BIP84 P2WPKH mainnet vectors', () => {
    const result = derive('native-segwit');
    expect(rowValue(result, 'privateKey')).toBe('KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d');
    expect(rowValue(result, 'publicKey')).toBe('0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c');
    expect(rowValue(result, 'address')).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(rowValue(result, 'address', 1)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
  });

  it('matches the complete BIP86 first receiving vector', () => {
    const result = derive('taproot');
    expect(value(result.summary, 'accountXprv')).toBe('xprv9xgqHN7yz9MwCkxsBPN5qetuNdQSUttZNKw1dcYTV4mkaAFiBVGQziHs3NRSWMkCzvgjEe3n9xV8oYywvM8at9yRqyaZVz6TYYhX98VjsUk');
    expect(rowValue(result, 'internalPublicKey')).toBe('cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115');
    expect(rowValue(result, 'tapTweak')).toBe('2ca01ed85cf6b6526f73d39a1111cd80333bfdc00ce98992859848a90a6f0258');
    expect(rowValue(result, 'taprootOutputPublicKey')).toBe('a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c');
    expect(rowValue(result, 'scriptPubKey')).toBe('5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c');
    expect(rowValue(result, 'address')).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    expect(rowValue(result, 'address', 1)).toBe('bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh');

    // The official first child has odd Y. This assertion specifically checks
    // BIP340 secret negation before adding the tweak, not only output encoding.
    expect(rowValue(result, 'publicKey').startsWith('03')).toBe(true);
    const tweakedSecret = hexToBytes(rowValue(result, 'taprootOutputPrivateKey'));
    try {
      expect(bytesToHex(secp256k1.getPublicKey(tweakedSecret, true))).toBe(
        rowValue(result, 'taprootOutputCompressedPublicKey'),
      );
    } finally {
      tweakedSecret.fill(0);
    }
  });

  it('exports a checksummed ranged watch-only descriptor without private material', () => {
    const result = derive('native-segwit');
    const descriptor = result.watchOnly?.text ?? '';
    expect(descriptor).toMatch(/^wpkh\(\[[0-9a-f]{8}\/84h\/0h\/0h\]xpub[^/]+\/0\/\*\)#[a-z0-9]{8}$/u);
    expect(descriptor).not.toContain('xprv');
    expect(result.watchOnly?.privacySensitive).toBe(true);
    expect(result.watchOnly?.fileName).toBe('bitcoin-native-segwit-mainnet-account-0-branch-0.descriptor.txt');
  });

  it('matches an independent BIP32 implementation on every standard change branch', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const modes = [
      ['legacy', 44],
      ['nested-segwit', 49],
      ['native-segwit', 84],
      ['taproot', 86],
    ] as const;
    try {
      for (const [mode, purpose] of modes) {
        const path = `m/${purpose}'/0'/0'/1/0`;
        const result = deriveBitcoin(mode, { seed, network: 'mainnet', account: 0, branch: 1, start: 0, count: 1 });
        const reference = HDNodeWallet.fromSeed(seed).derivePath(path);
        expect(result.rows[0]?.path).toBe(path);
        expect(rowValue(result, 'childPrivateKey')).toBe(reference.privateKey.slice(2));
        expect(rowValue(result, 'publicKey')).toBe(reference.publicKey.slice(2));
        expect(rowValue(result, 'address')).not.toBe(rowValue(derive(mode), 'address'));
      }
    } finally {
      seed.fill(0);
    }
  });
});
