import { describe, expect, it } from 'vitest';
import { rootFromSeed } from '@ckd/core/bip32.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { bytesToHex, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { deriveDashIdentityAuthenticationKey } from '../src/coins/dash/identity.js';
import { TEST_MNEMONIC } from '@ckd/test-support/helpers.js';

describe('Dash Identity DIP13 authentication-key vectors', () => {
  for (const vector of [
    {
      network: 'mainnet' as const,
      path: "m/9'/5'/5'/0'/0'/0'/0'",
      privateKey: '5d6d4d9ef3092e2c63c5e7c436e3068efa58cbe4f32eb406ecbceecebf127f0f',
      publicKey: '03de6e4f0a455c1f089e51c53ed937b172d46e5cec4a98e2d9977ea4638129d252',
      publicKeyHash: 'd0559a724d640d22df8a04665308ffd0b7fe9b77',
    },
    {
      network: 'testnet' as const,
      path: "m/9'/1'/5'/0'/0'/0'/0'",
      privateKey: 'e560f452db267372375f218a22d57c0937070faffe66f0b7f908c21c8772ee3e',
      publicKey: '03a00f4853081aeb8c9debe37267303fa133bd7f6678bfb3299dfa001bfd0341db',
      publicKeyHash: '35891d57608f93cfe630e70bee9ae863f403f50f',
    },
  ]) {
    it(`matches the independently reproduced ${vector.network} vector`, () => {
      const seed = mnemonicToSeed(TEST_MNEMONIC);
      const network = getDashNetwork(vector.network);
      const root = rootFromSeed(seed, network.versions);
      const derived = deriveDashIdentityAuthenticationKey(root, vector.network, 0);
      try {
        expect(derived.path).toBe(vector.path);
        expect(bytesToHex(derived.privateKey)).toBe(vector.privateKey);
        expect(bytesToHex(derived.publicKey)).toBe(vector.publicKey);
        expect(bytesToHex(derived.publicKeyHash)).toBe(vector.publicKeyHash);
      } finally {
        wipe(seed, derived.privateKey, derived.publicKey, derived.publicKeyHash);
        root.wipePrivateData();
      }
    });
  }

  it('derives the optional non-zero DIP13 identity key index at its own hardened path', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const network = getDashNetwork('mainnet');
    const root = rootFromSeed(seed, network.versions);
    const keyZero = deriveDashIdentityAuthenticationKey(root, 'mainnet', 0, 0);
    const keyOne = deriveDashIdentityAuthenticationKey(root, 'mainnet', 0, 1);
    try {
      expect(keyOne.path).toBe("m/9'/5'/5'/0'/0'/0'/1'");
      expect(bytesToHex(keyOne.privateKey)).not.toBe(bytesToHex(keyZero.privateKey));
      expect(bytesToHex(keyOne.publicKeyHash)).not.toBe(bytesToHex(keyZero.publicKeyHash));
    } finally {
      wipe(seed, keyZero.privateKey, keyZero.publicKey, keyZero.publicKeyHash, keyOne.privateKey, keyOne.publicKey, keyOne.publicKeyHash);
      root.wipePrivateData();
    }
  });
});
