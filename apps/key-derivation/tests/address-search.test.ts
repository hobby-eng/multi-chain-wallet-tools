import { describe, expect, it } from 'vitest';
import { findDerivedAddress } from '../src/address-search.js';
import { field, type DerivationResult } from '@ckd/core/types.js';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';

function result(start: number, count: number): DerivationResult {
  return {
    id: 'fake', title: 'Fake', networkLabel: 'Test', pathTemplate: 'm/i',
    basicSummary: [], summary: [], notices: [],
    rows: Array.from({ length: count }, (_, offset) => {
      const index = start + offset;
      return { index, title: `#${index}`, path: `m/${index}`, basic: [field('address', 'Address', `address-${index}`)], advanced: [] };
    }),
  };
}

const adapter: RuntimeCoinAdapter = {
  id: 'fake', group: 'Fake', label: 'Fake', variantLabel: 'Fake', networkControl: true,
  defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 5 },
  limits: { startMax: 100 },
  batchSize: 3,
  fieldRoles: { addresses: ['address'], publicKeys: [], privateKeys: [] },
  pathPreview: () => 'm/i',
  derive: ({ start, count }) => result(start, count),
};

describe('bounded address verification search', () => {
  it('searches in adapter-sized batches and returns index and path', async () => {
    const match = await findDerivedAddress(
      adapter,
      { seed: new Uint8Array(64), network: 'mainnet', account: 0, branch: 0 },
      ' address-7 ',
      2,
      8,
    );
    expect(match).toEqual({ index: 7, path: 'm/7', address: 'address-7' });
  });

  it('returns null and rejects unbounded or overflowing ranges', async () => {
    const base = { seed: new Uint8Array(64), network: 'mainnet' as const, account: 0, branch: 0 };
    await expect(findDerivedAddress(adapter, base, 'missing', 0, 5)).resolves.toBeNull();
    await expect(findDerivedAddress(adapter, base, 'x', 0, 5001)).rejects.toThrow(/1 to 5000/u);
    await expect(findDerivedAddress(adapter, base, 'x', 99, 3)).rejects.toThrow(/exceeds/u);
  });

  it('clears temporary result strings after each batch', async () => {
    const produced: DerivationResult[] = [];
    const instrumented = { ...adapter, derive: ({ start, count }: { start: number; count: number }) => {
      const batch = result(start, count);
      batch.rows[0]!.groups = [{
        key: 'keys',
        title: 'Keys',
        basic: [field('privateKey', 'Private key', 'group-secret-basic')],
        advanced: [field('wif', 'WIF', 'group-secret-advanced')],
      }];
      produced.push(batch);
      return batch;
    } } satisfies RuntimeCoinAdapter;
    await findDerivedAddress(
      instrumented,
      { seed: new Uint8Array(64), network: 'mainnet', account: 0, branch: 0 },
      'missing',
      0,
      5,
    );
    expect(produced).toHaveLength(2);
    expect(produced.every(({ rows }) => rows.length === 0)).toBe(true);
  });

  it('uses a fresh seed copy for every batch when an adapter zeroes its input boundary', async () => {
    const zeroing = { ...adapter, derive: ({ seed, start, count }: { seed: Uint8Array; start: number; count: number }) => {
      if (seed[0] !== 7) throw new Error('seed copy was not refreshed');
      seed.fill(0);
      return result(start, count);
    } } satisfies RuntimeCoinAdapter;
    const sourceSeed = new Uint8Array(64).fill(7);
    const match = await findDerivedAddress(
      zeroing,
      { seed: sourceSeed, network: 'mainnet', account: 0, branch: 0 },
      'address-4',
      0,
      6,
    );
    expect(match?.index).toBe(4);
    expect(sourceSeed.every((byte) => byte === 7)).toBe(true);
    sourceSeed.fill(0);
  });
});
