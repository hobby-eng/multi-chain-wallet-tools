export interface RecoveryTaskLimiter {
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

interface WaitingTask {
  resolve(): void;
  reject(cause: unknown): void;
  signal?: AbortSignal;
  abort?: () => void;
}

function abortError(): DOMException {
  return new DOMException('Recovery operation cancelled while waiting for a concurrency slot.', 'AbortError');
}

/** A small abort-aware semaphore shared by every network source in one recovery run. */
export class RecoveryConcurrencyLimiter implements RecoveryTaskLimiter {
  readonly #limit: number;
  #active = 0;
  readonly #waiting: WaitingTask[] = [];

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) {
      throw new Error('Recovery concurrency must be an integer from 1 to 5.');
    }
    this.#limit = limit;
  }

  get active(): number {
    return this.#active;
  }

  get pending(): number {
    return this.#waiting.length;
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.#acquire(signal);
    try {
      if (signal?.aborted === true) throw abortError();
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) throw abortError();
    if (this.#active < this.#limit) {
      this.#active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiting: WaitingTask = { resolve, reject, ...(signal === undefined ? {} : { signal }) };
      if (signal !== undefined) {
        waiting.abort = () => {
          const index = this.#waiting.indexOf(waiting);
          if (index >= 0) this.#waiting.splice(index, 1);
          reject(abortError());
        };
        signal.addEventListener('abort', waiting.abort, { once: true });
      }
      this.#waiting.push(waiting);
    });
  }

  #release(): void {
    for (;;) {
      const waiting = this.#waiting.shift();
      if (waiting === undefined) {
        this.#active -= 1;
        return;
      }
      if (waiting.abort !== undefined) waiting.signal?.removeEventListener('abort', waiting.abort);
      if (waiting.signal?.aborted === true) {
        // The abort listener normally removes and rejects a cancelled waiter
        // before release can reach it. Reject explicitly rather than skipping,
        // so a future change that opens a gap between the aborted check and the
        // listener registration cannot leave a caller permanently unsettled.
        waiting.reject(abortError());
        continue;
      }
      waiting.resolve();
      return;
    }
  }
}

/** Runs CPU/orchestration work concurrently while preserving the input result order. */
export async function mapRecoveryTasks<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<Array<R | undefined>> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 5) {
    throw new Error('Recovery task concurrency must be an integer from 1 to 5.');
  }
  const results: Array<R | undefined> = new Array(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstFailure: unknown;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (failed) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        const item = items[index];
        // Inside the same catch as the task itself: an input array mutated mid
        // run must be reported through firstFailure like any other failure,
        // not as a bare worker rejection that bypasses the accounting.
        if (item === undefined) throw new Error('Recovery task input changed while running.');
        results[index] = await task(item, index);
      } catch (cause) {
        if (!failed) firstFailure = cause;
        failed = true;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (failed) throw firstFailure;
  return results;
}
