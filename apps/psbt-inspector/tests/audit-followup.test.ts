import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { HDKey } from '@scure/bip32';
import { decodeDescriptor } from '../src/descriptor.js';
import { parsePsbt, pairName } from '../src/psbt.js';
import { analyzeMusigDescriptor, compileTaprootDescriptor } from '../src/musig-descriptor.js';

// Public BIP32 vector seed and public generator points. Never user wallet data.
const a = HDKey.fromMasterSeed(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')).publicExtendedKey;
const b = HDKey.fromExtendedKey(a).deriveChild(1).publicExtendedKey;
const g = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const h = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const u = '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const script = (d: string, branch: 0 | 1 = 0, index = 0) => decodeDescriptor(d, { multipathChoice: branch, wildcardIndex: index }).compiledOutput?.rows.find(r => r.label === 'scriptPubKey')?.value;

describe('follow-up: original MuSig grammar before branch selection', () => {
  for (const branch of [0, 1] as const) for (const index of [0, 7, 2147483647]) {
    it(`derives aggregate branch ${branch}, child ${index}`, () => {
      const ranged = script(`tr(musig(${a},${b})/<0;1>/*)`, branch, index);
      const concrete = script(`tr(musig(${a},${b})/${branch}/${index})`);
      expect(ranged).toMatch(/^5120[0-9a-f]{64}$/);
      expect(ranged).toBe(concrete);
      expect(ranged).not.toBe(script(`tr(musig(${a},${b})/${1 - branch}/${index})`));
    });
  }
  for (const participant of [`${a}/<0;1>`, `${a}/*`]) {
    it(`rejects participant range plus aggregate derivation: ${participant.slice(-8)}`, () => {
      for (const branch of [0, 1] as const) {
        const d = `tr(musig(${participant},${b})/0/*)`;
        expect(() => decodeDescriptor(d, { multipathChoice: branch })).toThrow(/participant wildcard\/multipath/);
        expect(() => compileTaprootDescriptor(d, 'mainnet', 0, branch)).toThrow(/participant wildcard\/multipath/);
      }
    });
  }
  for (const suffix of ['/<0;0>/*','/<0;2147483648>/*','/<0;1>/<2;3>/*','/*/0',"/0h",'/<0;1;2>/*']) {
    it(`rejects invalid or unsupported aggregate suffix ${suffix}`, () => {
      expect(() => decodeDescriptor(`tr(musig(${a},${b})${suffix})`)).toThrow();
    });
  }
  for (const bad of [`[bad]${g}`, `[deadbeef/2147483648h]${g}`, `${a}/<0;0>`, `${a}/<0;2147483648>`]) {
    it(`validates nested MuSig participant ${bad.slice(0, 25)}`, () => {
      for (const d of [`tr(musig(${bad},${h}))`, `tr(${g},{pk(musig(${bad},${h})),pk(${h})})`]) {
        expect(() => decodeDescriptor(d)).toThrow();
      }
    });
  }
  it('preserves valid nested origins and participant-only multipath', () => {
    expect(script(`tr(${g},{pk(musig([deadbeef/44h/0h]${g},${h})),pk(${h})})`)).toBe(script(`tr(${g},{pk(musig(${g},${h})),pk(${h})})`));
    for (const branch of [0,1] as const) expect(script(`tr(musig(${a}/<0;1>,${b}/<0;1>))`, branch)).toBe(script(`tr(musig(${a}/${branch},${b}/${branch}))`));
  });
  it('rejects wrong-network xpubs inside leaves', () => {
    expect(() => decodeDescriptor(`tr(${g},{pk(musig(${a},${b})),pk(${h})})`, {network:'testnet'})).toThrow(/tpub/);
  });
  it('checks origins at the standalone MuSig analysis boundary', () => {
    expect(() => analyzeMusigDescriptor(`tr(musig([bad]${g},${h}))`, 'mainnet', 0)).toThrow(/origin/);
  });
});

describe('follow-up: descriptor recognition and legacy contexts', () => {
  it('preserves uncompressed legacy serialization (independent Python/OpenSSL fixture)', () => {
    const output = decodeDescriptor(`sh(pkh(${u}))`).compiledOutput;
    expect(output?.rows.find(r => r.label === 'Address')?.value).toBe('3DJgFhQBWVq9CdfzyJ9m5Lo6cYKh24anLh');
    expect(script(`sh(pkh(${u}))`)).toBe('a914' + hash('ripemd160', hash('sha256', Buffer.from('76a91491b24bf9f5288532960ac687abb035127b1d28a588ac', 'hex'))).toString('hex') + '87');
    expect(decodeDescriptor(`sh(pkh(${g}))`).compiledOutput?.rows.find(r => r.label === 'Address')?.value).toBe('3LRW7jeCvQCRdPF8S3yUCfRAx4eqXFmdcr');
  });
  for (const d of [`wpkh(${u})`,`wsh(pk(${u}))`,`tr(${u})`,`tr(${g},pk(${u}))`,'sp()','combo(00)','combo(pk())',`sp(${g})`,`sp(${g},00)`]) {
    it(`rejects ${d.slice(0, 30)}`, () => expect(() => decodeDescriptor(d)).toThrow());
  }
  it('still recognizes valid combo and silent payment keys', () => {
    expect(() => decodeDescriptor(`combo(${g})`)).not.toThrow();
    expect(() => decodeDescriptor(`sp(${a},musig(${a},${b}))`)).not.toThrow();
  });
});

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const kv = (key: Buffer, value: Buffer) => Buffer.concat([Buffer.from([key.length]),key,Buffer.from([value.length]),value]);
const f = (type: number, value: Buffer) => kv(Buffer.from([type]), value);
const map = (fields: Buffer[]) => Buffer.concat([...fields,Buffer.from([0])]);
function psbt(type: number, key: Buffer, value: Buffer): string {
  return Buffer.concat([Buffer.from('70736274ff','hex'), map([f(251,u32(2)),f(2,u32(2)),f(4,Buffer.from([1])),f(5,Buffer.from([1]))]), map([f(14,Buffer.alloc(32)),f(15,u32(0)),kv(Buffer.concat([Buffer.from([type]),key]),value)]),map([f(3,Buffer.alloc(8)),f(4,Buffer.from([81]))])]).toString('base64');
}
const hash = (alg: string, b: Buffer) => createHash(alg).update(b).digest();
describe('follow-up: BIP174 preimage commitments (OpenSSL oracle)', () => {
  for (const [type, name, digest] of [
    [10,'RIPEMD160',(v: Buffer) => hash('ripemd160',v)],
    [11,'SHA256',(v: Buffer) => hash('sha256',v)],
    [12,'HASH160',(v: Buffer) => hash('ripemd160',hash('sha256',v))],
    [13,'HASH256',(v: Buffer) => hash('sha256',hash('sha256',v))],
  ] as const) {
    for (const value of [Buffer.alloc(0),Buffer.from('public preimage')]) it(`accepts ${name} length ${value.length}`, () => {
      expect(parsePsbt(psbt(type,digest(value),value),'bitcoin').version).toBe(2);
      expect(pairName('input',BigInt(type))).toContain(name);
    });
    it(`rejects malformed ${name} key widths and wrong commitments`, () => {
      const value = Buffer.from('public preimage'), key = digest(value);
      for (const wrong of [key.subarray(1),Buffer.concat([key,Buffer.from([0])]),Buffer.alloc(key.length)]) expect(() => parsePsbt(psbt(type,wrong,value),'bitcoin')).toThrow(/preimage/);
    });
  }
});
