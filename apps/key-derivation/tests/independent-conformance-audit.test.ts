import { HDNodeWallet, SigningKey } from 'ethers';
import { describe, expect, it } from 'vitest';
import { deriveBitcoin } from '@ckd/coins/bitcoin/index.js';
import { deriveDashMultisig } from '@ckd/coins/dash/multisig.js';
import { rowValue } from '@ckd/test-support/helpers.js';
import {
  referenceBech32m, referenceLabeledSpend, referencePublicKey, referenceSeed, referenceTaggedHash,
} from '@ckd/test-support/independent-audit-oracle.js';
import { deriveSilentPayment } from '../src/workers/silent-payment.js';

describe('independent derivation application audit', () => {
  it('anchors the independent Bech32m encoder to the official BIP86 first output', () => {
    expect(referenceBech32m('bc', 1, Buffer.from('a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c', 'hex')))
      .toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  });

  for (const network of ['mainnet', 'testnet'] as const) {
    const coin = network === 'mainnet' ? 0 : 1;
    it(`matches external BIP48 Dash cosigner keys across ${network} branch/index boundaries`, () => {
      const seed = referenceSeed('public parent');
      for (const account of [0, 17]) {
        for (const branch of [0, 1]) {
          for (const start of [0, 49, 2147483647]) {
            const path = `m/48'/${network === 'mainnet' ? 5 : 1}'/${account}'/0'/${branch}/${start}`;
            const reference = HDNodeWallet.fromSeed(seed).derivePath(path);
            const result = deriveDashMultisig({ seed, network, account, branch, start, count: 1 });
            expect(result.rows[0]!.path).toBe(path);
            expect(rowValue(result, 'publicKey')).toBe(reference.publicKey.slice(2));
            expect(rowValue(result, 'privateKeyHex')).toBe(reference.privateKey.slice(2));
          }
        }
      }
    });

    it(`matches independent BIP86 tweak, scalar parity and encoding on ${network}`, () => {
      const seed = referenceSeed('public parent');
      const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const parities = new Set<string>();
      for (const branch of [0, 1]) {
        const result = deriveBitcoin('taproot', { seed, network, account: 2, branch, start: 0, count: 6 });
        for (let index = 0; index < 6; index += 1) {
          const key = HDNodeWallet.fromSeed(seed).derivePath(`m/86'/${coin}'/2'/${branch}/${index}`);
          const publicKey = key.publicKey.slice(2);
          parities.add(publicKey.slice(0, 2));
          const internal = publicKey.slice(2);
          const tweak = referenceTaggedHash('TapTweak', Buffer.from(internal, 'hex'));
          const output = SigningKey.addPoints(`0x02${internal}`, SigningKey.computePublicKey(tweak, true), true).slice(2);
          const secret = BigInt(key.privateKey);
          const normalized = publicKey.startsWith('03') ? order - secret : secret;
          const tweaked = ((normalized + BigInt(`0x${tweak.toString('hex')}`)) % order).toString(16).padStart(64, '0');
          expect(rowValue(result, 'taprootOutputPrivateKey', index)).toBe(tweaked);
          expect(rowValue(result, 'taprootOutputCompressedPublicKey', index)).toBe(output);
          expect(rowValue(result, 'address', index)).toBe(referenceBech32m(network === 'mainnet' ? 'bc' : 'tb', 1, Buffer.from(output.slice(2), 'hex')));
        }
      }
      expect([...parities].sort()).toEqual(['02', '03']);
    });

    it(`matches independent BIP352 account/label encoding on ${network}`, async () => {
      const seed = referenceSeed('public parent');
      for (const account of [0, 7, 2147483647]) {
        const scanPath = `m/352'/${coin}'/${account}'/1'/0`;
        const spendPath = `m/352'/${coin}'/${account}'/0'/0`;
        const scan = HDNodeWallet.fromSeed(seed).derivePath(scanPath);
        const spend = referencePublicKey(seed, spendPath);
        const scanPublic = scan.publicKey.slice(2);
        const encode = (spendPublic: string) => referenceBech32m(network === 'mainnet' ? 'sp' : 'tsp', 0, Buffer.from(scanPublic + spendPublic, 'hex'));
        const labels = [1, 256, 65536, 4294967295];
        const actual = await deriveSilentPayment(seed, network, account, labels);
        expect(actual.scanPath).toBe(scanPath);
        expect(actual.spendPath).toBe(spendPath);
        expect(actual.scanPublicKey).toBe(scanPublic);
        expect(actual.spendPublicKey).toBe(spend);
        expect(actual.address).toBe(encode(spend));
        expect(actual.changeAddress).toBe(encode(referenceLabeledSpend(scan.privateKey.slice(2), spend, 0)));
        expect(actual.labeledAddresses).toEqual(labels.map(label => ({
          label, address: encode(referenceLabeledSpend(scan.privateKey.slice(2), spend, label)),
        })));
      }
    });
  }
});
