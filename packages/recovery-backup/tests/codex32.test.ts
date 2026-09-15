import { readFileSync } from 'node:fs';
import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { createCodex32Backup, recoverCodex32Seed } from '../src/codex32.js';
import officialVectors from './fixtures/bip93-vectors.json';

vi.mock('@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm', async () => ({
  default: readFileSync(
    new URL('../../recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm', import.meta.url),
  ),
}));

describe('Codex32 BIP93 backup', () => {
  it('decodes every official unshared BIP93 vector, including alternate padding and long Codex32', () => {
    for (const vector of officialVectors.unshared) {
      for (const record of vector.records) {
        expect(Buffer.from(recoverCodex32Seed([record])).toString('hex')).toBe(vector.seed);
      }
    }
  });

  it('recovers every threshold subset from the official shared BIP93 vectors', () => {
    for (const vector of officialVectors.shared) {
      const combinations = <T>(items: readonly T[], count: number): T[][] =>
        count === 0
          ? [[]]
          : items.flatMap((item, index) =>
              combinations(items.slice(index + 1), count - 1).map((tail) => [item, ...tail]),
            );
      for (const shares of combinations(vector.shares, vector.threshold)) {
        expect(Buffer.from(recoverCodex32Seed(shares)).toString('hex')).toBe(vector.seed);
      }
    }
  });

  it('rejects every official invalid BIP93 record', () => {
    expect(officialVectors.invalid).toHaveLength(55);
    for (const record of officialVectors.invalid) expect(() => recoverCodex32Seed([record])).toThrow();
  });

  it('matches the official 256-bit unsplit vector', () => {
    const seed = hexToBytes('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100');
    const backup = createCodex32Backup(seed, 'leet', 0, 1);
    expect(backup.shares).toEqual(['ms10leetsllhdmn9m42vcsamx24zrxgs3qrl7ahwvhw4fnzrhve25gvezzyqqtum9pgv99ycma']);
    expect(recoverCodex32Seed(backup.shares)).toEqual(seed);
  });

  it('recovers official BIP93 vector two', () => {
    const shares = [
      'MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM',
      'MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN',
    ];
    expect(Buffer.from(recoverCodex32Seed(shares)).toString('hex')).toBe('d1808e096b35b209ca12132b264662a5');
  });

  it.each([16, 20, 24, 28, 32, 64])('creates and restores %i-byte shared secrets in any share order', (length) => {
    const seed = Uint8Array.from({ length }, (_, index) => (index * 19 + 11) & 0xff);
    const backup = createCodex32Backup(seed, 'seed', 3, 5);
    expect(backup.shares).toHaveLength(5);
    expect(recoverCodex32Seed([backup.shares[4]!, backup.shares[0]!, backup.shares[2]!])).toEqual(seed);
    expect(seed).toEqual(Uint8Array.from({ length }, (_, index) => (index * 19 + 11) & 0xff));
  });

  it('rejects unsupported lengths, identifiers, thresholds, and counts', () => {
    expect(() => createCodex32Backup(new Uint8Array(15), 'seed', 0, 1)).toThrow(/16, 20, 24, 28, 32, or 64/u);
    expect(() => createCodex32Backup(new Uint8Array(16), 'io1l', 0, 1)).toThrow(/identifier/u);
    expect(() => createCodex32Backup(new Uint8Array(16), 'seed', 1, 1)).toThrow(/threshold/u);
    expect(() => createCodex32Backup(new Uint8Array(16), 'seed', 3, 2)).toThrow(/count/u);
    expect(() => createCodex32Backup(new Uint8Array(16), 'seed', 0, 2)).toThrow(/exactly one/u);
    expect(() => recoverCodex32Seed([])).toThrow(/at least one/u);
  });

  it('rejects bad checksums, repeated shares, mixed sets, and too few shares', () => {
    const seed = new Uint8Array(16).fill(9);
    const first = createCodex32Backup(seed, 'seed', 3, 4);
    const second = createCodex32Backup(seed, 'cash', 3, 4);
    expect(() => recoverCodex32Seed(first.shares.slice(0, 2))).toThrow(
      /3 distinct compatible shares are required; 2 were supplied/u,
    );
    expect(() => recoverCodex32Seed([first.shares[0]!, first.shares[0]!, first.shares[1]!])).toThrow(
      /same Codex32 share index/u,
    );
    expect(() => recoverCodex32Seed([first.shares[0]!, first.shares[1]!, second.shares[2]!])).toThrow(
      /different identifiers/u,
    );
    expect(() => recoverCodex32Seed([first.shares[0]!.toUpperCase(), first.shares[1]!, first.shares[2]!])).toThrow(
      /incompatible prefixes/u,
    );
    const damaged = `${first.shares[0]!.slice(0, -1)}${first.shares[0]!.endsWith('q') ? 'p' : 'q'}`;
    expect(() => recoverCodex32Seed([damaged, first.shares[1]!, first.shares[2]!])).toThrow(/invalid checksum/u);
  });
});
