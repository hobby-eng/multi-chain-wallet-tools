import { HDNodeWallet } from 'ethers';
import { describe, expect, it } from 'vitest';
import { deriveEthereum, toEip55 } from '../src/coins/ethereum/index.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { rowValue, TEST_MNEMONIC } from '@ckd/test-support/helpers.js';

describe('Ethereum', () => {
  it('matches an independent ethers derivation at the canonical BIP44 path', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const result = deriveEthereum({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 2 });
    seed.fill(0);

    for (let index = 0; index < 2; index += 1) {
      const reference = HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
      expect(rowValue(result, 'address', index)).toBe(reference.address);
      expect(`0x${rowValue(result, 'privateKey', index)}`).toBe(reference.privateKey);
      expect(`0x${rowValue(result, 'publicKey', index)}`).toBe(reference.signingKey.publicKey);
    }
  });

  it('matches EIP-55 published checksum examples', () => {
    expect(toEip55('52908400098527886e0f7030069857d2e4169ee7')).toBe('0x52908400098527886E0F7030069857D2E4169EE7');
    expect(toEip55('8617e340b3d01fa5f11f306f4090fd50e238070d')).toBe('0x8617E340B3D01FA5F11F306F4090FD50E238070D');
  });
});
