import remediation from './remediation-vectors.json';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HDKey } from '@scure/bip32';
import { p2tr } from '@scure/btc-signer';
import type { TaprootScriptTree } from '@scure/btc-signer/payment.js';
import { keyAggregate } from '@scure/btc-signer/musig2.js';
import { descriptors, hdkeychain, init, musig2 } from 'btcutil-js';
import { bytesToHex, hexToBytes } from '@ckd/core/crypto.js';
import { decodeDescriptor } from '../../src/descriptor.js';
import { materializeDescriptorKey } from '../../src/descriptor-key.js';
import { compilePolicyMiniscript } from '../../src/miniscript-engine.js';
import { analyzeMusigDescriptor } from '../../src/musig-descriptor.js';
import { describeScript, parsePsbt } from '../../src/psbt.js';
import vectors from './official-vectors.json';

// The Go/btcd WASM oracle is independent of Scure/Noble. BitcoinerLab is
// production, NOT an independent oracle. Core literal vectors are a third source.
beforeAll(async () => {
  const wasm = readFileSync(new URL('../../../../node_modules/btcutil-js/dist/btcutil.wasm', import.meta.url));
  await init(Uint8Array.from(wasm).buffer);
}, 30_000);

const hex = (value: Uint8Array) => bytesToHex(value).toLowerCase();
const g = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const h = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const rootXpub = vectors.bip32[0]!.paths[0]!.xpub;
function output(source: string, branch: 0 | 1 = 0, index = 0, label = 'scriptPubKey') {
  return decodeDescriptor(source, { multipathChoice: branch, wildcardIndex: index })
    .compiledOutput?.rows.find((row) => row.label === label)?.value;
}

describe('Independent audit: BIP32 + multipath + final key ordering', () => {
  for (const vector of vectors.bip32) {
    it(`matches official BIP32 vector ${vector.id} in Scure and Go, including leading zeroes`, async () => {
      const scure = HDKey.fromMasterSeed(hexToBytes(vector.seed));
      const go = await hdkeychain.newMaster(vector.seed);
      for (const row of vector.paths) {
        expect(scure.derive(row.path).publicExtendedKey).toBe(row.xpub);
        expect(await hdkeychain.neuter(await hdkeychain.derivePath(go, row.path))).toBe(row.xpub);
        expect(materializeDescriptorKey(row.xpub, 'mainnet', 0, 0))
          .toBe(hex(await hdkeychain.publicKey(row.xpub)));
      }
    });
  }
  for (const index of [0, 1, 2, 65535, 0x7fffffff]) {
    for (const branch of [0, 1] as const) {
      it(`sorts derived keys, not xpub strings: branch=${branch}, index=${index}`, async () => {
        const otherXpub = vectors.bip32[1]!.paths[0]!.xpub;
        const source = `wsh(sortedmulti(2,${rootXpub}/<0;1>/*,${otherXpub}/<1;0>/*))`;
        const go = await descriptors.create(source);
        try {
          expect(output(source, branch, index, 'Address')).toBe(go.addressAt('mainnet', branch, index));
          const supplied = source.replace('sortedmulti', 'multi');
          const goSupplied = await descriptors.create(supplied);
          try {
            expect(output(supplied, branch, index, 'Address')).toBe(goSupplied.addressAt('mainnet', branch, index));
          } finally { goSupplied.free(); }
        } finally { go.free(); }
      });
    }
  }
  it.each([-1, 0x80000000, 0xffffffff, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects invalid wildcard index %s', (index) => {
      expect(() => materializeDescriptorKey(`${rootXpub}/*`, 'mainnet', 0, index)).toThrow();
    },
  );
  it.each(["/0'", '/0h', '/0H', '/2147483648', '/4294967295', '/*/0', '/*/*'])(
    'rejects impossible or malformed public derivation %s', (suffix) => {
      expect(() => materializeDescriptorKey(`${rootXpub}${suffix}`, 'mainnet', 0, 0)).toThrow();
    },
  );
});

describe('Independent audit: Bitcoin Core Miniscript exact bytes', () => {
  for (const [index, vector] of vectors.miniscript.entries()) {
    for (const tapscript of [false, true]) {
      const expected = tapscript ? vector.tapscript === '=' ? vector.script : vector.tapscript : vector.script;
      const invalid = !vector.valid || vector.mode.includes(tapscript ? 'TESTMODE_TAPSCRIPT_INVALID' : 'TESTMODE_P2WSH_INVALID');
      if (!invalid && !/^[0-9a-f]+$/.test(expected)) continue;
      const expression = tapscript
        ? vector.expression.replace(/(?<=[,(])0[23]([0-9a-f]{64})(?=[,)])/g, '$1')
        : vector.expression;
      it(`${index}: ${tapscript ? 'Tapscript' : 'P2WSH'} ${vector.expression.slice(0, 80)}`, () => {
        if (invalid) expect(() => compilePolicyMiniscript(expression, { tapscript })).toThrow();
        else expect(hex(compilePolicyMiniscript(expression, { tapscript }).script)).toBe(expected);
      });
    }
  }
});

type Tree = { script: string; leafVersion: number } | Tree[] | null;
function scureTree(tree: Tree): TaprootScriptTree | undefined {
  if (tree === null) return undefined;
  if (Array.isArray(tree)) return tree.map((child) => scureTree(child)!) as TaprootScriptTree;
  return { script: hexToBytes(tree.script), leafVersion: tree.leafVersion };
}
function descriptorTree(tree: Tree): string {
  if (Array.isArray(tree)) return `{${tree.map(descriptorTree).join(',')}}`;
  if (tree === null) return '';
  // All these official scripts are pk() or pk() with a CSV/CLTV suffix.
  if (/^20[0-9a-f]{64}ac$/.test(tree.script)) return `pk(${tree.script.slice(2, 66)})`;
  return `raw(${tree.script})`;
}
describe('Independent audit: BIP341 wallet tree/tweak/address', () => {
  for (const [index, vector] of vectors.bip341.entries()) {
    it(`Scure matches official wallet scriptPubKey, address and control blocks ${index}`, () => {
      const tree = scureTree(vector.given.scriptTree);
      const payment = tree === undefined ? p2tr(hexToBytes(vector.given.internalPubkey)) : p2tr(hexToBytes(vector.given.internalPubkey), tree, undefined, true);
      expect(hex(payment.script)).toBe(vector.expected.scriptPubKey);
      expect(payment.address).toBe(vector.expected.bip350Address);
      expect(describeScript(payment.script, 'bitcoin', 'mainnet').address).toBe(vector.expected.bip350Address);
      if (tree !== undefined) expect(hex(p2tr(hexToBytes(vector.given.internalPubkey), tree, undefined, true).tapMerkleRoot!)).toBe(vector.intermediary.merkleRoot);
    });
    if (vector.given.scriptTree === null || (
      !Array.isArray(vector.given.scriptTree) && /^20[0-9a-f]{64}ac$/.test(vector.given.scriptTree.script)
    )) {
      const source = `tr(${vector.given.internalPubkey}${vector.given.scriptTree === null ? '' : `,${descriptorTree(vector.given.scriptTree)}`})`;
      it(`Go independently matches official wallet descriptor ${index}`, async () => {
        const go = await descriptors.create(source);
        try { expect(go.addressAt('mainnet', 0, 0)).toBe(vector.expected.bip350Address); }
        finally { go.free(); }
      });
      it(`Inspector compiles official Taproot descriptor ${index}`, () => {
        expect(output(source)).toBe(vector.expected.scriptPubKey);
      });
    }
  }
});

describe('Independent audit: MuSig2 aggregate keys', () => {
  for (const [index, row] of vectors.bip327.valid_test_cases.entries()) {
    it(`matches BIP327 KeyAgg public vector ${index}`, () => {
      const keys = row.key_indices.map((i) => hexToBytes(vectors.bip327.pubkeys[i]!));
      expect(hex(keyAggregate(keys).aggPublicKey.toBytes(true).slice(1))).toBe(row.expected.toLowerCase());
    });
    it(`Go and inspector agree on sorted BIP390 aggregation ${index}`, async () => {
      const keys = row.key_indices.map((i) => vectors.bip327.pubkeys[i]!).sort();
      const go = await musig2.aggregateKeys(keys);
      const inspector = analyzeMusigDescriptor(`tr(musig(${keys.join(',')}))`, 'mainnet', 0)!;
      expect(inspector.keys[0]!.aggregateXOnlyKey).toBe(hex(go.xOnlyKey));
    });
  }
});

describe('Independent audit: official PSBT parser corpus', () => {
  for (const [bip, cases] of Object.entries(vectors.psbt)) {
    for (const [index, row] of cases.entries()) {
      it(`BIP${bip} ${row.valid ? 'valid' : 'invalid'} ${index}: ${row.name}`, () => {
        if (row.valid) expect(() => parsePsbt(row.base64, 'bitcoin')).not.toThrow();
        else expect(() => parsePsbt(row.base64, 'bitcoin')).toThrow();
      });
    }
  }
});

describe('Independent audit: descriptor grammar rejection', () => {
  it.each([
    `wpkh(0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8)`,
    `tr(${g.slice(2)},{pk(${h.slice(2)})})`,
    `tr(${g.slice(2)},{pk(${h.slice(2)}),pk(${g.slice(2)}),pk(${h.slice(2)})})`,
    `tr(${g.slice(2)},sortedmulti_a(0,${h.slice(2)}))`,
    `tr(${g.slice(2)},sortedmulti_a(2,${h.slice(2)}))`,
    `tr(${g.slice(2)},pk(${h.slice(2)}),pk(${g.slice(2)}))`,
    `wpkh([deadbeef/2147483648]${g})`,
    `wpkh(${rootXpub}/<0;1>/<0;1>/*)`,
  ])('rejects %s (independently checked by Go)', async (source) => {
    // BIP380/BIP382 prohibit these cases even though the Go oracle normalizes/accepts them.
    if (!source.includes('[deadbeef/2147483648]') && !source.startsWith('wpkh(04')) await expect((async () => {
      const descriptor = await descriptors.create(source);
      try { descriptor.addressAt('mainnet', 0, 0); } finally { descriptor.free(); }
    })()).rejects.toThrow();
    expect(() => decodeDescriptor(source)).toThrow();
  });
});

describe('Audit regressions: malformed claims and complete BIP390 outputs', () => {
  for (const [name, value] of Object.entries(remediation.invalidPsbt)) it(name, () => expect(() => parsePsbt(value, 'bitcoin')).toThrow());
  for (const [i, vector] of remediation.musig.entries()) it(`official BIP390 output ${i}`, () => {
    expect(analyzeMusigDescriptor(vector.descriptor, 'mainnet', vector.index)?.outputScript).toBe(vector.script);
    expect(output(vector.descriptor, 0, vector.index)).toBe(vector.script);
  });
});

// Independently construct the BIP328 synthetic xpub from Go KeyAgg, then
// derive it through Go HDKey and let Go compile the concrete Taproot key.
describe('Follow-up: aggregate multipath differential construction', () => {
  for (const branch of [0, 1] as const) it(`matches Go aggregate/BIP32/Taproot for branch ${branch}`, async () => {
    const a = rootXpub;
    const b = HDKey.fromExtendedKey(a).deriveChild(1).publicExtendedKey;
    const keys = [hex(await hdkeychain.publicKey(a)), hex(await hdkeychain.publicKey(b))].sort();
    const agg = await musig2.aggregateKeys(keys);
    const synthetic = new HDKey({ publicKey: agg.combinedKey, chainCode: hexToBytes('868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965') }).publicExtendedKey;
    for (const index of [0, 7, 2147483647]) {
      const child = await hdkeychain.derivePath(synthetic, `m/${branch}/${index}`);
      const key = hex(await hdkeychain.publicKey(child)).slice(2);
      const go = await descriptors.create(`tr(${key})`);
      try {
        expect(decodeDescriptor(`tr(musig(${a},${b})/<0;1>/*)`, {multipathChoice:branch, wildcardIndex:index}).compiledOutput?.rows.find(row=>row.label==='Address')?.value).toBe(go.addressAt('mainnet', 0, 0));
      } finally { go.free(); }
    }
  });
});
