import { buildCustomMiniscriptPolicy } from '../src/custom-miniscript.js';
import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { bytesToHex, hexToBytes, secp256k1 } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { decodeDescriptor, descriptorChecksum } from '../src/descriptor.js';
import { materializeDescriptorKey } from '../src/descriptor-key.js';
import { compilePolicyMiniscript, scriptFromMiniscriptAsm } from '../src/miniscript-engine.js';
import { buildCustomMiniscriptPolicy as buildDashDisabledCustomPolicy } from '../src/custom-miniscript-disabled.js';
import { analyzeMusigDescriptor } from '../src/musig-descriptor.js';
import { buildDashCoreImport } from '../src/dash-import.js';
import { buildConcreteMultisigWallet, buildRangedWallet, concreteDescriptor } from '../src/multisig-wallet.js';
import { buildPolicy, policyHex } from '../src/policy.js';
import { calculatePhrasePreimage } from '../src/preimage.js';
import { describeScript, pairName, pairSummary, parsePsbt, transactionId, validateMusigPsbtFields } from '../src/psbt.js';
import { decodeScript } from '../src/script.js';

const BIP174_CREATOR = '70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd750000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d0100000000ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000';
const DASH_CORE_DOCS_PSBT = 'cHNidP8BAEICAAAAAXgRxzbShUlivVFKgoLyhk0RCCYLZKCYTl/tYRd+yGImAAAAAAD/////AQAAAAAAAAAABmoEAAECAwAAAAAAAAA=';

describe('Bitcoin regtest address rendering', () => {
  it('uses bcrt for witness addresses while retaining testnet Base58 versions', () => {
    expect(describeScript(
      hexToBytes('0014d85c2b71d0060b09c9886aeb815e50991dda124d'),
      'bitcoin',
      'regtest',
    )).toEqual({
      type: 'P2WPKH',
      address: 'bcrt1qmpwzkuwsqc9snjvgdt4czhjsnywa5yjdqpxskv',
    });
  });
});
const BIP390_XPUBS = [
  'xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL',
  'xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y',
] as const;
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
  it('compiles the fixed Bitcoin Core P2WSH descriptor into concrete Bitcoin data', () => {
    const descriptor = decodeDescriptor("wsh(or\\_d(pk(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd),and\\_v(v:pk(02e8a3647fe4637f85c3f80c101a995803c78e674f8a644281b3ae0bcc8e215833),older(12960))))#80auchz3");
    expect(descriptor.ranged).toBe(false);
    expect(descriptor.compiledOutput).not.toBeNull();
    expect(descriptor.compiledOutput?.asm).toBe('<03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd> OP_CHECKSIG OP_IFDUP OP_NOTIF <02e8a3647fe4637f85c3f80c101a995803c78e674f8a644281b3ae0bcc8e215833> OP_CHECKSIGVERIFY 12960 OP_CHECKSEQUENCEVERIFY OP_ENDIF');
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'Output type', value: 'P2WSH' });
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'Witness version', value: '0' });
    expect(descriptor.compiledOutput?.rows.find(({ label }) => label === 'Address')?.value).toMatch(/^bc1q/u);
    expect(descriptor.rows).toContainEqual({ label: 'Timelock 1 · BIPs', value: 'BIP68 / BIP112' });
  });

  it('preserves multi() key order in the supplied Bitcoin Core HTLC descriptor', () => {
    const descriptor = decodeDescriptor("wsh(andor(multi(2,027101801304e1234cc63f9ae91ea80a9294d7d75698fa91a75aa6e5f53f8e36d8,0363b9c9dfba51eddafa5543c933b95d41a7728bac28092421041e12333d84141e,03823b578b6939d8f5630b47fc926a4ce8509fbf7e316986c01e472ff7c89f73cb,03d48029d1c69b80ab1a64569d5a2f723d199deb5f726430cf87a866e1f483e344),sha256(cd1f86da4707fec85bc96eda89192fef14544ed958c868c6c90d5737defdd03b),and_v(v:older(111),pk(02258412c78be9e41bcce2e55e8deff552809d50da26de805ec052519830da0f86))))#9a5ghnf0");
    expect(descriptor.rows).toContainEqual({ label: 'Multisig 1 · key order', value: 'Supplied order preserved · multi()' });
    expect(descriptor.compiledOutput?.asm).toContain('OP_NOTIF 111 OP_CHECKSEQUENCEVERIFY');
    expect(descriptor.compiledOutput?.asm).toContain('OP_SIZE 32 OP_EQUALVERIFY');
    expect(descriptor.compiledOutput?.rows).toContainEqual({
      label: 'Witness script',
      value: '5221027101801304e1234cc63f9ae91ea80a9294d7d75698fa91a75aa6e5f53f8e36d8210363b9c9dfba51eddafa5543c933b95d41a7728bac28092421041e12333d84141e2103823b578b6939d8f5630b47fc926a4ce8509fbf7e316986c01e472ff7c89f73cb2103d48029d1c69b80ab1a64569d5a2f723d199deb5f726430cf87a866e1f483e34454ae64016fb2692102258412c78be9e41bcce2e55e8deff552809d50da26de805ec052519830da0f86ac6782012088a820cd1f86da4707fec85bc96eda89192fef14544ed958c868c6c90d5737defdd03b8768',
    });
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'scriptPubKey', value: '00209ef2009ca41ef41fb85141aca8b6d3275bd4966fdc20f8624c7568ec152b5337' });
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'Address', value: 'bc1qnmeqp89yrm6plwz3gxk23dknyadaf9n0mss0scjvw45wc9ft2vms4v4hea' });
  });

  it.each([
    ['BIP-381 compressed pk', 'pk(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd)', '2103a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bdac'],
    ['BIP-381 uncompressed pk', 'pk(04a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea235)', '4104a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea235ac'],
    ['BIP-381 origin pkh', "pkh([deadbeef/1/2'/3/4']03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd)", '76a9149a1c78a507689f6f54b847ad1cef1e614ee23f1e88ac'],
    ['BIP-381 sh(pk)', 'sh(pk(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd))', 'a9141857af51a5e516552b3086430fd8ce55f7c1a52487'],
    ['BIP-381 sh(pkh)', 'sh(pkh(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd))', 'a9141a31ad23bf49c247dd531a623c2ef57da3c400c587'],
    ['BIP-382 wpkh', 'wpkh(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd)', '00149a1c78a507689f6f54b847ad1cef1e614ee23f1e'],
    ['BIP-382 wsh(pk)', 'wsh(pk(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd))', '00202e271faa2325c199d25d22e1ead982e45b64eeb4f31e73dbdf41bd4b5fec23fa'],
    ['BIP-382 wsh(pkh)', 'wsh(pkh(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd))', '0020338e023079b91c58571b20e602d7805fb808c22473cbc391a41b1bd3a192e75b'],
    ['BIP-383 multi', 'multi(1,03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd,04a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea235)', '512103a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd4104a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea23552ae'],
    ['BIP-383 sortedmulti', 'sortedmulti(1,04a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea235,03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd)', '512103a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd4104a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea23552ae'],
    ['BIP-385 raw', 'raw(deadbeef)', 'deadbeef'],
    ['Bitcoin Core rawtr', 'rawtr(a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd)', '5120a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd'],
  ])('matches the official %s scriptPubKey vector', (_name, source, expectedScriptPubKey) => {
    const descriptor = decodeDescriptor(source);
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'scriptPubKey', value: expectedScriptPubKey });
  });

  it.each([
    'raw(deadbeef)#',
    'raw(deadbeef)#89f8spxmx',
    'raw(deadbeef)#89f8spx',
    'raw(deedbeef)#89f8spxm',
    'raw(deedbeef)##9f8spxm',
    'raw(Ü)#00000000',
  ])('rejects the official invalid BIP-380 checksum vector %s', (source) => {
    expect(() => decodeDescriptor(source)).toThrow(/(?:Invalid descriptor checksum|unsupported character)/u);
  });

  it('matches the official ranged BIP-382 wpkh outputs', () => {
    const source = "wpkh([ffffffff/13']xpub69H7F5d8KSRgmmdJg2KhpAK8SR3DjMwAdkxj3ZuxV27CprR9LgpeyGmXUbC6wb7ERfvrnKZjXoUmmDznezpbZb7ap6r1D3tgFxHmwMkQTPH/1/2/*)";
    const expected = [
      '0014326b2249e3a25d5dc60935f044ee835d090ba859',
      '0014af0bd98abc2f2cae66e36896a39ffe2d32984fb7',
      '00141fa798efd1cbf95cebf912c031b8a4a6e9fb9f27',
    ];
    expected.forEach((scriptPubKey, wildcardIndex) => {
      expect(decodeDescriptor(source, { wildcardIndex }).compiledOutput?.rows).toContainEqual({ label: 'scriptPubKey', value: scriptPubKey });
    });
  });

  it('distinguishes decoder validation failures and non-standard valid Script', () => {
    const key = '03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd';
    expect(() => decodeDescriptor(`wsh(pk(${key}))#aaaaaaaa`)).toThrow(/Invalid descriptor checksum/u);
    expect(() => decodeDescriptor(`wsh(pk(02${'ff'.repeat(32)}))`)).toThrow(/Invalid public key/u);
    expect(() => decodeDescriptor('wsh(pk(xpub123))')).toThrow(/Invalid xpub/u);
    expect(() => decodeDescriptor(`wsh(and_v(pk(${key}),1))`)).toThrow(/Invalid Miniscript type/u);
    expect(() => decodeDescriptor(`wsh(vv:pk(${key}))`)).toThrow(/Invalid wrapper combination/u);
    expect(() => decodeDescriptor(`wsh(unknown_fragment(${key}))`)).toThrow(/Unsupported top-level Miniscript/u);
    expect(() => decodeDescriptor('wsh(older(0))')).toThrow(/Invalid timelock/u);
    expect(() => decodeDescriptor('raw(abc)')).toThrow(/odd-length hex/u);
    expect(() => decodeDescriptor('raw(asdf)')).toThrow(/Malformed Script hex/u);
    expect(() => decodeScript('abc', 'bitcoin', 'mainnet', 'spending')).toThrow(/odd-length hex/u);
    expect(() => decodeScript('4c', 'bitcoin', 'mainnet', 'spending')).toThrow(/Malformed Script/u);
    const unknown = decodeScript('ff', 'bitcoin', 'mainnet', 'script-pubkey');
    expect(unknown.classification).toBe('Non-standard / unrecognized');
    expect(unknown.operations[0]?.name).toBe('OP_UNKNOWN_0xff');
  });

  it('serializes the alternate-stack and boolean-normalization opcodes emitted by Miniscript wrappers', () => {
    expect(bytesToHex(scriptFromMiniscriptAsm('OP_TOALTSTACK OP_FROMALTSTACK OP_0NOTEQUAL'))).toBe('6b6c92');
    const decoded = decodeScript('6b6c92', 'bitcoin', 'mainnet', 'spending');
    expect(decoded.operations.map(({ name }) => name)).toEqual(['OP_TOALTSTACK', 'OP_FROMALTSTACK', 'OP_0NOTEQUAL']);
    expect(decoded.operations.every(({ meaning }) => !meaning.includes('unknown'))).toBe(true);
  });

  it('explains constants and wrapper identities in a Miniscript descriptor', () => {
    const key = bytesToHex(secp256k1.getPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index === 31 ? 1 : 0), true));
    const descriptor = decodeDescriptor(`wsh(or_i(0,jn:pk(${key})))`);
    expect(descriptor.spendingPaths[0]).toContain('an impossible branch');
    expect(descriptor.rows).toContainEqual({ label: 'Wrapper j:', value: expect.stringContaining('non-empty') });
    expect(descriptor.rows).toContainEqual({ label: 'Wrapper n:', value: expect.stringContaining('canonical true or false') });
  });

  it('compiles every opcode family used by the documented Miniscript semantics', () => {
    const keys = [1, 2, 3].map((value) => {
      const secret = new Uint8Array(32); secret[31] = value;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const [key, secondKey, thirdKey] = keys as [string, string, string];
    const fragments = [
      '0',
      '1',
      `pk_k(${key})`,
      `pk_h(${key})`,
      `pk(${key})`,
      `pkh(${key})`,
      'older(144)',
      'after(500000)',
      `sha256(${'00'.repeat(32)})`,
      `hash256(${'00'.repeat(32)})`,
      `ripemd160(${'00'.repeat(20)})`,
      `hash160(${'00'.repeat(20)})`,
      `a:pk(${key})`,
      `j:pk(${key})`,
      `n:pk(${key})`,
      `l:pk(${key})`,
      `u:pk(${key})`,
      `s:pk(${key})`,
      `c:pk_k(${key})`,
      `t:v:pk(${key})`,
      'd:v:older(144)',
      `v:pk(${key})`,
      `andor(pk(${key}),pk(${secondKey}),pk(${thirdKey}))`,
      `and_v(v:pk(${key}),pk(${secondKey}))`,
      `and_b(pk(${key}),s:pk(${secondKey}))`,
      `and_n(pk(${key}),pk(${secondKey}))`,
      `or_b(pk(${key}),s:pk(${secondKey}))`,
      `or_c(pk(${key}),v:pk(${secondKey}))`,
      `or_d(pk(${key}),pk(${secondKey}))`,
      `or_i(pk(${key}),pk(${secondKey}))`,
      `thresh(2,pk(${key}),s:pk(${secondKey}),s:pk(${thirdKey}))`,
      `multi(2,${key},${secondKey},${thirdKey})`,
    ];
    for (const fragment of fragments) expect(() => compilePolicyMiniscript(fragment)).not.toThrow();
  });

  it('builds custom Bitcoin P2WSH and Tapscript policies through pinned libraries', () => {
    const compressed = [1, 2].map((value) => {
      const secret = new Uint8Array(32); secret[31] = value;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const p2wsh = buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 1, publicKeys: [],
      lockKind: 'none', lockValue: 0, bitcoinWrapper: 'p2wsh',
      mode: 'custom-miniscript',
      customContext: 'p2wsh',
      customMiniscript: `and_v(v:pk(${compressed[0]}),or_i(pk(${compressed[1]}),older(144)))`,
    });
    expect(p2wsh.address).toMatch(/^tb1q/u);
    expect(p2wsh.descriptor).toContain('wsh(and_v(');

    const tapscript = buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 1, publicKeys: [],
      lockKind: 'none', lockValue: 0, bitcoinWrapper: 'p2wsh',
      mode: 'custom-miniscript',
      customContext: 'tapscript',
      customMiniscript: `multi_a(2,${compressed[0]!.slice(2)},${compressed[1]!.slice(2)})`,
    });
    expect(tapscript.address).toMatch(/^tb1p/u);
    expect(tapscript.descriptor).toContain('tr(');
    expect(tapscript.miniscriptAsm).toContain('OP_CHECKSIGADD');
    expect(() => compilePolicyMiniscript(`multi_a(1,${compressed[0]!.slice(2)})`)).toThrow(/invalid/iu);
    expect(() => compilePolicyMiniscript(`multi(1,${compressed[0]})`, { tapscript: true })).toThrow(/invalid/iu);
    expect(() => buildDashDisabledCustomPolicy('', 'p2wsh', 'mainnet')).toThrow(/unavailable in the Dash Community build/u);
  });

  it('exports a full Dash Core v21 descriptor plus explicit legacy and address fallbacks', () => {
    const payload = 'sh(sortedmulti(1,02a607f5d60a500fe36478f510fd6121addddbd0aff20bdb019609abfaba7503a9))';
    const descriptor = `${payload}#${descriptorChecksum(payload)}`;
    const exported = buildDashCoreImport('7WfjqozJ8GGMLEo5Hoh8jvBSpFk29PrqjR', '51', descriptor);
    expect(exported.legacyCommand).toContain('dash-cli importmulti');
    expect(exported.legacyCommand).toContain(`"redeemscript":"51"`);
    expect(exported.fullPolicyGuiCommand).toMatch(/^importdescriptors /u);
    expect(exported.fullPolicyGuiCommand).toContain(descriptor);
    expect(exported.addressFallbackGuiCommand).toContain('addr(7WfjqozJ8GGMLEo5Hoh8jvBSpFk29PrqjR)#xzphyxv5');
    expect(JSON.parse(exported.rpcJson)).toMatchObject({
      method: 'importdescriptors',
      params: [[{ desc: descriptor, timestamp: 'now', active: false, internal: false }]],
    });
  });

  it('treats descriptor spaces as checksum-significant and rejects whitespace grammar', () => {
    const spaced = 'raw( deadbeef )';
    const compactChecksum = descriptorChecksum('raw(deadbeef)');
    const spacedChecksum = descriptorChecksum(spaced);
    expect(spacedChecksum).not.toBe(compactChecksum);
    expect(() => decodeDescriptor(`${spaced}#${compactChecksum}`)).toThrow(/checksum/u);
    expect(() => decodeDescriptor(`${spaced}#${spacedChecksum}`)).toThrow(/Whitespace is not permitted/u);
  });

  it('makes an older() value whose BIP68 delay mask is zero explicit', () => {
    const decoded = decodeDescriptor('wsh(older(65536))');
    expect(decoded.rows).toContainEqual({
      label: 'Timelock 1 · effective constraint',
      value: 'None · BIP68 masks this value to a zero delay; reserved bits do not add a lock.',
    });
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

  it('summarizes a Liana-style ranged wsh recovery descriptor with multipath xpubs', () => {
    const source = "wsh(or_d(pk([b858ac92/48'/0'/0'/2']xpub6F1ALsbhCSqezWHVcht6PavEiuqdQg3uUv7zqtcBr2zk23Pn71FUaKYkB5QBZtv5jEpnv3RF4nQ2T7HhDg6KdWuZSZQ426y5Fbvx2Gid5uN/<0;1>/*),and_v(v:pkh([b858ac92/48'/0'/0'/2']xpub6F1ALsbhCSqezWHVcht6PavEiuqdQg3uUv7zqtcBr2zk23Pn71FUaKYkB5QBZtv5jEpnv3RF4nQ2T7HhDg6KdWuZSZQ426y5Fbvx2Gid5uN/<2;3>/*),older(52596))))#txcsn82w";
    const descriptor = decodeDescriptor(source);
    expect(descriptor.classification).toBe('wsh output descriptor');
    expect(descriptor.spendingPaths[0]).toContain('wsh wrapper');
    expect(descriptor.spendingPaths[0]).toContain('one signature from fingerprint b858ac92');
    expect(descriptor.spendingPaths[0]).toContain('/<0;1>/*');
    expect(descriptor.spendingPaths[0]).toContain('/<2;3>/*');
    expect(descriptor.spendingPaths[0]).toContain('relative timelock 52596 = 52596 blocks');
    expect(descriptor.pathCards).toHaveLength(2);
    expect(descriptor.pathCards[0]).toMatchObject({ title: 'Path 1', availability: 'Immediate' });
    expect(descriptor.pathCards[1]?.availability).toContain('52596 blocks');
    expect(descriptor.policyTree.join('\n')).toContain('wsh wrapper');
    expect(descriptor.policyTree.join('\n')).toContain('OR (or_d)');
    expect(descriptor.rows).toContainEqual({ label: 'Relative lock 1', value: '52596 = 52596 blocks' });
    expect(descriptor.rows).toContainEqual({
      label: 'Miniscript analysis',
      value: 'sane · non-malleable satisfactions available · signature required · compatible timelock units · no duplicate keys',
    });
    expect(descriptor.compiledOutput?.rows).toContainEqual({ label: 'Output type', value: 'P2WSH' });
    const change = decodeDescriptor(source, { multipathChoice: 1, wildcardIndex: 17 });
    expect(change.compiledOutput?.rows.find(({ label }) => label === 'Address')?.value)
      .not.toBe(descriptor.compiledOutput?.rows.find(({ label }) => label === 'Address')?.value);
    expect(change.rows).toContainEqual({ label: 'Key 1 · selected branch / index', value: '1 / 17' });
  });

  it('summarizes a Bitcoin Core MuSig2 Taproot descriptor', () => {
    const descriptor = decodeDescriptor('tr(musig(xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL,xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y)/0/*)');
    expect(descriptor.summary).toContain('MuSig2 aggregate key');
    expect(descriptor.spendingPaths[0]).toContain('MuSig2 aggregate key from 2 participants');
    expect(descriptor.spendingPaths[0]).toContain('aggregate Schnorr signature');
    expect(descriptor.policyTree.join('\n')).toContain('musig: aggregate 2 keys');
    expect(descriptor.rows).toContainEqual({
      label: 'Derived output script',
      value: '51209bdc6ac2e0a7612dfd8d5fbb18e5a3041c5ebb58f3ddfa9a857b77a2f2bc697c',
    });
  });

  it('matches the official BIP-328/BIP-390 synthetic aggregate-xpub vectors', () => {
    const descriptor = `rawtr(musig(${BIP390_XPUBS.join(',')})/0/*)`;
    const expectedScripts = [
      '51209508c08832f3bb9d5e8baf8cb5cfa3669902e2f2da19acea63ff47b93faa9bfc',
      '51205ca1102663025a83dd9b5dbc214762c5a6309af00d48167d2d6483808525a298',
      '51207dbed1b89c338df6a1ae137f133a19cae6e03d481196ee6f1a5c7d1aeb56b166',
    ];
    expectedScripts.forEach((outputScript, wildcardIndex) => {
      expect(analyzeMusigDescriptor(descriptor, 'mainnet', wildcardIndex)?.outputScript).toBe(outputScript);
    });
  });

  it('rejects invalid BIP-390 placement and mixed derivation modes', () => {
    expect(() => decodeDescriptor(`wsh(pk(musig(${BIP390_XPUBS.join(',')})))`)).toThrow(/permitted only inside/u);
    expect(() => decodeDescriptor(`rawtr(musig(${BIP390_XPUBS[0]}/0/*,${BIP390_XPUBS[1]})/0/*)`)).toThrow(/does not allow participant wildcard/u);
    expect(() => decodeDescriptor(`rawtr(musig(${BIP390_XPUBS.join(',')})/0'/0)`)).toThrow(/cannot contain hardened/u);
    expect(() => decodeDescriptor(`rawtr(musig(${BIP390_XPUBS.join(',')})/*/*)`)).toThrow(/at most one final wildcard/u);
    expect(() => decodeDescriptor(`rawtr(musig(${BIP390_XPUBS.join(',')}):1)`)).toThrow(/Unexpected MuSig2 key suffix/u);
  });

  it('supports BIP-390 singleton aggregation and participant-level wildcard derivation', () => {
    const singleton = analyzeMusigDescriptor(`rawtr(musig(${DASH_CORE_BIP67_VECTORS[0].keys[0]}))`, 'mainnet', 0);
    expect(singleton?.keys[0]?.participantCount).toBe(1);
    const participantDerived = analyzeMusigDescriptor(`rawtr(musig(${BIP390_XPUBS[0]}/0/*,${BIP390_XPUBS[1]}/0/*))`, 'mainnet', 2);
    expect(participantDerived?.outputScript).toMatch(/^5120[0-9a-f]{64}$/u);
    expect(participantDerived?.keys[0]?.syntheticXpub).toBeNull();
  });

  it('counts a musig() expression as one multi_a signing key', () => {
    const internal = DASH_CORE_BIP67_VECTORS[0].keys[0];
    const descriptor = decodeDescriptor(`tr(${internal},multi_a(1,musig(${DASH_CORE_BIP67_VECTORS[0].keys.join(',')})))`);
    expect(descriptor.spendingPaths[1]).toContain('1-of-1 signatures');
    expect(descriptor.spendingPaths[1]).toContain('MuSig2 aggregate key from 2 participants');
  });

  it('inspects a BIP-390 musig() key inside a Silent Payments descriptor without inventing an address', () => {
    const analysis = analyzeMusigDescriptor(`sp(${BIP390_XPUBS[0]},musig(${BIP390_XPUBS.join(',')}))`, 'mainnet', 0);
    expect(analysis?.keys).toHaveLength(1);
    expect(analysis?.outputScript).toBeNull();
    expect(decodeDescriptor(`sp(${BIP390_XPUBS[0]},musig(${BIP390_XPUBS.join(',')}))`).classification).toBe('BIP-352 Silent Payments descriptor');
  });

  it('names and explains BIP-373 MuSig2 PSBT fields', () => {
    const aggregate = Uint8Array.from(Buffer.from(DASH_CORE_BIP67_VECTORS[0].keys[0], 'hex'));
    const participants = Uint8Array.from([...aggregate, ...aggregate]);
    expect(pairName('input', 0x1an)).toBe('MuSig2 participant public keys');
    expect(pairName('input', 0x1bn)).toBe('MuSig2 public nonce');
    expect(pairName('input', 0x1cn)).toBe('MuSig2 partial signature');
    expect(pairName('output', 0x08n)).toBe('MuSig2 participant public keys');
    expect(pairSummary('input', { type: 0x1an, keyData: aggregate, value: participants })).toContain('2 compressed participant');
    expect(() => validateMusigPsbtFields([{ type: 0x1an, keyData: aggregate.slice(1), value: participants }], 'input')).toThrow(/33-byte compressed/u);
    expect(() => validateMusigPsbtFields([{ type: 0x1bn, keyData: participants, value: new Uint8Array(65) }], 'input')).toThrow(/exactly 66 bytes/u);
    expect(() => validateMusigPsbtFields([{ type: 0x1cn, keyData: participants, value: new Uint8Array(31) }], 'input')).toThrow(/exactly 32 bytes/u);
  });

  it('derives an exact 32-byte phrase preimage and commitments with Noble hashes', () => {
    const calculated = calculatePhrasePreimage('hello');
    expect(calculated.rawUtf8Hex).toBe('68656c6c6f');
    expect(calculated.preimageHex).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(calculated.commitments.sha256).toBe('9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50');
    expect(calculated.normalization).toContain('5 bytes');
    expect(() => calculatePhrasePreimage('')).toThrow(/Enter a phrase/u);
  });

  it('decodes HTLC-like hashlock and timelocked fallback paths', () => {
    const descriptor = decodeDescriptor(`wsh(andor(pk(${DASH_CORE_BIP67_VECTORS[0].keys[0]}),sha256(9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50),and_v(v:pk(${DASH_CORE_BIP67_VECTORS[0].keys[1]}),older(144))))`);
    expect(descriptor.summary).toContain('1 preimage/hashlock condition');
    expect(descriptor.pathCards).toHaveLength(2);
    expect(descriptor.pathCards[0]?.preimages[0]).toContain('32-byte preimage');
    expect(descriptor.pathCards[0]?.locks).toHaveLength(0);
    expect(descriptor.pathCards[1]?.preimages).toHaveLength(0);
    expect(descriptor.pathCards[1]?.locks).toContain('relative 144 = 144 blocks');
    expect(descriptor.rows).toContainEqual({
      label: 'HTLC-like structure',
      value: 'One branch spends with a 32-byte hash preimage; an alternative branch spends after a timelock. Required signatures are listed separately for each path.',
    });
    expect(() => decodeDescriptor(`wsh(sha256(00))`)).toThrow(/exactly 32 digest bytes/u);
  });

  it('builds an HTLC-like policy through the Miniscript compiler', () => {
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 1,
      publicKeys: [DASH_CORE_BIP67_VECTORS[0].keys[0]],
      keyOrder: 'supplied',
      lockKind: 'relative-blocks',
      lockValue: 144,
      bitcoinWrapper: 'p2wsh',
      mode: 'htlc',
      recoveryPublicKeys: [DASH_CORE_BIP67_VECTORS[0].keys[1]],
      recoveryRequired: 1,
      hashKind: 'sha256',
      hashDigest: '9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50',
    });
    expect(policy.miniscript).toBe(`andor(pk(${DASH_CORE_BIP67_VECTORS[0].keys[0]}),sha256(9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50),and_v(v:older(144),pk(${DASH_CORE_BIP67_VECTORS[0].keys[1]})))`);
    expect(policy.descriptor).toMatch(/^wsh\(andor\(/u);
    expect(policy.spendingRequirement).toContain('exact 32-byte sha256 preimage');
    expect(policy.miniscriptAsm).toContain('OP_SHA256');
    expect(policyHex(policy).scriptPubKey).toMatch(/^0020[0-9a-f]{64}$/u);
  });

  it('builds the exact staged key-recovery shape through the Miniscript compiler', () => {
    const keys = [1, 2, 3].map((value) => {
      const secret = new Uint8Array(32);
      secret[31] = value;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'mainnet',
      required: 1,
      publicKeys: [keys[0]!],
      keyOrder: 'supplied',
      lockKind: 'relative-blocks',
      lockValue: 12_960,
      bitcoinWrapper: 'p2wsh',
      mode: 'staged-recovery',
      recoveryPublicKeys: [keys[1]!],
      secondLockKind: 'relative-blocks',
      secondLockValue: 52_560,
      emergencyPublicKeys: [keys[2]!],
    });
    expect(policy.miniscript).toBe(`or_d(pk(${keys[0]}),or_i(and_v(v:pkh(${keys[1]}),older(12960)),and_v(v:pkh(${keys[2]}),older(52560))))`);
    expect(policy.descriptor).toMatch(/^wsh\(or_d\(/u);
    expect(policy.miniscriptAsm).toContain('OP_CHECKSEQUENCEVERIFY');
    expect(policy.spendingRequirement).toContain('second recovery key');
  });

  it('normalizes escaped underscores and wildcards in staged ranged descriptors', () => {
    const descriptor = decodeDescriptor(`wsh(or\\_d(pk([deadbeef/48'/0'/0'/2']${BIP390_XPUBS[0]}/<0;1>/\\*),or\\_i(and\\_v(v:pkh([cafebabe/48'/0'/1'/2']${BIP390_XPUBS[1]}/<0;1>/\\*),older(12960)),and\\_v(v:pkh([01020304/48'/0'/2'/2']${BIP390_XPUBS[0]}/<0;1>/\\*),older(52560)))))`);
    expect(descriptor.ranged).toBe(true);
    expect(descriptor.pathCards).toHaveLength(3);
    expect(descriptor.pathCards.map(({ availability }) => availability)).toEqual([
      'Immediate',
      'After relative 12960 = 12960 blocks',
      'After relative 52560 = 52560 blocks',
    ]);
  });

  it('keeps Dash descriptor inspection on legacy Script and rejects Bitcoin-only wrappers', () => {
    const key = DASH_CORE_BIP67_VECTORS[0].keys[0];
    const legacy = decodeDescriptor(`sh(and_v(v:pk(${key}),sha256(9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50)))`, { chain: 'dash' });
    expect(legacy.classification).toBe('sh output descriptor');
    expect(legacy.rows).toContainEqual({
      label: 'Hashlock 1',
      value: 'SHA-256 digest 9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50 · spending requires the exact 32-byte preimage',
    });
    expect(() => decodeDescriptor(`wsh(pk(${key}))`, { chain: 'dash' })).toThrow(/SegWit, Taproot, and MuSig2 are unavailable/u);
    expect(() => decodeDescriptor(`tr(${key})`, { chain: 'dash' })).toThrow(/SegWit, Taproot, and MuSig2 are unavailable/u);
    expect(pairName('input', 0x1an, 'dash')).toBe('Unknown/unsupported Dash field 26');
  });

  it('derives staged ranged descriptor keys with Scure BIP32 and preserves the ranged export', () => {
    const primaryExpression = `[deadbeef/48'/0'/0'/2']${BIP390_XPUBS[0]}/<0;1>/*`;
    const recoveryExpression = `[cafebabe/48'/0'/1'/2']${BIP390_XPUBS[1]}/<0;1>/*`;
    const emergencyExpression = `[01020304/48'/0'/2'/2']${BIP390_XPUBS[0]}/<0;1>/*`;
    const derived = [primaryExpression, recoveryExpression, emergencyExpression]
      .map((key) => materializeDescriptorKey(key, 'mainnet', 1, 2));
    expect(derived).toEqual([
      '02cc9fd211dc0a1c8bb7a106ff831be0e253bc992f21d08fb8a6fd43fae51b9b89',
      '03071306d15f4e0df2b9aeaf96a3c857f2de28d6b49ccdc8f8012789fa8f74439b',
      '02cc9fd211dc0a1c8bb7a106ff831be0e253bc992f21d08fb8a6fd43fae51b9b89',
    ]);
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'mainnet',
      required: 1,
      publicKeys: [derived[0]!],
      keyOrder: 'supplied',
      lockKind: 'relative-blocks',
      lockValue: 144,
      bitcoinWrapper: 'p2wsh',
      mode: 'staged-recovery',
      recoveryPublicKeys: [derived[1]!],
      secondLockKind: 'relative-blocks',
      secondLockValue: 288,
      emergencyPublicKeys: [derived[2]!],
      stagedDescriptorKeys: {
        primary: primaryExpression,
        recovery: recoveryExpression,
        emergency: emergencyExpression,
      },
    });
    expect(policy.descriptor).toContain(`${BIP390_XPUBS[0]}/<0;1>/*`);
    expect(policy.descriptor).toMatch(/^wsh\(or_d\(.+\)#[a-z0-9]{8}$/u);
    expect(policyHex(policy).scriptPubKey).toMatch(/^0020[0-9a-f]{64}$/u);
  });

  it('keeps andor path cards from dropping the required condition branch', () => {
    const descriptor = decodeDescriptor('wsh(andor(pk([aaaaaaaa/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*),pk([bbbbbbbb/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*),pk([cccccccc/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*)))');
    expect(descriptor.pathCards).toHaveLength(2);
    expect(descriptor.pathCards[0]?.requirement).toContain('fingerprint aaaaaaaa');
    expect(descriptor.pathCards[0]?.requirement).toContain('fingerprint bbbbbbbb');
    expect(descriptor.pathCards[1]?.requirement).toContain('fingerprint cccccccc');
  });

  it('keeps nested delayed alternatives separate in descriptor path cards', () => {
    const descriptor = decodeDescriptor('wsh(or_d(pk([aaaaaaaa/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*),or_i(and_v(v:pk([bbbbbbbb/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*),older(144)),and_v(v:pk([cccccccc/48h/0h/0h/2h]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/0/*),older(288)))))');
    expect(descriptor.pathCards).toHaveLength(3);
    expect(descriptor.pathCards.map((card) => card.availability)).toEqual([
      'Immediate',
      'After relative 144 = 144 blocks',
      'After relative 288 = 288 blocks',
    ]);
  });

  it('limits descriptor path-card expansion for combinatorial policies', () => {
    const left = 'pk(02ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f8)';
    const right = 'pk(02fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f)';
    let expression = `or_i(${left},${right})`;
    for (let index = 0; index < 7; index += 1) expression = `and_v(v:${expression},or_i(${left},${right}))`;
    const descriptor = decodeDescriptor(`wsh(${expression})`);
    expect(descriptor.pathCards).toHaveLength(1);
    expect(descriptor.pathCards[0]?.availability).toBe('Too many alternatives to enumerate safely');
    expect(descriptor.policyTree.length).toBeGreaterThan(1);
  });

  it('decodes the BIP174 creator vector and its outputs', () => {
    const parsed = parsePsbt(BIP174_CREATOR, 'bitcoin');
    expect(parsed.version).toBe(0);
    expect(parsed.inputs).toHaveLength(2);
    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputValues).toEqual([149_990_000n, 100_000_000n]);
    expect(parsed.fee).toBeNull();
    expect(parsed.transaction?.raw).toHaveLength(154);
    expect(transactionId(parsed.transaction!.raw)).toBe('82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617b');
    const output = parsed.transaction?.outputs[0];
    expect(output).toBeDefined();
    expect(describeScript(output!.script, 'bitcoin', 'mainnet')).toMatchObject({
      type: 'P2WPKH',
      address: 'bc1qmpwzkuwsqc9snjvgdt4czhjsnywa5yjdgwyw6k',
    });

    expect(decodeScript(bytesToHex(output!.script), 'bitcoin', 'mainnet', 'script-pubkey').asm)
      .toBe('OP_0 d85c2b71d0060b09c9886aeb815e50991dda124d');
  });

  it('separates a BIP32 master fingerprint from its derivation path', () => {
    expect(pairSummary('input', {
      type: 0x06n,
      keyData: new Uint8Array(33),
      value: hexToBytes('b4a6ba67000000800000008004000080'),
    })).toBe("Master fingerprint b4a6ba67 · path m/0'/0'/4'");
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
    expect(policy.compatibility).toContain('watch-only by itself');
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
    const dashDescriptor = concreteDescriptor('dash', 'p2sh', 2, keys, 'bip67');
    const decoded = decodeDescriptor(dashDescriptor, { chain: 'dash', network: 'mainnet' });
    expect(decoded.classification).toContain('sh output descriptor');
    expect(decoded.compiledOutput?.rows.some(({ label, value }) => label === 'Address' && value.startsWith('7'))).toBe(true);
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
    expect(wallet.importText).toMatch(/^dash-cli importdescriptors/u);
    expect(JSON.parse(wallet.importJson)).toMatchObject({ method: 'importdescriptors' });
    expect(wallet.orderedPublicKeys).toEqual(keys);
    expect(wallet.derivationDetails).toContain('child public key supplied directly');
  });

  it('builds one concrete multisig address directly from account xpubs at a selected suffix', () => {
    const accounts = [51, 52].map((value) => {
      const seed = new Uint8Array(32).fill(value);
      return HDKey.fromMasterSeed(seed).derive("m/48'/5'/0'/0'");
    });
    const xpubs = accounts.map((account, index) => `[${index === 0 ? 'aaaaaaaa' : 'bbbbbbbb'}/48h/5h/0h/0h]${account.publicExtendedKey}`);
    const concrete = buildConcreteMultisigWallet({
      chain: 'dash',
      network: 'mainnet',
      required: 2,
      keyOrder: 'bip67',
      wrapper: 'p2sh',
      publicKeys: xpubs,
      branch: 0,
      index: 3,
    });
    const ranged = buildRangedWallet({
      chain: 'dash',
      network: 'mainnet',
      required: 2,
      keyOrder: 'bip67',
      wrapper: 'p2sh',
      accountXpubs: xpubs,
      branches: [0],
      startIndex: 3,
      endIndex: 3,
    });
    expect(concrete.address).toBe(ranged.rows[0]?.address);
    expect(concrete.redeemScript).toBe(ranged.rows[0]?.redeemScript);
    expect(concrete.derivationDetails).toContain('account xpub -> /0/3');
  });

  it('still rejects xpubs in the low-level concrete public-key-only policy builder', () => {
    expect(() => buildPolicy({
      chain: 'dash',
      network: 'mainnet',
      required: 1,
      publicKeys: ['xpub6EHhWk3orDvW8dgKQVfpFCV1WSY2iqmNxkNYQRA76Sp4X3rD3kfSf6Bp6PsCHcTV4vZWGZDDRXs6UhX9HCwFxK8poPZP1GLAdHqVns5NtWj'],
      lockKind: 'none',
      lockValue: 0,
      bitcoinWrapper: 'p2sh',
    })).toThrow(/account xpub, not a compressed child public key/u);
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
    expect(importJson).toMatchObject({ method: 'importdescriptors' });
    expect(importJson.params[0]).toHaveLength(1);
    expect(importJson.params[0][0]).toMatchObject({
      desc: wallet.descriptors[0]?.descriptor,
      range: [0, 0],
      next_index: 0,
      active: false,
      internal: false,
    });
    expect(wallet.importText).toMatch(/^dash-cli importdescriptors/u);
    expect(wallet.derivationDetails).toContain('BIP67 sortedmulti P2SH');
  });

  it('explains mainnet xpub versus testnet tpub mismatches', () => {
    const account = HDKey.fromMasterSeed(new Uint8Array(32).fill(61), getDashNetwork('mainnet').versions).derive("m/48'/5'/0'/0'");
    expect(() => buildRangedWallet({
      chain: 'dash',
      network: 'testnet',
      required: 1,
      keyOrder: 'bip67',
      wrapper: 'p2sh',
      accountXpubs: [account.publicExtendedKey],
      branches: [0],
      startIndex: 0,
      endIndex: 0,
    })).toThrow(/mainnet xpub/u);
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
    expect(policyHex(policy).redeemScript).toMatch(/^0340d10cb16951/u);
    expect(policy.address).toMatch(/^tb1q/u);
  });

  it('uses minimal script-number opcodes for small timelocks', () => {
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 1,
      publicKeys: ['0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'],
      lockKind: 'relative-blocks',
      lockValue: 1,
      bitcoinWrapper: 'p2wsh',
    });
    expect(policyHex(policy).redeemScript).toMatch(/^51b269/u);
    expect(decodeScript(policyHex(policy).redeemScript, 'bitcoin', 'testnet', 'spending').inferredPolicy).toContain('after lock value 1');
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
    expect(policy.descriptor).toBe(`wsh(${policy.miniscript})#${descriptorChecksum(`wsh(${policy.miniscript})`)}`);
    expect(policy.miniscript).toContain('or_i(multi(4,');
    expect(policy.miniscript).toContain('and_v(v:older(4199367),pk(');
    expect(policy.miniscriptAnalysis).toContain('not sane');
    expect(policy.miniscriptAnalysis).toContain('duplicate keys detected');
    expect(() => buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 4, publicKeys: keys,
      lockKind: 'relative-time', lockValue: 30 * 24 * 60 * 60,
      bitcoinWrapper: 'p2wsh', mode: 'delayed-recovery',
      recoveryPublicKey: keys[0]!, recoveryPublicKeys: [keys[0]!, keys[1]!],
    })).toThrow(/exactly one recovery key/u);
  });

  it('builds and decodes a delayed R-of-K recovery multisig policy', () => {
    const keys = Array.from({ length: 4 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 11;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 2,
      publicKeys: keys.slice(0, 3),
      keyOrder: 'bip67',
      lockKind: 'relative-blocks',
      lockValue: 144,
      bitcoinWrapper: 'p2wsh',
      mode: 'delayed-recovery-multisig',
      recoveryPublicKeys: keys.slice(1),
      recoveryRequired: 2,
    });
    expect(policy.spendingRequirement).toContain('2-of-3 recovery keys');
    expect(policy.policyExpression).toContain('recovery:2-of-3');
    expect(decodeScript(policyHex(policy).redeemScript, 'bitcoin', 'testnet', 'spending').inferredPolicy).toContain('2-of-3 multisig after relative delay 144 blocks');
  });

  it('builds and decodes a backup committee policy', () => {
    const keys = Array.from({ length: 5 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 21;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'dash',
      network: 'testnet',
      required: 2,
      publicKeys: keys.slice(0, 3),
      keyOrder: 'bip67',
      lockKind: 'height',
      lockValue: 2_000_000,
      bitcoinWrapper: 'p2sh',
      mode: 'backup-committee',
      recoveryPublicKeys: keys.slice(3),
      recoveryRequired: 1,
    });
    expect(policy.spendingRequirement).toContain('backup committee');
    expect(policy.compatibility).toContain('ADVANCED CUSTOM DASH P2SH');
    expect(decodeScript(policyHex(policy).redeemScript, 'dash', 'testnet', 'spending').inferredPolicy).toContain('1-of-2 multisig after absolute lock 2000000');
  });

  it('builds and decodes escalating timelocked recovery', () => {
    const keys = Array.from({ length: 4 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 31;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 2,
      publicKeys: keys.slice(0, 2),
      keyOrder: 'bip67',
      lockKind: 'relative-blocks',
      lockValue: 144,
      secondLockKind: 'relative-blocks',
      secondLockValue: 1008,
      bitcoinWrapper: 'p2wsh',
      mode: 'escalating-recovery',
      recoveryPublicKeys: keys.slice(1, 3),
      recoveryRequired: 1,
      emergencyPublicKeys: keys.slice(3),
      emergencyRequired: 1,
    });
    const inferred = decodeScript(policyHex(policy).redeemScript, 'bitcoin', 'testnet', 'spending').inferredPolicy;
    expect(inferred).toContain('1-of-2 multisig after relative delay 144 blocks');
    expect(inferred).toContain('1-of-1 multisig after relative delay 1008 blocks');
  });

  it('builds and decodes a decaying multisig preset using the same keys', () => {
    const keys = Array.from({ length: 4 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 41;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 3,
      publicKeys: keys,
      keyOrder: 'bip67',
      lockKind: 'relative-blocks',
      lockValue: 4320,
      bitcoinWrapper: 'p2wsh',
      mode: 'decaying-multisig',
      recoveryRequired: 2,
    });
    expect(policy.spendingRequirement).toContain('decays to 2-of-4');
    expect(decodeScript(policyHex(policy).redeemScript, 'bitcoin', 'testnet', 'spending').inferredPolicy).toContain('2-of-4 multisig after relative delay 4320 blocks');
  });

  it('builds and decodes an expanding multisig preset with additional later keys', () => {
    const keys = Array.from({ length: 5 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 51;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'dash',
      network: 'testnet',
      required: 2,
      publicKeys: keys.slice(0, 3),
      keyOrder: 'bip67',
      lockKind: 'height',
      lockValue: 2_500_000,
      bitcoinWrapper: 'p2sh',
      mode: 'expanding-multisig',
      recoveryPublicKeys: keys.slice(3),
      recoveryRequired: 2,
    });
    expect(policy.spendingRequirement).toContain('expands to 2-of-5');
    expect(policy.policyExpression).toContain('expanded:2-of-5');
    expect(policy.compatibility).toContain('ADVANCED CUSTOM DASH P2SH');
    expect(decodeScript(policyHex(policy).redeemScript, 'dash', 'testnet', 'spending').inferredPolicy).toContain('2-of-5 multisig after absolute lock 2500000');
  });

  it('rejects expanding multisig when additional keys duplicate primary signers', () => {
    const keys = Array.from({ length: 3 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 71;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    expect(() => buildPolicy({
      chain: 'bitcoin',
      network: 'testnet',
      required: 2,
      publicKeys: keys.slice(0, 2),
      keyOrder: 'bip67',
      lockKind: 'relative-blocks',
      lockValue: 144,
      bitcoinWrapper: 'p2wsh',
      mode: 'expanding-multisig',
      recoveryPublicKeys: [keys[0]!, keys[2]!],
      recoveryRequired: 2,
    })).toThrow(/duplicates a primary key/u);
  });

  it('builds every preset as a single-leaf Taproot Tapscript policy', () => {
    const keys = Array.from({ length: 8 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 81;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const common = {
      chain: 'bitcoin' as const,
      network: 'testnet' as const,
      bitcoinWrapper: 'p2tr' as const,
      keyOrder: 'bip67' as const,
    };
    const policies = [
      buildPolicy({ ...common, mode: 'locked-multisig', required: 2, publicKeys: keys.slice(0, 3), lockKind: 'none', lockValue: 0 }),
      buildPolicy({
        ...common, mode: 'htlc', required: 1, publicKeys: keys.slice(0, 2),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKeys: keys.slice(2, 4), recoveryRequired: 1,
        hashKind: 'sha256', hashDigest: '11'.repeat(32),
      }),
      buildPolicy({
        ...common, mode: 'staged-recovery', required: 1, publicKeys: keys.slice(0, 1),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKeys: keys.slice(1, 2),
        secondLockKind: 'relative-blocks', secondLockValue: 1008, emergencyPublicKeys: keys.slice(2, 3),
      }),
      buildPolicy({
        ...common, mode: 'delayed-recovery', required: 2, publicKeys: keys.slice(0, 3),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKey: keys[3]!, recoveryPublicKeys: keys.slice(3, 4),
      }),
      buildPolicy({
        ...common, mode: 'delayed-recovery-multisig', required: 2, publicKeys: keys.slice(0, 3),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKeys: keys.slice(3, 6), recoveryRequired: 2,
      }),
      buildPolicy({
        ...common, mode: 'backup-committee', required: 2, publicKeys: keys.slice(0, 3),
        lockKind: 'height', lockValue: 900_000, recoveryPublicKeys: keys.slice(3, 6), recoveryRequired: 2,
      }),
      buildPolicy({
        ...common, mode: 'decaying-multisig', required: 3, publicKeys: keys.slice(0, 4),
        lockKind: 'relative-blocks', lockValue: 4320, recoveryRequired: 2,
      }),
      buildPolicy({
        ...common, mode: 'expanding-multisig', required: 2, publicKeys: keys.slice(0, 3),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKeys: keys.slice(3, 5), recoveryRequired: 2,
      }),
      buildPolicy({
        ...common, mode: 'escalating-recovery', required: 2, publicKeys: keys.slice(0, 3),
        lockKind: 'relative-blocks', lockValue: 144, recoveryPublicKeys: keys.slice(3, 5), recoveryRequired: 1,
        secondLockKind: 'relative-blocks', secondLockValue: 1008, emergencyPublicKeys: keys.slice(5, 7), emergencyRequired: 1,
      }),
    ];
    for (const policy of policies) {
      expect(policy.address).toMatch(/^tb1p/u);
      expect(policyHex(policy).scriptPubKey).toMatch(/^5120[0-9a-f]{64}$/u);
      expect(policy.descriptor).toMatch(/^tr\([0-9a-f]{64},/u);
      expect(policy.miniscript).not.toContain('multi(');
      expect(policy.miniscript).not.toContain('pkh(');
      expect(policy.compatibility).toContain('unspendable NUMS internal key');
    }
    expect(policies[0]!.miniscript).toContain('multi_a(2,');
    expect(policyHex(policies[0]!).redeemScript).toContain('ba');
  });

  it('builds MuSig2 as a distinct cooperative Taproot key-path output', () => {
    const keys = Array.from({ length: 3 }, (_, index) => {
      const secret = new Uint8Array(32); secret[31] = index + 101;
      return bytesToHex(secp256k1.getPublicKey(secret, true));
    });
    const policy = buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 3, publicKeys: keys,
      lockKind: 'none', lockValue: 0, bitcoinWrapper: 'p2tr-musig2',
    });
    expect(policy.address).toMatch(/^tb1p/u);
    expect(policyHex(policy).scriptPubKey).toMatch(/^5120[0-9a-f]{64}$/u);
    expect(policyHex(policy).redeemScript).toBe('');
    expect(policy.descriptor).toMatch(/^tr\(musig\(/u);
    expect(policy.spendingRequirement).toContain('N-of-N');
    expect(policy.miniscript).toContain('key-path');
    expect(() => buildPolicy({
      chain: 'bitcoin', network: 'testnet', required: 2, publicKeys: keys,
      lockKind: 'none', lockValue: 0, bitcoinWrapper: 'p2tr-musig2',
    })).toThrow(/requires all 3 participants/u);
    expect(() => buildPolicy({
      chain: 'dash', network: 'testnet', required: 3, publicKeys: keys,
      lockKind: 'none', lockValue: 0, bitcoinWrapper: 'p2tr-musig2',
    })).toThrow(/Dash policy construction supports Legacy P2SH only/u);
  });

  it('warns that Dash Core cannot automatically sign the custom recovery template', () => {
    const secrets = [1, 2, 3, 4].map((value) => { const secret = new Uint8Array(32); secret[31] = value; return bytesToHex(secp256k1.getPublicKey(secret, true)); });
    const policy = buildPolicy({
      chain: 'dash', network: 'mainnet', required: 2, publicKeys: secrets.slice(0, 3),
      lockKind: 'relative-blocks', lockValue: 20, bitcoinWrapper: 'p2sh',
      mode: 'delayed-recovery', recoveryPublicKey: secrets[3]!,
    });
    expect(policy.compatibility).toContain('ADVANCED CUSTOM DASH P2SH');
    expect(policy.compatibility).toContain('not solvable');
    expect(policy.compatibility).toContain('does not automatically satisfy');
    expect(policy.descriptor).toMatch(/^raw\(a914[0-9a-f]{40}87\)#[a-z0-9]{8}$/u);
    expect(policy.descriptor).not.toContain('or_i');
  });

  it('marks witness, v2, Taproot, and MuSig2 fields unsupported for Dash', () => {
    expect(pairName('global', 0x04n, 'dash')).toBe('Unknown/unsupported Dash field 4');
    expect(pairName('input', 0x01n, 'dash')).toBe('Unknown/unsupported Dash field 1');
    expect(pairName('input', 0x05n, 'dash')).toBe('Unknown/unsupported Dash field 5');
    expect(pairName('input', 0x1an, 'dash')).toBe('Unknown/unsupported Dash field 26');
    expect(pairName('output', 0x01n, 'dash')).toBe('Unknown/unsupported Dash field 1');
    expect(pairName('output', 0x08n, 'dash')).toBe('Unknown/unsupported Dash field 8');
  });

  it('rejects a non-empty scriptSig in a PSBT v0 unsigned transaction', () => {
    const invalid = BIP174_CREATOR
      .replace('01009a', '01009b')
      .replace('dd750000000000ffffffff', 'dd75000000000151ffffffff');
    expect(() => parsePsbt(invalid, 'bitcoin')).toThrow(/empty scriptSig/u);
  });
});

describe('Audit regressions: cryptographic context and output limits', () => {
  const generator = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  it.each([generator, 'ff'.repeat(32)])('rejects unsafe Tapscript multi_a key %s before emitting an address', key => {
    expect(() => buildCustomMiniscriptPolicy(`multi_a(1,${key})`, 'tapscript', 'mainnet')).toThrow(/public key/iu);
  });
  it('emits a 32-byte CHECKSIG key for a valid Tapscript', () => {
    expect(bytesToHex(buildCustomMiniscriptPolicy(`multi_a(1,${generator.slice(2)})`, 'tapscript', 'mainnet').script))
      .toBe(`20${generator.slice(2)}ac519c`);
  });
  it('does not offer P2SH for an oversized redeemScript', () => {
    expect(decodeScript('51'.repeat(521), 'dash', 'mainnet', 'spending').wrappers).toEqual([]);
  });
  it('rejects a timestamp entered as a block height', () => {
    expect(() => buildPolicy({ chain: 'bitcoin', network: 'mainnet', required: 1, publicKeys: [generator], lockKind: 'height', lockValue: 500_000_000, bitcoinWrapper: 'p2wsh' })).toThrow(/height/iu);
  });
});
