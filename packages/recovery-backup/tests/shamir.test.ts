import { readFileSync } from 'node:fs';
import { base64urlnopad } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { describe, expect, it, vi } from 'vitest';
import { createShamirShares, recoverShamirShares } from '../src/shamir.js';

vi.mock('@ckd/recovery-shamir-wasm/recovery_shamir_wasm_bg.wasm', async () => ({
  default: readFileSync(new URL('../../recovery-shamir-wasm/generated/recovery_shamir_wasm_bg.wasm', import.meta.url)),
}));

describe('CKD Shamir backup formats', () => {
  for (const format of ['raw', 'words'] as const) {
    it(`round-trips every BIP39 entropy size in ${format} form`, () => {
      for (const length of [16, 20, 24, 28, 32]) {
        const secret = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 0xff);
        const created = createShamirShares(secret, 3, 5, format);
        expect(recoverShamirShares([created.shares[0]!, created.shares[2]!, created.shares[4]!], format)).toEqual(
          secret,
        );
      }
    });
  }

  it('omits visible format markers and still decodes legacy prefixed shares', () => {
    const secret = new Uint8Array(16).fill(7);
    for (const format of ['raw', 'words'] as const) {
      const created = createShamirShares(secret, 2, 3, format);
      expect(created.shares.every((share) => !share.startsWith('ckd-shamir'))).toBe(true);
      expect(recoverShamirShares([created.shares[0]!, created.shares[2]!], format)).toEqual(secret);
      const prefix = format === 'raw' ? 'ckd-shamir-v1:' : 'ckd-shamir-words-v1:';
      expect(recoverShamirShares([prefix + created.shares[0]!, prefix + created.shares[2]!], format)).toEqual(secret);
    }
  });

  it('never presents Shamir Words cards as valid BIP39 recovery phrases', () => {
    const created = createShamirShares(new Uint8Array(16).fill(3), 2, 3, 'words');
    expect(created.shares.every((share) => !validateMnemonic(share, wordlist))).toBe(true);
  });

  it('continues to restore version-1 raw cards created before the set digest was added', () => {
    const secret = new Uint8Array(16).fill(5);
    const current = createShamirShares(secret, 2, 3, 'raw');
    const legacy = current.shares.slice(0, 2).map((share) => {
      const bytes = base64urlnopad.decode(share);
      const body = concatBytes(bytes.slice(0, 16), bytes.slice(32, -4));
      body[4] = 1;
      const encoded = base64urlnopad.encode(concatBytes(body, sha256(body).slice(0, 4)));
      bytes.fill(0);
      body.fill(0);
      return `ckd-shamir-v1:${encoded}`;
    });
    expect(recoverShamirShares(legacy, 'raw')).toEqual(secret);
  });

  it('recovers from unordered threshold subsets without mutating the input secret', () => {
    const secret = Uint8Array.from({ length: 32 }, (_, index) => index);
    const original = secret.slice();
    for (const format of ['raw', 'words'] as const) {
      const created = createShamirShares(secret, 3, 5, format);
      expect(recoverShamirShares([created.shares[4]!, created.shares[1]!, created.shares[3]!], format)).toEqual(
        original,
      );
      expect(secret).toEqual(original);
    }
  });

  it('rejects invalid secret sizes, thresholds, counts, formats, and empty recovery', () => {
    expect(() => createShamirShares(new Uint8Array(12), 2, 3, 'raw')).toThrow(/valid BIP39/u);
    expect(() => createShamirShares(new Uint8Array(16), 1, 3, 'raw')).toThrow(/2 to 255/u);
    expect(() => createShamirShares(new Uint8Array(16), 3, 2, 'words')).toThrow(/3 to 255/u);
    expect(() => recoverShamirShares([], 'raw')).toThrow(/at least one/u);
    const raw = createShamirShares(new Uint8Array(16), 2, 2, 'raw');
    expect(() => recoverShamirShares(raw.shares, 'words')).toThrow();
    const words = createShamirShares(new Uint8Array(16), 2, 2, 'words');
    expect(() => recoverShamirShares(words.shares, 'raw')).toThrow();
  });

  it('rejects a checksum-repaired share that reconstructs a different secret', () => {
    const created = createShamirShares(new Uint8Array(16).fill(7), 2, 3, 'raw');
    const bytes = base64urlnopad.decode(created.shares[0]!);
    bytes[33] = bytes[33]! ^ 0x40;
    bytes.set(sha256(bytes.slice(0, -4)).slice(0, 4), bytes.length - 4);
    const altered = base64urlnopad.encode(bytes);
    bytes.fill(0);
    expect(() => recoverShamirShares([altered, created.shares[1]!], 'raw')).toThrow(/share-set digest/u);
  });

  it('rejects insufficient, duplicate, mixed-set, and checksum-damaged shares', () => {
    const first = createShamirShares(new Uint8Array(16).fill(1), 2, 3, 'raw');
    const second = createShamirShares(new Uint8Array(16).fill(2), 2, 3, 'raw');
    expect(() => recoverShamirShares([first.shares[0]!], 'raw')).toThrow(/At least 2/u);
    expect(() => recoverShamirShares([first.shares[0]!, first.shares[0]!], 'raw')).toThrow(/more than once/u);
    expect(() => recoverShamirShares([first.shares[0]!, second.shares[1]!], 'raw')).toThrow(/different sets/u);
    const original = first.shares[0]!;
    const position = 10;
    const damaged = `${original.slice(0, position)}${original[position] === 'A' ? 'B' : 'A'}${original.slice(position + 1)}`;
    expect(() => recoverShamirShares([damaged, first.shares[1]!], 'raw')).toThrow(/checksum/u);
  });
});
