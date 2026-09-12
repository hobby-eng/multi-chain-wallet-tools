import { bytesToHex } from '@noble/hashes/utils.js';
import DashHd from 'dashhd';
import { describe, expect, it } from 'vitest';
import { deriveDashCore } from '../src/coins/dash/core.js';
import { deriveDashMultisig } from '../src/coins/dash/multisig.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { rowValue, TEST_MNEMONIC, value } from '@ckd/test-support/helpers.js';

describe('Dash Core', () => {
  it('matches the published SLIP-0014 Dash BIP44 vector', () => {
    const seed = mnemonicToSeed('all all all all all all all all all all all all');
    try {
      const result = deriveDashCore({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 });
      expect(result.rows[0]?.path).toBe("m/44'/5'/0'/0/0");
      expect(rowValue(result, 'address')).toBe('XdTw4G5AWW4cogGd7ayybyBNDbuB45UpgH');
      expect(rowValue(result, 'publicKey')).toBe('02936f80cac2ba719ddb238646eb6b78a170a55a52a9b9f08c43523a4a6bd5c896');
      expect(rowValue(result, 'privateKey')).toBe('XFiosCguxccAvHDasUYWU4mmx4PABR4dDQhk99k8D2N9cKeTRnYq');
    } finally {
      seed.fill(0);
    }
  });

  it('matches the independent DashHD implementation at mainnet receive paths', async () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const result = deriveDashCore({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 2 });
    const referenceRoot = await DashHd.fromSeed(seed, { purpose: 44, coinType: 5 });

    for (let index = 0; index < 2; index += 1) {
      const reference = await DashHd.derivePath(referenceRoot, `m/44'/5'/0'/0/${index}`);
      if (reference.privateKey === undefined) throw new Error('DashHD did not return a private key.');
      expect(rowValue(result, 'address', index)).toBe(await DashHd.toAddr(reference.publicKey));
      expect(rowValue(result, 'privateKey', index)).toBe(await DashHd.toWif(reference.privateKey));
      expect(rowValue(result, 'publicKey', index)).toBe(bytesToHex(reference.publicKey));
      expect(rowValue(result, 'privateKeyHex', index)).toBe(bytesToHex(reference.privateKey));
      DashHd.wipePrivateData(reference);
    }

    DashHd.wipePrivateData(referenceRoot);
    seed.fill(0);
  });

  it('matches the independent DashHD implementation on the change branch', async () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const result = deriveDashCore({ seed, network: 'mainnet', account: 0, branch: 1, start: 0, count: 2 });
    const referenceRoot = await DashHd.fromSeed(seed, { purpose: 44, coinType: 5 });

    for (let index = 0; index < 2; index += 1) {
      const path = `m/44'/5'/0'/1/${index}`;
      const reference = await DashHd.derivePath(referenceRoot, path);
      if (reference.privateKey === undefined) throw new Error('DashHD did not return a private key.');
      expect(result.rows[index]?.path).toBe(path);
      expect(rowValue(result, 'address', index)).toBe(await DashHd.toAddr(reference.publicKey));
      expect(rowValue(result, 'privateKey', index)).toBe(await DashHd.toWif(reference.privateKey));
      expect(rowValue(result, 'publicKey', index)).toBe(bytesToHex(reference.publicKey));
      DashHd.wipePrivateData(reference);
    }

    DashHd.wipePrivateData(referenceRoot);
    seed.fill(0);
  });
});

describe('Dash Purpose48 multisig cosigner', () => {
  it('exports the standard Dash mainnet P2SH multisig cosigner account xpub and child public keys', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    try {
      const result = deriveDashMultisig({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 2 });
      expect(result.id).toBe('dash-multisig-p2sh');
      expect(result.title).toBe('Dash multisig cosigner (Purpose48 / P2SH)');
      expect(result.pathTemplate).toBe("m/48'/5'/0'/0'/0/i");
      expect(result.rows.map(({ path }) => path)).toEqual(["m/48'/5'/0'/0'/0/0", "m/48'/5'/0'/0'/0/1"]);
      expect(value(result.summary, 'accountPath')).toBe("m/48'/5'/0'/0'");
      expect(value(result.basicSummary, 'descriptorAccountKey')).toMatch(/^\[[0-9a-f]{8}\/48h\/5h\/0h\/0h\]xpub/u);
      expect(rowValue(result, 'publicKey')).toMatch(/^(02|03)[0-9a-f]{64}$/u);
      expect(rowValue(result, 'descriptorKey')).toMatch(/^\[[0-9a-f]{8}\/48h\/5h\/0h\/0h\]xpub.+\/0\/0$/u);
      expect(result.watchOnly?.text).toBe(`${value(result.basicSummary, 'descriptorAccountKey')}\n`);
      expect(result.notices.join('\n')).toContain("Do not mix it with BIP44 m/44'/5'/account'");
    } finally {
      seed.fill(0);
    }
  });

  it('uses Dash testnet coin type 1 and exposes change branch cosigner keys', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    try {
      const result = deriveDashMultisig({ seed, network: 'testnet', account: 3, branch: 1, start: 4, count: 1 });
      expect(result.pathTemplate).toBe("m/48'/1'/3'/0'/1/i");
      expect(result.rows[0]?.path).toBe("m/48'/1'/3'/0'/1/4");
      expect(value(result.summary, 'accountPath')).toBe("m/48'/1'/3'/0'");
      expect(value(result.basicSummary, 'descriptorAccountKey')).toMatch(/^\[[0-9a-f]{8}\/48h\/1h\/3h\/0h\]tpub/u);
      expect(rowValue(result, 'privateKey')).toMatch(/^c/u);
    } finally {
      seed.fill(0);
    }
  });
});
