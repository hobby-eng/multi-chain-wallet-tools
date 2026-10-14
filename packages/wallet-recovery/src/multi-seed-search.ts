import type { AddressSearchMatch } from "./address-search.js";
import type { AddressSearchTarget } from "./address-targets.js";
import { LocalSearchAdmission } from "./local-search-admission.js";
import { LocalSearchQueue } from "./local-search-queue.js";

export { MAX_LOCAL_SEARCH_CONCURRENCY } from "./local-search-admission.js";

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

interface MultiSeedSearchOptions {
  readonly seeds: readonly RecoverySeedTarget[];
  readonly targets: readonly AddressSearchTarget[];
  readonly start: number;
  readonly count: number;
  readonly concurrency?: number | undefined;
  readonly signal?: AbortSignal;
  readonly search: (
    seed: Uint8Array,
    adapterId: AddressSearchTarget["adapterId"],
    target: AddressSearchTarget,
    start: number,
    count: number,
    signal?: AbortSignal,
  ) => Promise<AddressSearchMatch | null>;
  readonly onProgress?: (
    completed: number,
    total: number,
    result: MultiSeedAddressResult,
    index: number,
  ) => void;
}

export async function searchAcrossSeedsAndAddresses(
  options: MultiSeedSearchOptions,
): Promise<MultiSeedAddressResult[]> {
  try {
    LocalSearchAdmission.range(options.start, options.count);
    return await LocalSearchQueue.run<MultiSeedAddressResult>({
      total: options.seeds.length * options.targets.length,
      concurrency: options.concurrency,
      signal: options.signal,
      onProgress: options.onProgress,
      execute: async (index) => {
        const seed = options.seeds[Math.floor(index / options.targets.length)]!;
        const target = options.targets[index % options.targets.length]!;
        let match: AddressSearchMatch | null = null;
        let error: string | undefined;
        try {
          match = await options.search(
            seed.seed,
            target.adapterId,
            target,
            options.start,
            options.count,
            options.signal,
          );
        } catch (cause) {
          if (options.signal?.aborted === true) throw cause;
          error = cause instanceof Error ? cause.message : String(cause);
        }
        return {
          seedId: seed.id,
          seedLabel: seed.label,
          target,
          match,
          ...(error === undefined ? {} : { error }),
        };
      },
    });
  } finally {
    for (const seed of options.seeds) seed.seed.fill(0);
  }
}
