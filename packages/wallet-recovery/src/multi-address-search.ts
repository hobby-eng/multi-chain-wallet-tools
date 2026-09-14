export const MAX_LOCAL_SEARCH_CONCURRENCY = 5;

import type { AddressSearchMatch } from './address-search.js';
import type { AddressSearchTarget } from './address-targets.js';

export interface MultiAddressSearchResult {
  readonly target: AddressSearchTarget;
  readonly match: AddressSearchMatch | null;
  readonly error?: string;
}

export interface MultiAddressSearchOptions {
  readonly targets: readonly AddressSearchTarget[];
  readonly start: number;
  readonly count: number;
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly search: (
    adapterId: AddressSearchTarget['adapterId'],
    target: AddressSearchTarget,
    start: number,
    count: number,
    signal?: AbortSignal,
  ) => Promise<AddressSearchMatch | null>;
  readonly onProgress?: (completed: number, total: number) => void;
}

export async function searchAcrossAddresses(options: MultiAddressSearchOptions): Promise<MultiAddressSearchResult[]> {
  const { targets, concurrency = 2 } = options;
  const results = new Array<MultiAddressSearchResult>(targets.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      options.signal?.throwIfAborted();
      const index = next;
      next += 1;
      if (index >= targets.length) return;
      const target = targets[index]!;
      try {
        const match = await options.search(target.adapterId, target, options.start, options.count, options.signal);
        results[index] = { target, match };
      } catch (cause) {
        if (options.signal?.aborted === true) throw cause;
        results[index] = { target, match: null, error: cause instanceof Error ? cause.message : String(cause) };
      }
      options.onProgress?.(results.filter(Boolean).length, targets.length);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), MAX_LOCAL_SEARCH_CONCURRENCY, Math.max(1, targets.length)) },
      () => worker(),
    ),
  );
  return results;
}
