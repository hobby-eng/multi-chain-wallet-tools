import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { Slip39RestoreRequest } from "@ckd/recovery-backup/slip39-restore-request.js";
import { RecoveryWorkerProtocol, type WorkerFailure } from "./recovery-worker-protocol.js";

const ERRORS = new ErrorCatalog("wallet.slip39-worker", {
  buffer: () => "The recovered entropy cannot be transferred from this worker.",
});

/** Dedicated-worker native edges; the result buffer transfers ownership to the page. */
export interface Slip39WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(
    message: { type: "ready" } | { type: "result"; outcome: Uint8Array } | WorkerFailure,
    transfer?: Transferable[],
  ): void;
}

/** Executes one admitted recovery in its own disposable worker, with no main-thread fallback. */
export class Slip39WorkerRuntime {
  /** Installs the native receiver; generic client termination cancels an in-flight synchronous KDF. */
  constructor(scope: Slip39WorkerScope) {
    scope.onmessage = (event) => {
      // This isolate accepts exactly one request, including a request it refuses.
      scope.onmessage = null;
      try {
        using request = new Slip39RestoreRequest(event.data);
        const entropy = request.recover();
        try {
          const buffer = entropy.buffer;
          if (!(buffer instanceof ArrayBuffer)) throw ERRORS.create("buffer", []);
          scope.postMessage({ type: "result", outcome: entropy }, [buffer]);
        } finally {
          if (entropy.byteLength !== 0) entropy.fill(0);
        }
      } catch (cause) {
        scope.postMessage(RecoveryWorkerProtocol.failure(cause, "SLIP-39"));
      }
    };
    scope.postMessage({ type: "ready" });
  }
}
