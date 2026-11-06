import { MAX_BATCH_SIZE } from "@ckd/core/bip32-limits.js";
import { clearDerivationResult, DerivationSecrets } from "@ckd/core/secrets.js";
import type { DerivationResult } from "@ckd/core/types.js";
import type { CoinAdapter, CoinDerivationInput } from "./registry-base.js";
import type { DerivationParameters } from "./derivation-request.js";
import type { ResultBranch, ResultBranchPlan } from "./derivation-branches.js";

/** The only worker capability a stream borrows; it does not own worker termination. */
export interface DerivationBatchWorker {
  derive(adapterId: string, input: CoinDerivationInput): Promise<DerivationResult>;
}

/** Host callbacks for one operation; the initial callback takes ownership of its result. */
export interface DerivationStreamCallbacks {
  readonly isStale: () => boolean;
  readonly isCancelled: () => boolean;
  readonly onInitialBatch: (branch: ResultBranch, result: DerivationResult) => void;
  readonly onAppendedBatch: (branch: ResultBranch, rows: DerivationResult["rows"]) => void;
  readonly onProgress: (branch: ResultBranch, branchCount: number, totalCount: number) => void;
  readonly yieldTurn: () => Promise<void>;
}

/** A completed stream, a revoked source, or an explicit stop; partial counts stay distinct. */
export interface DerivationStreamOutcome {
  readonly generated: number;
  readonly stale: boolean;
  readonly cancelled: boolean;
}

type StreamErrorCode =
  "derivation.stream.batch-size" | "derivation.stream.batch" | "derivation.stream.active";

/** Refusal of invalid worker output or concurrent use, with no wallet material in the error. */
export class DerivationStreamError extends Error {
  readonly #code: StreamErrorCode;

  constructor(code: StreamErrorCode) {
    super(code);
    this.name = "DerivationStreamError";
    this.#code = code;
  }

  /** Stable identity for each front end's message catalogue. */
  get code(): StreamErrorCode {
    return this.#code;
  }
}

interface StreamSettings {
  readonly worker: DerivationBatchWorker;
  readonly adapter: Pick<CoinAdapter, "id" | "batchSize">;
  readonly input: DerivationParameters;
  readonly branches: readonly ResultBranchPlan[];
}

/** Owns bounded batch orchestration over an admitted range; it never retains a seed in fields. */
export class DerivationStream {
  readonly #worker: DerivationBatchWorker;
  readonly #adapterId: string;
  readonly #batchSize: number;
  readonly #input: Readonly<DerivationParameters>;
  readonly #branches: readonly ResultBranchPlan[];
  #running = false;

  /** Release completed branch containers when their host revokes publication or ownership. */
  static discard(results: Map<ResultBranch, DerivationResult>): void {
    try {
      DerivationSecrets.clearAll([...results.values()]);
    } finally {
      results.clear();
    }
  }

  /** Snapshot public settings after path/range admission; the caller keeps the worker lifetime. */
  constructor({ worker, adapter, input, branches }: StreamSettings) {
    const batchSize = adapter.batchSize ?? MAX_BATCH_SIZE;
    if (!Number.isSafeInteger(batchSize) || batchSize < 1)
      throw new DerivationStreamError("derivation.stream.batch-size");
    const { network, account, branch, start, count, includeChange, includeCoinJoin } = input;
    this.#worker = worker;
    this.#adapterId = adapter.id;
    this.#batchSize = batchSize;
    this.#input = Object.freeze({
      network,
      account,
      branch,
      start,
      count,
      includeChange,
      includeCoinJoin,
    });
    this.#branches = Object.freeze(
      branches.map(({ kind, branch, workerAdapterId }) =>
        Object.freeze({
          kind,
          branch,
          ...(workerAdapterId === undefined ? {} : { workerAdapterId }),
        }),
      ),
    );
  }

  /** Borrow the seed until the promise settles; callbacks own initial results and appended rows. */
  async run(
    seed: Uint8Array,
    callbacks: DerivationStreamCallbacks,
  ): Promise<DerivationStreamOutcome> {
    if (this.#running) throw new DerivationStreamError("derivation.stream.active");
    this.#running = true;
    try {
      return await this.#run(seed, callbacks);
    } finally {
      this.#running = false;
    }
  }

  async #run(
    seed: Uint8Array,
    callbacks: DerivationStreamCallbacks,
  ): Promise<DerivationStreamOutcome> {
    const input = this.#input;
    let total = 0;
    for (const { kind, branch, workerAdapterId } of this.#branches) {
      let destination: DerivationResult | undefined;
      let generated = 0;
      while (generated < input.count) {
        if (callbacks.isStale()) return { generated: total, stale: true, cancelled: false };
        if (callbacks.isCancelled()) return { generated: total, stale: false, cancelled: true };
        const count = Math.min(this.#batchSize, input.count - generated);
        const batch = await this.#worker.derive(workerAdapterId ?? this.#adapterId, {
          seed,
          network: input.network,
          account: input.account,
          branch,
          start: input.start + generated,
          count,
        });
        const stale = callbacks.isStale();
        if (stale || callbacks.isCancelled()) {
          clearDerivationResult(batch);
          return { generated: total, stale, cancelled: !stale };
        }
        if (
          batch.rows.length !== count ||
          (destination !== undefined && batch.id !== destination.id)
        ) {
          clearDerivationResult(batch);
          throw new DerivationStreamError("derivation.stream.batch");
        }
        if (destination === undefined) {
          DerivationSecrets.take(batch);
          destination = batch;
          callbacks.onInitialBatch(kind, batch);
        } else {
          try {
            DerivationSecrets.take(batch);
            const rows = batch.rows.splice(0);
            destination.rows.push(...rows);
            callbacks.onAppendedBatch(kind, rows);
          } finally {
            clearDerivationResult(batch);
          }
        }
        generated += count;
        total += count;
        callbacks.onProgress(kind, generated, total);
        if (generated < input.count) await callbacks.yieldTurn();
      }
    }
    return { generated: total, stale: false, cancelled: false };
  }

  /** Transfer all complete branches together; stale/failing work releases every collected result. */
  async all(
    seed: Uint8Array,
    host: Pick<DerivationStreamCallbacks, "isStale" | "yieldTurn">,
  ): Promise<Map<ResultBranch, DerivationResult> | undefined> {
    const results = new Map<ResultBranch, DerivationResult>();
    let transferred = false;
    try {
      const outcome = await this.run(seed, {
        ...host,
        isCancelled: () => false,
        onInitialBatch: (branch, result) => {
          results.set(branch, result);
        },
        onAppendedBatch: () => undefined,
        onProgress: () => undefined,
      });
      if (outcome.stale || outcome.cancelled) return undefined;
      transferred = true;
      return results;
    } finally {
      if (!transferred) {
        DerivationStream.discard(results);
      }
    }
  }
}
