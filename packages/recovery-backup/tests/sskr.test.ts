import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm', async () => ({
  default: readFileSync(new URL('../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm', import.meta.url)),
}));

import { createSskrShares, recoverSskrShares } from '../src/sskr.js';
import { hexToBytes } from '@noble/hashes/utils.js';

// Official BCR-2020-011 vector: https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-011-sskr.md
const officialSecret = hexToBytes('7daa851251002874e1a1995f0897e6b1');
const officialUrShares = [
  'ur:sskr/gogrrsbyadaefmnlbnctaaecvoqdfnjpbzecstfgaxtifpsskbfw',
  'ur:sskr/gogrrsbyadadbnluotnykpaootdaweatrotlmsttrobsghbnurrh',
  'ur:sskr/gogrrsbyadaohtrygabavahphnlrlpmkghwyiojkjtkpmdkncfjp',
  'ur:sskr/gogrrsbybgaefywsfefhiymofseyihfremkivwsogrespmclwepd',
  'ur:sskr/gogrrsbybgadjlzocwbnskpyfdhehtiobwjzladnswkgtscfhfvt',
  'ur:sskr/gogrrsbybgaootkoehgoztzcreloknrfvawyinssrksnmedtfmks',
  'ur:sskr/gogrrsbybgaxloidjliyhessrtvwfevtsazmbndsenmywmbylpdy',
  'ur:sskr/gogrrsbybgaaiaeenbuyksetonswsstduoprvwrphkbytlfzlyca',
];
const officialBytewordsShares = [
  'tuna next keep gyro gear runs body acid able film nail barn cost aqua epic veto quad fern jump buzz epic slot frog apex taxi grim fern twin leaf',
  'tuna next keep gyro gear runs body acid also heat ruby gala beta visa help horn liar limp monk gush waxy into junk jolt keep lion leaf ruby purr',
  'tuna next keep gyro gear runs body brag able foxy webs free fish inky memo figs easy inch fair exam kiwi view solo gear eyes ruin tuna gala iris',
  'tuna next keep gyro gear runs body brag also omit keno each gyro zest zinc race logo kiln roof visa waxy iron sets rock swan leaf tent navy redo',
  'tuna next keep gyro gear runs body brag aqua idea edge numb ugly keys exit open skew sets tied undo purr view ramp hawk body skew redo data unit',
];

describe('Blockchain Commons SSKR backup', () => {
  it('restores the official grouped vector through two distinct quorums and tagged Bytewords', () => {
    expect(recoverSskrShares([0, 2, 3, 5, 7].map((index) => officialUrShares[index]!))).toEqual(officialSecret);
    expect(recoverSskrShares([0, 1, 4, 5, 6].map((index) => officialUrShares[index]!))).toEqual(officialSecret);
    expect(recoverSskrShares(officialBytewordsShares, 'bytewords')).toEqual(officialSecret);
  });

  it('rejects incomplete groups, duplicate members, and a damaged transport checksum', () => {
    for (const indexes of [
      [0, 1],
      [0, 1, 3, 4],
      [0, 0, 3, 5, 7],
    ]) {
      expect(() => recoverSskrShares(indexes.map((index) => officialUrShares[index]!))).toThrow();
    }
    const damaged = `${officialUrShares[0]!.slice(0, -2)}aa`;
    expect(() => recoverSskrShares([damaged, ...officialUrShares.slice(1)])).toThrow();
  });

  it('recovers a grouped threshold from standard ur:sskr records', () => {
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index);
    const shares = createSskrShares(secret, 2, [
      { threshold: 2, count: 3 },
      { threshold: 1, count: 2 },
    ]);
    expect(shares).toHaveLength(5);
    expect(shares.every((share) => share.startsWith('ur:sskr/'))).toBe(true);
    expect(recoverSskrShares([shares[0]!, shares[2]!, shares[4]!])).toEqual(secret);
    expect(() => recoverSskrShares([shares[0]!, shares[4]!])).toThrow();
  });

  it('rejects invalid group thresholds', () => {
    expect(() => createSskrShares(new Uint8Array(16), 1, [{ threshold: 3, count: 2 }])).toThrow();
  });

  it('rejects an unsupported runtime encoding instead of selecting a default', () => {
    expect(() => createSskrShares(new Uint8Array(16), 1, [{ threshold: 1, count: 1 }], 'future' as never)).toThrow(
      /Unsupported SSKR/u,
    );
    expect(() => recoverSskrShares(officialUrShares, 'future' as never)).toThrow(/Unsupported SSKR/u);
  });

  it('round-trips the standard full Bytewords representation', () => {
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index);
    const shares = createSskrShares(secret, 1, [{ threshold: 2, count: 3 }], 'bytewords');
    expect(shares[0]).toMatch(/^tuna next keep gyro [a-z]{4}( [a-z]{4})+$/u);
    expect(recoverSskrShares([shares[0]!, shares[2]!], 'bytewords')).toEqual(secret);
  });
});
