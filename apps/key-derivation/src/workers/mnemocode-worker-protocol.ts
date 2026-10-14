import { errorCode } from "../../../../packages/recovery-mnemocode/source/core/refusal.js";

/** A cancellation is a terminal result; it carries no private partial candidates. */
export interface WorkerStopped {
  readonly kind: "stopped";
}

/** Only safe refusal fields cross the worker boundary; causes and buffers stay with their owner. */
export interface WorkerFailure {
  readonly type: "error";
  readonly name: "Error" | "TypeError" | "RangeError";
  readonly message: string;
  readonly code?: string;
}

/** The worker and every tab use the same cancellation discriminator. */
export const WORKER_STOPPED: WorkerStopped = Object.freeze({ kind: "stopped" });

/** Owns the message boundary, native refusal reconstruction and stopped-result admission. */
export class MnemoCodeWorkerProtocol {
  /** Coded library refusals retain their safe text; unknown faults never stringify supplied data. */
  static failure(cause: unknown): WorkerFailure {
    const code = errorCode(cause);
    return {
      type: "error",
      name:
        cause instanceof RangeError
          ? "RangeError"
          : cause instanceof TypeError
            ? "TypeError"
            : "Error",
      message:
        code !== undefined && cause instanceof Error
          ? cause.message
          : "The MnemoCode worker failed.",
      ...(code === undefined ? {} : { code }),
    };
  }

  /** Reconstructs native kind and immutable code, deliberately omitting an arbitrary remote cause. */
  static refusal(reply: WorkerFailure): Error {
    const NativeError =
      reply.name === "TypeError" ? TypeError : reply.name === "RangeError" ? RangeError : Error;
    const error = new NativeError(reply.message);
    if (reply.code !== undefined)
      Object.defineProperty(error, "code", {
        value: reply.code,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    return error;
  }

  /** Returns only a completed result; stopped partial buffers are wiped before being discarded. */
  static completed<T>(value: T | WorkerStopped): Exclude<T, WorkerStopped> | undefined {
    if (
      typeof value === "object" &&
      value !== null &&
      (("kind" in value && value.kind === "stopped") ||
        ("stopped" in value && value.stopped === true))
    ) {
      if (
        "list" in value &&
        typeof value.list === "object" &&
        value.list !== null &&
        "bytes" in value.list &&
        value.list.bytes instanceof Uint8Array
      )
        value.list.bytes.fill(0);
      return undefined;
    }
    // The checked discriminator excludes both stopped wire results and partial search results.
    return value as Exclude<T, WorkerStopped>;
  }
}
