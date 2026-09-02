import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import type { DerivationResult } from '@ckd/core/types.js';

function clearTemporaryResult(result: DerivationResult | null): void {
  if (result === null) return;
  for (const field of [...result.basicSummary, ...result.summary]) field.value = '';
  if (result.watchOnly !== undefined) result.watchOnly.text = '';
  for (const row of result.rows) {
    row.path = '';
    for (const field of [...row.basic, ...row.advanced]) field.value = '';
  }
}

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
): Promise<AddressSearchMatch | null> {
  const expected = expectedAddress.trim();
  if (expected.length === 0) throw new Error('Enter an expected address to search for.');
  if (!Number.isSafeInteger(start) || start < 0) throw new Error('Search start must be a non-negative integer.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 5000) {
    throw new Error('Search count must be an integer from 1 to 5000.');
  }
  const startMax = adapter.limits?.startMax ?? 2_147_483_647;
  if (start + count - 1 > startMax) throw new Error(`The search range exceeds index ${startMax}.`);
  const batchMax = adapter.batchSize ?? 50;
  let offset = 0;
  while (offset < count) {
    const batchCount = Math.min(batchMax, count - offset);
    let result: DerivationResult | null = null;
    const batchSeed = baseInput.seed.slice();
    try {
      result = await adapter.derive({ ...baseInput, seed: batchSeed, start: start + offset, count: batchCount });
      for (const row of result.rows) {
        const address = row.basic.find(({ key }) => key === 'address')?.value;
        if (address !== undefined && (adapter.addressesEqual?.(address, expected) ?? address === expected)) {
          return { index: row.index, path: row.path, address };
        }
      }
    } finally {
      batchSeed.fill(0);
      clearTemporaryResult(result);
    }
    offset += batchCount;
  }
  return null;
}
