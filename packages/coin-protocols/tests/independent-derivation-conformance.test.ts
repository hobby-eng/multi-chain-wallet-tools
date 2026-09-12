// End-to-end derivation differential: app adapters vs Go/btcd (btcutil-js) HD derivation + node:crypto hashing + own Base58Check/Bech32/Bech32m encoders.
import { it, expect, beforeAll } from 'vitest';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { init, hdkeychain } from 'btcutil-js';
import { deriveBitcoin } from '@ckd/coins/bitcoin/index.js';
import { deriveEthereum, toEip55 } from '@ckd/coins/ethereum/index.js';
import { deriveDashCore } from '@ckd/coins/dash/core.js';
import { deriveDashCoinJoin } from '@ckd/coins/dash/coinjoin.js';
import { deriveDashMultisig } from '@ckd/coins/dash/multisig.js';
import { deriveDashPlatform } from '@ckd/coins/dash/platform.js';
import { deriveDashIdentity } from '@ckd/coins/dash/identity.js';
import { deriveDashLegacyMobile } from '@ckd/coins/dash/legacy-mobile.js';
import { materializeDescriptorKey } from '../../../apps/psbt-inspector/src/descriptor-key.js';
const MN = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seedOf = (pass = '') => pbkdf2Sync(MN.normalize('NFKD'), 'mnemonic' + pass.normalize('NFKD'), 2048, 64, 'sha512');
const sha = (b: Buffer) => createHash('sha256').update(b).digest();
const h160 = (b: Buffer) => createHash('ripemd160').update(sha(b)).digest();
const b58 = (payload: Buffer) => { const bytes = Buffer.concat([payload, sha(sha(payload)).subarray(0, 4)]); const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = BigInt('0x'+bytes.toString('hex')); let s=''; while(n>0n){ s=A[Number(n%58n)]+s; n/=58n;} for(const b of bytes){ if(b!==0) break; s='1'+s;} return s; };
function bech32(hrp: string, ver: number | null, data: Buffer, m: boolean): string {
  const words: number[] = ver === null ? [] : [ver]; let acc = 0, bits = 0; for (const b of data) { acc = ((acc << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >>> bits) & 31); } } if (bits) words.push((acc << (5 - bits)) & 31);
  const exp = [...hrp].map(c => c.charCodeAt(0) >>> 5).concat(0, [...hrp].map(c => c.charCodeAt(0) & 31)); let chk = 1;
  for (const w of [...exp, ...words, 0,0,0,0,0,0]) { const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ w; [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].forEach((g,i)=>{ if ((top>>>i)&1) chk ^= g; }); }
  chk ^= m ? 0x2bc830a3 : 1; const A='qpzry9x8gf2tvdw0s3jn54khce6mua7l'; return `${hrp}1${[...words, ...Array.from({length:6},(_,i)=>(chk>>>(5*(5-i)))&31)].map(w=>A[w]).join('')}`;
}
const rv = (r: any, key: string, i = 0) => [...r.rows[i].basic, ...r.rows[i].advanced].find((f: any) => f.key === key)?.value;
const gv = (r: any, i: number, g: number, key: string) => [...r.rows[i].groups[g].basic, ...r.rows[i].groups[g].advanced].find((f: any) => f.key === key)?.value;
let master: string; const seed = seedOf();
beforeAll(async () => { await init(new Uint8Array(readFileSync(new URL('../../../node_modules/btcutil-js/dist/btcutil.wasm', import.meta.url))).buffer); master = await hdkeychain.newMaster(seed.toString('hex')); });
const goPub = async (path: string) => Buffer.from(await hdkeychain.publicKey(await hdkeychain.derivePath(master, path)));
it('own encoders reproduce published constants (BIP86 first address, BIP173 P2WPKH example, Base58 P2PKH)', () => {
  expect(bech32('bc', 1, Buffer.from('a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c','hex'), true)).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  expect(bech32('bc', 0, Buffer.from('751e76e8199196d454941c45d1b3a323f1433bd6','hex'), false)).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  expect(b58(Buffer.concat([Buffer.from([0]), Buffer.from('751e76e8199196d454941c45d1b3a323f1433bd6','hex')]))).toBe('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
});
it('Bitcoin BIP44/49/84/86 mainnet+testnet at boundary indexes vs Go + own encoders + published Trezor-seed constants', async () => {
  const known: Record<string,string> = { 'legacy:mainnet:0:0:0': '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', 'nested-segwit:mainnet:0:0:0': '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf', 'native-segwit:mainnet:0:0:0': 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'taproot:mainnet:0:0:0': 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', 'taproot:mainnet:0:0:1': 'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh', 'taproot:mainnet:0:1:0': 'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7' };
  let n = 0;
  for (const mode of ['legacy','nested-segwit','native-segwit','taproot'] as const) for (const network of ['mainnet','testnet'] as const) for (const account of [0, 2147483647]) for (const branch of [0, 1]) for (const start of [0, 1, 2147483647]) {
    const purpose = { legacy: 44, 'nested-segwit': 49, 'native-segwit': 84, taproot: 86 }[mode]; const coin = network === 'mainnet' ? 0 : 1;
    const r = deriveBitcoin(mode, { seed, network, account, branch, start, count: 1 });
    const path = `m/${purpose}'/${coin}'/${account}'/${branch}/${start}`; expect(r.rows[0]!.path).toBe(path);
    const pub = await goPub(path); expect(rv(r, 'publicKey')).toBe(pub.toString('hex'));
    const pkh = h160(pub); let expected: string;
    if (mode === 'legacy') expected = b58(Buffer.concat([Buffer.from([network==='mainnet'?0:0x6f]), pkh]));
    else if (mode === 'nested-segwit') expected = b58(Buffer.concat([Buffer.from([network==='mainnet'?5:0xc4]), h160(Buffer.concat([Buffer.from('0014','hex'), pkh]))]));
    else if (mode === 'native-segwit') expected = bech32(network==='mainnet'?'bc':'tb', 0, pkh, false);
    else { // Taproot: tweak via Go txscript? btcutil-js address.fromTaproot(x-only output key). Output key from app compared with Go hdkeychain internal key + own tagged-hash tweak is EC math; use Go descriptors instead below.
      expected = rv(r, 'address'); }
    expect(rv(r, 'address')).toBe(expected);
    const k = `${mode}:${network}:${account}:${branch}:${start}`; if (known[k]) expect(rv(r, 'address')).toBe(known[k]);
    n++;
  }
  expect(n).toBe(96);
});
it('Taproot output keys vs Go descriptors tr(xpub) for boundary indexes', async () => {
  const { descriptors } = await import('btcutil-js');
  for (const network of ['mainnet','testnet'] as const) for (const account of [0, 7]) for (const branch of [0,1]) for (const index of [0, 2147483647]) {
    const r = deriveBitcoin('taproot', { seed, network, account, branch, start: index, count: 1 });
    const accountXpub = r.summary.find((f: any) => f.key === 'accountXpub')!.value;
    const desc = `tr(${accountXpub}/${branch}/*)`; const go = await descriptors.create(desc); let goAddr; try { goAddr = go.addressAt(network, 0, index); } finally { go.free(); }
    expect(rv(r, 'address')).toBe(goAddr);
  }

});
it('Ethereum BIP44 vs Go pubkey and published constants; EIP55 official vectors', async () => {
  const r = deriveEthereum({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 2 });
  expect(rv(r, 'address', 0)).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  expect(rv(r, 'address', 1)).toBe('0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0');
  const pub = await goPub("m/44'/60'/0'/0/0"); expect(rv(r, 'compressedPublicKey', 0)).toBe(pub.toString('hex'));
  for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed','0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359','0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB','0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']) expect(toEip55(a.toLowerCase())).toBe(a);
  for (const account of [0, 2147483647]) for (const branch of [0,1]) for (const start of [0, 2147483647]) { const rr = deriveEthereum({ seed, network: 'mainnet', account, branch, start, count: 1 }); const p = await goPub(`m/44'/60'/${account}'/${branch}/${start}`); expect(rv(rr, 'compressedPublicKey')).toBe(p.toString('hex')); }

});
it('Dash Core BIP44, legacy mobile, DIP9 CoinJoin, Purpose48, DIP17 Platform, DIP13 Identity vs Go + own encoders', async () => {
  let n = 0;
  for (const network of ['mainnet','testnet'] as const) { const coin = network==='mainnet'?5:1; const p2pkh = network==='mainnet'?76:140; const hrp = network==='mainnet'?'dash':'tdash';
    for (const account of [0, 2147483647]) for (const branch of [0,1]) for (const start of [0, 2147483647]) {
      const core = deriveDashCore({ seed, network, account, branch, start, count: 1 }); let path = `m/44'/${coin}'/${account}'/${branch}/${start}`; expect(core.rows[0]!.path).toBe(path); let pub = await goPub(path); expect(rv(core,'publicKey')).toBe(pub.toString('hex')); expect(rv(core,'address')).toBe(b58(Buffer.concat([Buffer.from([p2pkh]), h160(pub)])));
      const cj = deriveDashCoinJoin({ seed, network, account, branch, start, count: 1 }); path = `m/9'/${coin}'/4'/${account}'/${branch}/${start}`; expect(cj.rows[0]!.path).toBe(path); pub = await goPub(path); expect(rv(cj,'publicKey')).toBe(pub.toString('hex')); expect(rv(cj,'address')).toBe(b58(Buffer.concat([Buffer.from([p2pkh]), h160(pub)])));
      const ms = deriveDashMultisig({ seed, network, account, branch, start, count: 1 }); path = `m/48'/${coin}'/${account}'/0'/${branch}/${start}`; expect(ms.rows[0]!.path).toBe(path); pub = await goPub(path); expect(rv(ms,'publicKey')).toBe(pub.toString('hex'));
      const lm = deriveDashLegacyMobile({ seed, network, account, branch, start, count: 1 }); path = `m/${account}'/${branch}/${start}`; expect(lm.rows[0]!.path).toBe(path); pub = await goPub(path); expect(rv(lm,'address')).toBe(b58(Buffer.concat([Buffer.from([p2pkh]), h160(pub)])));
      const pl = deriveDashPlatform({ seed, network, account, branch, start, count: 1 }); path = `m/9'/${coin}'/17'/${account}'/${branch}'/${start}`; expect(pl.rows[0]!.path).toBe(path); pub = await goPub(path); expect(rv(pl,'publicKey')).toBe(pub.toString('hex')); expect(rv(pl,'address')).toBe(bech32(hrp, null, Buffer.concat([Buffer.from([0xb0]), h160(pub)]), true)); expect(rv(pl,'storagePayload')).toBe('00'+h160(pub).toString('hex'));
      n += 5;
    }
    for (const identity of [0, 2147483647]) { const id = deriveDashIdentity({ seed, network, account: 0, branch: 0, start: identity, count: 1 }); for (const key of [0,1,2,3]) { const path = `m/9'/${coin}'/5'/0'/0'/${identity}'/${key}'`; const pub = await goPub(path); expect(gv(id, 0, key, 'key'+key+'Path')).toBe(path); expect(gv(id, 0, key, 'key'+key+'PublicKey')).toBe(pub.toString('hex')); expect(gv(id, 0, key, 'key'+key+'PublicKeyHash')).toBe(h160(pub).toString('hex')); n++; } }
  }
  expect(n).toBe(96);
});
it('exported public account descriptors reproduce the derived rows; private text never leaks into public text', () => {
  for (const [mode, fn] of [['legacy', () => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 3, branch: 1, start: 0, count: 5 })], ['dash', () => deriveDashCore({ seed, network: 'testnet', account: 1, branch: 0, start: 10, count: 5 })]] as const) {
    const r: any = fn(); const pub = r.accountDescriptors.publicText.split('\n'); expect(pub.length).toBe(2); expect(r.accountDescriptors.publicText).not.toMatch(/prv/); expect(r.accountDescriptors.privateText).toMatch(/[xt]prv/);
    const branch = r.rows[0]!.path.split('/')[4]; const key = pub[Number(branch)].match(/\((?:sh\(wpkh\()?(\[[^\]]+\][xt]pub[^)/]+\/\d+\/\*)/)![1];
    for (const [i, rowItem] of r.rows.entries()) expect(materializeDescriptorKey(key, mode === 'dash' ? 'testnet' : 'mainnet', 0, rowItem.index)).toBe(rv(r, 'publicKey', i));
  }

});
it('bounds: overflow, hardened boundary, branch, count', () => {
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 0, branch: 0, start: 2147483647, count: 2 })).toThrow(/index range/u);
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 0, branch: 0, start: 2147483648, count: 1 })).toThrow(/Start index/u);
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 2147483648, branch: 0, start: 0, count: 1 })).toThrow(/Account/u);
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 0, branch: 2, start: 0, count: 1 })).toThrow(/Branch/u);
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 51 })).toThrow(/Number of results/u);
  expect(() => deriveBitcoin('legacy', { seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 0 })).toThrow(/Number of results/u);
  expect(() => deriveDashPlatform({ seed, network: 'mainnet', account: 0, branch: 2, start: 0, count: 1 })).toThrow(/key class/u);
  expect(() => deriveBitcoin('legacy', { seed: seed.subarray(0, 16), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 })).not.toThrow();
  const all = new Set<string>(); let total = 0;
  for (const mode of ['legacy','nested-segwit','native-segwit','taproot'] as const) for (const branch of [0,1]) { const r = deriveBitcoin(mode, { seed, network: 'mainnet', account: 0, branch, start: 0, count: 20 }); for (let i=0;i<20;i++) { all.add(rv(r,'address',i)); total++; } }
  for (const f of [deriveDashCore, deriveDashCoinJoin, deriveDashLegacyMobile]) for (const branch of [0,1]) { const r = f({ seed, network: 'mainnet', account: 0, branch, start: 0, count: 20 }); for (let i=0;i<20;i++) { all.add(rv(r,'address',i)); total++; } }
  expect(total).toBe(280); expect(all.size).toBe(total);
});
