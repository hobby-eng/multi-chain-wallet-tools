import { bytesToHex } from '@noble/hashes/utils.js';
import DashHd from 'dashhd';
import { describe, expect, it } from 'vitest';
import { deriveDashLegacyMobile } from '../src/coins/dash/legacy-mobile.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { rowValue, TEST_MNEMONIC } from '@ckd/test-support/helpers.js';

describe('Dash legacy mobile', () => {
  it('matches the independent DashHD implementation on receive and change paths', async () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const referenceRoot = await DashHd.fromSeed(seed, { purpose: 44, coinType: 5 });
    try {
      for (const branch of [0, 1]) {
        const result = deriveDashLegacyMobile({ seed, network: 'mainnet', account: 0, branch, start: 0, count: 1 });
        const path = `m/0'/${branch}/0`;
        const reference = await DashHd.derivePath(referenceRoot, path);
        if (reference.privateKey === undefined) throw new Error('DashHD did not return a private key.');

        expect(result.pathTemplate).toBe(`m/0'/${branch}/i`);
        expect(result.rows[0]?.path).toBe(path);
        expect(rowValue(result, 'address')).toBe(await DashHd.toAddr(reference.publicKey));
        expect(rowValue(result, 'publicKey')).toBe(bytesToHex(reference.publicKey));
        expect(rowValue(result, 'privateKey')).toBe(await DashHd.toWif(reference.privateKey));
        DashHd.wipePrivateData(reference);
      }
    } finally {
      DashHd.wipePrivateData(referenceRoot);
      seed.fill(0);
    }
  });
});
