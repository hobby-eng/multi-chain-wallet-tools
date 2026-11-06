// Shared page-side lifetime for one embedded recovery worker and one request.
// Termination drops the operation and its isolated worker; no secure heap-erasure claim.
import { EmbeddedWorkerResource } from "@ckd/ui/embedded-worker-resource.js";
import {
  RecoveryWorkerProtocol,
  WORKER_STOPPED,
  type WorkerStopped,
  type WorkerFailure,
} from "./recovery-worker-protocol.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

/** The text a stopped job reports, as MHFE's Cancel says it. */
export const JOB_STOPPED = "Stopped. The worker and its memory were discarded.";
function workerErrors(label: string, prefix: string) {
  return new ErrorCatalog(prefix, {
    discard: () => `The ${label} worker result could not be released.`,
    cleanup: () => `The ${label} worker could not be released normally.`,
    startup: () => `The ${label} worker did not become ready in time.`,
    unexpected: () => `The ${label} worker stopped unexpectedly.`,
    progress: () => `The ${label} worker progress could not be displayed.`,
    closed: () => JOB_STOPPED,
    started: () => `The ${label} worker has already started a job.`,
  });
}

/** Presentation and public script prelude for an independently embedded recovery operation. */
export interface RecoveryWorkerOptions<Outcome = unknown> {
  readonly label?: string;
  readonly errorPrefix?: string;
  /** Public script data only; private inputs go through run(), never the script source. */
  readonly publicPrelude?: string;
  /** Retires exclusively owned result bytes when delivery is late or cleanup prevents handoff. */
  readonly discardOutcome?: (outcome: Outcome) => void;
}

type WorkerReply<T, Progress> =
  | { type: "ready" }
  | { type: "progress"; progress: Progress }
  | { type: "result"; outcome: T }
  | WorkerFailure;

/** A single request owns startup, progress, terminal settlement and cancellation together. */
export class RecoveryWorker<Request, Outcome, Progress = unknown> implements Disposable {
  readonly #resource: EmbeddedWorkerResource;
  readonly #errors: ReturnType<typeof workerErrors>;
  readonly #label: string;
  readonly #discardOutcome: ((outcome: Outcome) => void) | undefined;
  #pending:
    | { resolve: (outcome: Outcome | WorkerStopped) => void; reject: (cause: Error) => void }
    | undefined;
  #onProgress: ((progress: Progress) => void) | undefined;
  #ended = false;
  #started = false;

  /**
   * `source` is the build's embedded script. Its adapter supplies any public data prelude;
   * the generic lifecycle imports no codec or wordlist.
   */
  constructor(source: string, options: RecoveryWorkerOptions<Outcome> = {}) {
    this.#discardOutcome = options.discardOutcome;
    this.#label = options.label ?? "Recovery";
    this.#errors = workerErrors(this.#label, options.errorPrefix ?? "wallet.recovery-worker");
    this.#resource = new EmbeddedWorkerResource([options.publicPrelude ?? "", source], {}, () =>
      this.#fail(this.#errors.create("startup", [])),
    );
    this.#resource.worker.onmessage = ({ data }: MessageEvent<WorkerReply<Outcome, Progress>>) => {
      if (this.#ended) {
        if (data.type === "result") {
          const failure = this.#discard(data.outcome);
          if (failure !== undefined) throw failure;
        }
        return;
      }
      if (data.type === "ready") {
        try {
          this.#resource.loaded();
        } catch {
          this.#fail(this.#errors.create("cleanup", []));
        }
        return;
      }
      if (data.type === "progress") {
        try {
          this.#onProgress?.(data.progress);
        } catch {
          this.#fail(this.#errors.create("progress", []));
        }
        return;
      }
      if (data.type === "error") this.#fail(RecoveryWorkerProtocol.refusal(data));
      else this.#settle({ kind: "completed", value: data.outcome });
    };
    this.#resource.worker.onerror = (event) => {
      event.preventDefault();
      this.#fail(this.#errors.create("unexpected", []));
    };
  }

  /** Runs one job; progress arrives a few times a second. */
  run(
    request: Request,
    onProgress: (progress: Progress) => void,
    transfer: readonly Transferable[] = [],
  ): Promise<Outcome | WorkerStopped> {
    if (this.#ended) return Promise.reject(this.#errors.create("closed", []));
    if (this.#started) return Promise.reject(this.#errors.create("started", []));
    this.#started = true;
    this.#onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.#pending = { resolve, reject };
      try {
        if (transfer.length === 0) this.#resource.worker.postMessage(request);
        else this.#resource.worker.postMessage(request, [...transfer]);
      } catch (cause) {
        this.#fail(
          cause instanceof Error
            ? cause
            : RecoveryWorkerProtocol.refusal(RecoveryWorkerProtocol.failure(cause, this.#label)),
        );
      }
    });
  }

  /** Stops the worker at once; cleanup failure rejects safely instead of stranding its request. */
  terminate(): void {
    this.#settle({ kind: "stopped" });
  }

  #fail(cause: Error): void {
    this.#settle({ kind: "failed", cause });
  }

  #settle(
    outcome:
      | { kind: "completed"; value: Outcome }
      | { kind: "stopped" }
      | { kind: "failed"; cause: Error },
  ): void {
    if (this.#ended) return;
    this.#ended = true;
    const pending = this.#pending;
    this.#pending = undefined;
    this.#onProgress = undefined;
    try {
      this.#resource.dispose();
    } catch {
      // The first refusal remains primary; a cleanup-only fault has its own safe diagnostic.
      const discardFailure =
        outcome.kind === "completed" ? this.#discard(outcome.value) : undefined;
      pending?.reject(
        outcome.kind === "failed"
          ? outcome.cause
          : (discardFailure ?? this.#errors.create("cleanup", [])),
      );
      return;
    }
    if (outcome.kind === "failed") pending?.reject(outcome.cause);
    else pending?.resolve(outcome.kind === "stopped" ? WORKER_STOPPED : outcome.value);
  }
  #discard(value: Outcome): Error | undefined {
    try {
      this.#discardOutcome?.(value);
      return undefined;
    } catch {
      return this.#errors.create("discard", []);
    }
  }
  /** Releases this resource when a using scope exits. */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
