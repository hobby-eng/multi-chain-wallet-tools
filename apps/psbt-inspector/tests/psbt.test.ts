import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { bytesToHex, secp256k1 } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { decodeDescriptor, descriptorChecksum } from '../src/descriptor.js';
import { buildDashCoreImport } from '../src/dash-import.js';
import { buildConcreteMultisigWallet, buildRangedWallet, concreteDescriptor } from '../src/multisig-wallet.js';
import { buildPolicy, policyHex } from '../src/policy.js';
import { describeScript, parsePsbt } from '../src/psbt.js';
import { decodeScript } from '../src/script.js';

const BIP174_CREATOR = '70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd750000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d0100000000ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000';
const DASH_CORE_DOCS_PSBT = 'cHNidP8BAEICAAAAAXgRxzbShUlivVFKgoLyhk0RCCYLZKCYTl/tYRd+yGImAAAAAAD/////AQAAAAAAAAAABmoEAAECAwAAAAAAAAA=';
// Source: dashpay/dash-dev-branches test/functional/data/rpc_bip67.json
// at 6f2134d022b33ecd4e37714a27e584e2bbd8f13b. These are Dash Core's
// sortedmulti P2SH vectors exercised by rpc_createmultisig.py.
const DASH_CORE_BIP67_VECTORS = [
  {
    keys: [
      '02ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f8',
      '02fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f',
    ],
    script: '522102fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f2102ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f852ae',
    address: '8nL86iHTC8K4eVZ6YwyhRWMLhSauj8XQAK',
  },
  {
    keys: [
      '02632b12f4ac5b1d1b72b2a3b508c19172de44f6f46bcee50ba33f3f9291e47ed0',
      '027735a29bae7780a9755fae7a1c4374c656ac6a69ea9f3697fda61bb99a4f3e77',
      '02e2cc6bd5f45edd43bebe7cb9b675f0ce9ed3efe613b177588290ad188d11b404',
    ],
    script: '522102632b12f4ac5b1d1b72b2a3b508c19172de44f6f46bcee50ba33f3f9291e47ed021027735a29bae7780a9755fae7a1c4374c656ac6a69ea9f3697fda61bb99a4f3e772102e2cc6bd5f45edd43bebe7cb9b675f0ce9ed3efe613b177588290ad188d11b40453ae',
    address: '8q3jFFMMtiego4tNXEZckxw6ZzVy95pnPr',
  },
] as const;

describe('PSBT inspector core', () => {
  it('exports an exact Dash Core importmulti command and JSON-RPC request', () => {
    const exported = buildDashCoreImport('7WfjqozJ8GGMLEo5Hoh8jvBSpFk29PrqjR', '51');
    expect(exported.command).toContain(`"scriptPubKey":{"address":"7WfjqozJ8GGMLEo5Hoh8jvBSpFk29PrqjR"}`);
    expect(exported.command).toContain(`"redeemscript":"51"`);
    expect(exported.guiCommand).toMatch(/^importmulti "\[\{\\"scriptPubKey/u);
    expect(exported.guiCommand).not.toContain('\\\n');
    expect(exported.descriptorGuiCommand).toContain('addr(7WfjqozJ8GGMLEo5Hoh8jvBSpFk29PrqjR)#xzphyxv5');
    expect(JSON.parse(exported.rpcJson)).toMatchObject({ method: 'importmulti', params: [[{ timestamp: 'now', watchonly: true }], { rescan: false }] });
  });

  it('validates the BIP380 descriptor checksum vector', () => {
    expect(descriptorChecksum('raw(deadbeef)')).toBe('89f8spxm');
    expect(decodeDescriptor('raw(deadbeef)#89f8spxm').checksum).toBe('valid · 89f8spxm');
  });

  it('explains a checksum mismatch caused by a removed derivation wildcard', () => {
    const payload = 'wpkh(xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*)';
    const checksum = descriptorChecksum(payload);
    expect(() => decodeDescriptor(`${payload.replace('/0/*', '/0/')}#${checksum}`)).toThrow(/wildcard was removed/u);
  });

  it('summarizes a ranged Taproot Miniscript descriptor and its CSV time lock', () => {
    const xpub = 'xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL';
    const descriptor = decodeDescriptor(`tr(${xpub}/0/*,{multi_a(2,[deadbeef/87h/0h/0h]${xpub}/0/*,[feedface/87h/0h/0h]${xpub}/0/*),and_v(v:multi_a(2,[deadbeef]${xpub}/1/*,[feedface]${xpub}/1/*,[01020304]${xpub}/0/*),older(4194339))})`);
    expect(descriptor.summary).toContain('2 multi_a script-path branches');
    expect(descriptor.ranged).toBe(true);
    expect(descriptor.spendingPaths).toHaveLength(3);
    expect(descriptor.spendingPaths[1]).toContain('2-of-2 signatures');
    expect(descriptor.spendingPaths[1]).toContain('available immediately');
    expect(descriptor.spendingPaths[2]).toContain('2-of-3 signatures');
    expect(descriptor.spendingPaths[2]).toContain('17920 seconds (4:58:40)');
    expect(descriptor.rows).toContainEqual({ label: 'Relative lock 1', value: '4194339 = 35 × 512 seconds = 17920 seconds (4:58:40)' });
  });

  it('decodes the BIP174 creator vector and its outputs', () => {
    const parsed = parsePsbt(BIP174_CREATOR, 'bitcoin');
    expect(parsed.version).toBe(0);
    expect(parsed.inputs).toHaveLength(2);
    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputValues).toEqual([149_990_000n, 100_000_000n]);
    expect(parsed.fee).toBeNull();
    const output = parsed.transaction?.outputs[0];
    expect(output).toBeDefined();
    expect(describeScript(output!.script, 'bitcoin', 'mainnet')).toMatchObject({
      type: 'P2WPKH',
      address: 'bc1qmpwzkuwsqc9snjvgdt4czhjsnywa5yjdgwyw6k',
    });
  });

  it('rejects the same key twice in one map', () => {
    expect(() => parsePsbt('70736274ff010001000100010000', 'bitcoin')).toThrow(/Duplicate PSBT key/u);
  });

  it('decodes the Dash Core documentation PSBT with the Dash header layout', () => {
    const parsed = parsePsbt(DASH_CORE_DOCS_PSBT, 'dash');
    expect(parsed.version).toBe(0);
    expect(parsed.transaction).toMatchObject({ version: 2, dashType: 0, lockTime: 0 });
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.outputs).toHaveLength(1);
  });

  it('builds the documented Dash 2-of-3 P2SH example', () => {
    const policy = buildPolicy({
      chain: 'dash',
      network: 'testnet',
      required: 2,
      publicKeys: [
        '03fa8866cccae3c975a72884443a351801a0ea9721cbe7215586ddd6fab5f39f26',
        '03b2259f42a241f4870e794521594f2af7aadf0e4c580a43582e58630e46186346',
        '038007ef6fd812d73da054271b68a42dae06672cff2a30b2814935537e5930ebf6',
      ],
      lockKind: 'none',
      lockValue: 0,
      bitcoinWrapper: 'p2sh',
    });

    expect(policy.address).toBe('8meEZF54K7GxhHhdLCCeNwFQjHENv4CK86');
    expect(policy.compatibility).toContain('Dash Core can create/import and automatically sign');
    expect(policyHex(policy).redeemScript).toBe(
      '522103fa8866cccae3c975a72884443a351801a0ea9721cbe7215586ddd6fab5f39f262103b2259f42a241f4870e794521594f2af7aadf0e4c580a43582e58630e4618634621038007ef6fd812d73da054271b68a42dae06672cff2a30b2814935537e5930ebf653ae',
    );
  });

  it('makes concrete supplied-order and BIP67 descriptors explicit', () => {
    const keys = [
      '03fa8866cccae3c975a72884443a351801a0ea9721cbe7215586ddd6fab5f39f26',
      '03b2259f42a241f4870e794521594f2af7aadf0e4c580a43582e58630e46186346',
    ];
    const supplied = concreteDescriptor('bitcoin', 'p2sh', 2, keys, 'supplied');
    const sorted = concreteDescriptor('bitcoin', 'p2sh', 2, keys, 'bip67');
    expect(supplied).toMatch(/^sh\(multi\(2,03fa/u);
    expect(sorted).toMatch(/^sh\(sortedmulti\(2,03b2/u);
    expect(supplied).not.toBe(sorted);
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'mainnet',
      required: 2,
      publicKeys: keys,
      keyOrder: 'bip67',
      lockKind: 'none',
      lockValue: 0,
      bitcoinWrapper: 'p2sh',
    });
    expect(policy.spendingRequirement).toContain('BIP67 lexicographic sortedmulti');
  });

  it('builds one concrete multisig wallet output with import payloads', () => {
    const keys = [
      '03fa8866cccae3c975a72884443a351801a0ea9721cbe7215586ddd6fab5f39f26',
      '03b2259f42a241f4870e794521594f2af7aadf0e4c580a43582e58630e46186346',
    ];
    const wallet = buildConcreteMultisigWallet({
      chain: 'dash',
      network: 'mainnet',
      required: 2,
      keyOrder: 'supplied',
      wrapper: 'p2sh',
      publicKeys: keys,
    });
    expect(wallet.address).toMatch(/^7/u);
    expect(wallet.descriptor).toMatch(/^sh\(multi\(2,/u);
    expect(wallet.importText).toMatch(/^dash-cli importmulti/u);
    expect(JSON.parse(wallet.importJson)).toMatchObject({ method: 'importmulti' });
    expect(wallet.orderedPublicKeys).toEqual(keys);
    expect(wallet.derivationDetails).toContain('Concrete public keys; no HD derivation');
  });

  it('matches Dash Core dev-branch BIP67 sortedmulti P2SH vectors', () => {
    for (const vector of DASH_CORE_BIP67_VECTORS) {
      const policy = buildPolicy({
        chain: 'dash',
        network: 'testnet',
        required: 2,
        publicKeys: vector.keys,
        keyOrder: 'bip67',
        lockKind: 'none',
        lockValue: 0,
        bitcoinWrapper: 'p2sh',
      });
      expect(policy.address).toBe(vector.address);
      expect(policyHex(policy).redeemScript).toBe(vector.script);
    }
  });

  it('builds a ranged Bitcoin P2SH watch-only wallet from account xpubs', () => {
    const accounts = [21, 22].map((value) => {
      const seed = new Uint8Array(32).fill(value);
      return HDKey.fromMasterSeed(seed).derive("m/48'/0'/0'/2'");
    });
    const wallet = buildRangedWallet({
      chain: 'bitcoin',
      network: 'mainnet',
      required: 2,
      keyOrder: 'supplied',
      wrapper: 'p2sh',
      accountXpubs: accounts.map((account, index) => `[${index === 0 ? 'aaaaaaaa' : 'bbbbbbbb'}/48h/0h/0h/2h]${account.publicExtendedKey}`),
      branches: [0, 1],
      startIndex: 0,
      endIndex: 1,
    });
    expect(wallet.descriptors).toHaveLength(2);
    expect(wallet.descriptors[0]?.descriptor).toContain('sh(multi(2,[aaaaaaaa/48h/0h/0h/2h]');
    expect(wallet.descriptors[0]?.descriptor).toContain('/0/*))#');
    expect(wallet.descriptors[1]).toMatchObject({ branch: 1, label: 'change /1/*' });
    expect(wallet.rows).toHaveLength(4);
    expect(wallet.rows[0]?.address).toMatch(/^3/u);
    expect(wallet.rows[0]?.pathSuffix).toBe('/0/0');
    expect(wallet.rows[0]?.publicKeys).toEqual(accounts.map((account) => bytesToHex(account.deriveChild(0).deriveChild(0).publicKey!)));
    const importJson = JSON.parse(wallet.importJson);
    expect(importJson).toHaveLength(2);
    expect(importJson.map((item: { internal: boolean }) => item.internal)).toEqual([false, true]);
    expect(importJson[0].range).toEqual([0, 1]);
    expect(wallet.importText).toMatch(/^bitcoin-cli importdescriptors/u);
    expect(wallet.derivationDetails).toContain('supplied-order multi');
  });

  it('builds a ranged Dash P2SH watch-only import set and BIP67-sorted scripts', () => {
    const accounts = [31, 32, 33].map((value) => {
      const seed = new Uint8Array(32).fill(value);
      return HDKey.fromMasterSeed(seed, getDashNetwork('testnet').versions).derive("m/48'/5'/0'/0'");
    });
    const wallet = buildRangedWallet({
      chain: 'dash',
      network: 'testnet',
      required: 2,
      keyOrder: 'bip67',
      wrapper: 'p2wsh',
      accountXpubs: accounts.map((account, index) => `[${String(index + 1).repeat(8)}/48h/5h/0h/0h]${account.publicExtendedKey}`),
      branches: [0],
      startIndex: 0,
      endIndex: 0,
    });
    expect(wallet.descriptors[0]?.descriptor).toContain('sh(sortedmulti(2,');
    expect(wallet.rows).toHaveLength(1);
    expect(wallet.rows[0]?.address).toMatch(/^[78]/u);
    expect(wallet.rows[0]?.publicKeys).toEqual([...wallet.rows[0]!.publicKeys].sort((left, right) => left.localeCompare(right)));
    const importJson = JSON.parse(wallet.importJson);
    expect(importJson).toMatchObject({ method: 'importmulti' });
    expect(importJson.params[0]).toHaveLength(1);
    expect(importJson.params[0][0]).toMatchObject({ watchonly: true, redeemscript: wallet.rows[0]?.redeemScript });
    expect(wallet.importText).toMatch(/^dash-cli importmulti/u);
    expect(wallet.derivationDetails).toContain('BIP67 sortedmulti P2SH');
  });

  it('rejects mixed Dash Electrum legacy and Purpose48 account families', () => {
    const first = HDKey.fromMasterSeed(new Uint8Array(32).fill(41), getDashNetwork('mainnet').versions).derive("m/48'/5'/0'/0'");
    const second = HDKey.fromMasterSeed(new Uint8Array(32).fill(42), getDashNetwork('mainnet').versions).derive("m/45'/0");
    expect(() => buildRangedWallet({
      chain: 'dash',
      network: 'mainnet',
      required: 2,
      keyOrder: 'supplied',
      wrapper: 'p2sh',
      accountXpubs: [
        `[aaaaaaaa/48h/5h/0h/0h]${first.publicExtendedKey}`,
        `[bbbbbbbb/45h/0]${second.publicExtendedKey}`,
      ],
      branches: [0],
      startIndex: 0,
      endIndex: 0,
    })).toThrow(/mixed derivation paths/u);
  });

  it('places an absolute block lock before the multisig condition', () => {
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 1,
      publicKeys: ['0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'],
      lockKind: 'height',
      lockValue: 840_000,
      bitcoinWrapper: 'p2wsh',
    });
    expect(policyHex(policy).redeemScript).toMatch(/^0340d10cb17551/u);
    expect(policy.address).toMatch(/^tb1q/u);
  });

  it('builds and decodes a 4-of-5 or delayed recovery policy', () => {
    const keys = Array.from({ length: 5 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 1;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 4, publicKeys: keys,
      lockKind: 'relative-time', lockValue: 30 * 24 * 60 * 60,
      bitcoinWrapper: 'p2wsh', mode: 'delayed-recovery', recoveryPublicKey: keys[0]!,
    });
    const decoded = decodeScript(policyHex(policy).redeemScript, 'bitcoin', 'testnet', 'spending');
    expect(decoded.inferredPolicy).toContain('4-of-5 multisig immediately OR one recovery key');
    expect(decoded.inferredPolicy).toContain('relative delay 2592256 seconds');
    expect(decoded.wrappers.some((wrapper) => wrapper.address === policy.address)).toBe(true);
  });

  it('warns that Dash Core cannot automatically sign the custom recovery template', () => {
    const secrets = [1, 2, 3, 4].map((value) => { const secret = new Uint8Array(32); secret[31] = value; return bytesToHex(secp256k1.getPublicKey(secret, true)); });
    const policy = buildPolicy({
      chain: 'dash', network: 'mainnet', required: 2, publicKeys: secrets.slice(0, 3),
      lockKind: 'relative-blocks', lockValue: 20, bitcoinWrapper: 'p2sh',
      mode: 'delayed-recovery', recoveryPublicKey: secrets[3]!,
    });
    expect(policy.compatibility).toContain('ADVANCED CUSTOM DASH P2SH');
    expect(policy.compatibility).toContain('does not automatically satisfy');
  });
});
