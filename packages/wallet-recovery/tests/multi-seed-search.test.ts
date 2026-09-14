import { describe, expect, it } from 'vitest';
import { searchAcrossSeedsAndAddresses } from '../src/multi-seed-search.js';
import type { AddressSearchTarget } from '../src/address-targets.js';

const target = (input: string): AddressSearchTarget => ({
  input,
  normalized: input,
  adapterId: 'bitcoin-legacy',
  network: 'mainnet',
});

describe('multi-seed address search', () => {
  it('runs the seed-target matrix with bounded concurrency and preserves association', async () => {
    const seeds = [
      { id: 'seed-a', label: 'A', seed: new Uint8Array([1]) },
      { id: 'seed-b', label: 'B', seed: new Uint8Array([2]) },
    ];
    const results = await searchAcrossSeedsAndAddresses({
      seeds,
      targets: [target('one'), target('two')],
      start: 0,
      count: 10,
      concurrency: 2,
      search: async (seed, _adapterId, address) =>
        seed[0] === 2 && address.input === 'two' ? { index: 4, path: 'm/44/0/0', address: address.input } : null,
    });
    expect(results.map((result) => `${result.seedId}:${result.target.input}:${result.match?.index ?? '-'}`)).toEqual([
      'seed-a:one:-',
      'seed-a:two:-',
      'seed-b:one:-',
      'seed-b:two:4',
    ]);
    expect([...seeds[0]!.seed, ...seeds[1]!.seed]).toEqual([0, 0]);
  });

  it('keeps one target failure isolated from other seed-target jobs', async () => {
    const seeds = [{ id: 'seed-a', label: 'A', seed: new Uint8Array([1]) }];
    const results = await searchAcrossSeedsAndAddresses({
      seeds,
      targets: [target('bad'), target('good')],
      start: 0,
      count: 1,
      search: async (_seed, _adapterId, address) => {
        if (address.input === 'bad') throw new Error('target failed');
        return { index: 0, path: 'm/0', address: address.input };
      },
    });
    expect(results[0]?.error).toBe('target failed');
    expect(results[1]?.match?.address).toBe('good');
  });

  it('reports progress for every target and preserves target order', async () => {
    const progress: Array<[number, number]> = [];
    const results = await searchAcrossSeedsAndAddresses({
      seeds: [{ id: 'seed-a', label: 'A', seed: new Uint8Array([1]) }],
      targets: [target('one'), target('two')],
      start: 0,
      count: 1,
      search: async (_seed, _adapterId, address) => ({ index: 0, path: 'm/0', address: address.input }),
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    expect(results.map((result) => result.target.input)).toEqual(['one', 'two']);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('propagates cancellation instead of returning stale partial results', async () => {
    const controller = new AbortController();
    const seeds = [
      { id: 'seed-a', label: 'A', seed: new Uint8Array([1]) },
      { id: 'seed-b', label: 'B', seed: new Uint8Array([2]) },
    ];
    await expect(
      searchAcrossSeedsAndAddresses({
        seeds,
        targets: [target('one'), target('two')],
        start: 0,
        count: 1,
        concurrency: 1,
        signal: controller.signal,
        search: async () => {
          controller.abort();
          return null;
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect([...seeds[0]!.seed, ...seeds[1]!.seed]).toEqual([0, 0]);
  });
});
