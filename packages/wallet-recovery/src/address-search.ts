import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import type { DerivationResult } from '@ckd/core/types.js';

export interface AddressSearchMatch {
  index: number;
  path: string;
  address: string;
}

export async function findDerivedAddress(
  adapter: RuntimeCoinAdapter,
  baseInput: Omit<CoinDerivationInput, 'start' | 'count'>,
  expectedAddress: string,
  start: number,
  count: number,
  signal?: AbortSignal,
): Promise<AddressSearchMatch | null> {
  const expected = expectedAddress.trim();
  if (expected.length === 0) throw new Error('Enter an expected address to search for.');
  if (!Number.isSafeInteger(start) || start < 0) throw new Error('Search start must be a non-negative integer.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 5000)
    throw new Error('Search count must be an integer from 1 to 5000.');
  const startMax = adapter.limits?.startMax ?? 2_147_483_647;
  if (start + count - 1 > startMax) throw new Error(`The search range exceeds index ${startMax}.`);
  const batchMax = adapter.batchSize ?? 50;
  let offset = 0;
  while (offset < count) {
    signal?.throwIfAborted();
    const batchCount = Math.min(batchMax, count - offset);
    let result: DerivationResult | null = null;
    const batchSeed = baseInput.seed.slice();
    try {
      result = await adapter.derive({ ...baseInput, seed: batchSeed, start: start + offset, count: batchCount });
      signal?.throwIfAborted();
      for (const row of result.rows) {
        const address = row.basic.find(({ key }) => key === 'address')?.value;
        if (address !== undefined && (adapter.addressesEqual?.(address, expected) ?? address === expected))
          return { index: row.index, path: row.path, address };
      }
    } finally {
      batchSeed.fill(0);
      clearDerivationResult(result);
    }
    offset += batchCount;
  }
  return null;
}

export interface AddressSearchRequest {
  readonly id: string;
  readonly address: string;
}

export interface AddressSearchResult extends AddressSearchMatch {
  readonly id: string;
}

/** Derives each range once and resolves every requested address found in it. */
export async function findDerivedAddresses(
  adapter: RuntimeCoinAdapter,
  baseInput: Omit<CoinDerivationInput, 'start' | 'count'>,
  requests: readonly AddressSearchRequest[],
  start: number,
  count: number,
  signal?: AbortSignal,
): Promise<AddressSearchResult[]> {
  if (requests.length === 0) throw new Error('Enter at least one expected address.');
  if (!Number.isSafeInteger(start) || start < 0) throw new Error('Search start must be a non-negative integer.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 5000)
    throw new Error('Search count must be an integer from 1 to 5000.');
  const startMax = adapter.limits?.startMax ?? 2_147_483_647;
  if (start + count - 1 > startMax) throw new Error(`The search range exceeds index ${startMax}.`);
  const remaining = new Map(requests.map((request) => [request.id, request]));
  const matches: AddressSearchResult[] = [];
  const batchMax = adapter.batchSize ?? 50;
  for (let offset = 0; offset < count && remaining.size > 0; offset += batchMax) {
    signal?.throwIfAborted();
    const batchCount = Math.min(batchMax, count - offset);
    let result: DerivationResult | null = null;
    const batchSeed = baseInput.seed.slice();
    try {
      result = await adapter.derive({ ...baseInput, seed: batchSeed, start: start + offset, count: batchCount });
      signal?.throwIfAborted();
      for (const row of result.rows) {
        const address = row.basic.find(({ key }) => key === 'address')?.value;
        if (address === undefined) continue;
        for (const [id, request] of remaining) {
          if (adapter.addressesEqual?.(address, request.address) ?? address === request.address) {
            matches.push({ id, index: row.index, path: row.path, address });
            remaining.delete(id);
          }
        }
      }
    } finally {
      batchSeed.fill(0);
      clearDerivationResult(result);
    }
  }
  return matches;
}
