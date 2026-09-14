import type { AddressSearchMatch } from './address-search.js';
import type { AddressSearchTarget } from './address-targets.js';

export interface RecoverySeedTarget {
  readonly id: string;
  readonly label: string;
  readonly seed: Uint8Array;
}

export interface MultiSeedAddressResult {
  readonly seedId: string;
  readonly seedLabel: string;
  readonly target: AddressSearchTarget;
  readonly match: AddressSearchMatch | null;
  readonly error?: string;
}

export interface MultiSeedSearchOptions {
  readonly seeds: readonly RecoverySeedTarget[];
  readonly targets: readonly AddressSearchTarget[];
  readonly start: number;
  readonly count: number;
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly search: (
    seed: Uint8Array,
    adapterId: AddressSearchTarget['adapterId'],
    target: AddressSearchTarget,
    start: number,
    count: number,
    signal?: AbortSignal,
  ) => Promise<AddressSearchMatch | null>;
  readonly onProgress?: (completed: number, total: number) => void;
}

export async function searchAcrossSeedsAndAddresses(
  options: MultiSeedSearchOptions,
): Promise<MultiSeedAddressResult[]> {
  const jobs = options.seeds.flatMap((seed) => options.targets.map((target) => ({ seed, target })));
  const results = new Array<MultiSeedAddressResult>(jobs.length);
  let next = 0;
  let completed = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      options.signal?.throwIfAborted();
      const index = next;
      next += 1;
      if (index >= jobs.length) return;
      const job = jobs[index]!;
      let match: AddressSearchMatch | null = null;
      let error: string | undefined;
      try {
        match = await options.search(
          job.seed.seed,
          job.target.adapterId,
          job.target,
          options.start,
          options.count,
          options.signal,
        );
      } catch (cause) {
        if (options.signal?.aborted === true) throw cause;
        error = cause instanceof Error ? cause.message : String(cause);
      }
      results[index] = {
        seedId: job.seed.id,
        seedLabel: job.seed.label,
        target: job.target,
        match,
        ...(error === undefined ? {} : { error }),
      };
      completed += 1;
      options.onProgress?.(completed, jobs.length);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, options.concurrency ?? 2), Math.max(1, jobs.length)) }, () => worker()),
    );
    return results;
  } finally {
    for (const seed of options.seeds) seed.seed.fill(0);
  }
}
