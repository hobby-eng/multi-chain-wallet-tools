import { LocalSearchAdmission } from "./local-search-admission.js";

interface LocalSearchQueueOptions<Result> {
  readonly total: number;
  readonly concurrency?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly execute: (index: number) => Promise<Result>;
  readonly onProgress?:
    ((completed: number, total: number, result: Result, index: number) => void) | undefined;
}

/** Bounded indexed jobs; completion order never changes result association. */
export class LocalSearchQueue {
  static async run<Result>(options: LocalSearchQueueOptions<Result>): Promise<Result[]> {
    const concurrency = LocalSearchAdmission.concurrency(options.concurrency);
    if (!Number.isSafeInteger(options.total) || options.total < 0)
      throw new Error("Search job count must be a non-negative safe integer.");
    options.signal?.throwIfAborted();
    const results = new Array<Result>(options.total);
    let next = 0;
    let completed = 0;
    let failed = false;
    let failure: unknown;
    const worker = async (): Promise<void> => {
      try {
        while (!failed) {
          options.signal?.throwIfAborted();
          if (next >= options.total) return;
          const index = next;
          next += 1;
          const result = await options.execute(index);
          options.signal?.throwIfAborted();
          if (failed) return;
          results[index] = result;
          completed += 1;
          options.onProgress?.(completed, options.total, result, index);
        }
      } catch (cause) {
        if (!failed) {
          failed = true;
          failure = cause;
        }
      }
    };
    // Drain admitted jobs before rejecting: the caller may wipe their seeds in finally.
    await Promise.all(Array.from({ length: Math.min(concurrency, options.total) }, () => worker()));
    if (failed) throw failure;
    options.signal?.throwIfAborted();
    return results;
  }
}
