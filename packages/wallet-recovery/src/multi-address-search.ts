import type { AddressSearchMatch } from "./address-search.js";
import type { AddressSearchTarget } from "./address-targets.js";
import { LocalSearchAdmission } from "./local-search-admission.js";
import { LocalSearchQueue } from "./local-search-queue.js";

export { MAX_LOCAL_SEARCH_CONCURRENCY } from "./local-search-admission.js";

interface MultiAddressSearchResult {
  readonly target: AddressSearchTarget;
  readonly match: AddressSearchMatch | null;
  readonly error?: string;
}

interface MultiAddressSearchOptions {
  readonly targets: readonly AddressSearchTarget[];
  readonly start: number;
  readonly count: number;
  readonly concurrency?: number | undefined;
  readonly signal?: AbortSignal;
  readonly search: (
    adapterId: AddressSearchTarget["adapterId"],
    target: AddressSearchTarget,
    start: number,
    count: number,
    signal?: AbortSignal,
  ) => Promise<AddressSearchMatch | null>;
  readonly onProgress?: (completed: number, total: number) => void;
}

export async function searchAcrossAddresses(
  options: MultiAddressSearchOptions,
): Promise<MultiAddressSearchResult[]> {
  const { targets } = options;
  LocalSearchAdmission.range(options.start, options.count);
  return LocalSearchQueue.run<MultiAddressSearchResult>({
    total: targets.length,
    concurrency: options.concurrency,
    signal: options.signal,
    onProgress: options.onProgress,
    execute: async (index) => {
      const target = targets[index]!;
      try {
        const match = await options.search(
          target.adapterId,
          target,
          options.start,
          options.count,
          options.signal,
        );
        return { target, match };
      } catch (cause) {
        if (options.signal?.aborted === true) throw cause;
        return {
          target,
          match: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  });
}
