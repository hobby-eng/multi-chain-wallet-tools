import { describe, expect, it } from 'vitest';
import { MAX_LOCAL_SEARCH_CONCURRENCY, searchAcrossAddresses } from '../src/multi-address-search.js';
import type { AddressSearchTarget } from '../src/address-targets.js';

const targets: AddressSearchTarget[] = Array.from({ length: 20 }, (_, index) => ({
  input: String(index),
  normalized: String(index),
  adapterId: 'bitcoin-legacy',
  network: 'mainnet',
}));

describe('multi-address search', () => {
  it('caps callers at the reviewed local-search concurrency ceiling', async () => {
    let active = 0;
    let maximum = 0;
    await searchAcrossAddresses({
      targets,
      start: 0,
      count: 1,
      concurrency: Number.MAX_SAFE_INTEGER,
      search: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        return null;
      },
    });
    expect(maximum).toBe(MAX_LOCAL_SEARCH_CONCURRENCY);
  });
});
