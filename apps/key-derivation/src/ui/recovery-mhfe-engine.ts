// The MHFE browser package as the panel uses it. Every operation runs in a fresh worker that the
// client terminates when it ends or is stopped, which also frees the 2 GiB of Argon2 memory.
import { MhfeClient } from "@ckd/recovery-mhfe-wasm/client.js";
import mhfeCoreWasm from "@ckd/recovery-mhfe-wasm/mhfe_core_bg.wasm";

// Texts of the package's classic scripts, embedded by build-key-derivation-html.mjs.
declare const __MHFE_WORKER_SOURCE__: string;
declare const __MHFE_ARGON2_THREADED_SOURCE__: string;
declare const __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: string;

/** Argon2 threads of the browser package in fast mode; the file version gets one. */
export const FAST_MODE_THREADS = 4;
/** The only memory level a browser supports: 2 GiB, the limit of 32-bit WebAssembly Argon2. */
export const MEMORY_LEVEL = 0;

export class MhfeEngine {
  #client: MhfeClient | undefined;

  /**
   * Opened as a file, the page cannot be cross-origin isolated, so the browser gives Argon2 one
   * thread; the executable version of the tool serves the same page with the headers four threads need.
   */
  get fastMode(): boolean {
    return globalThis.crossOriginIsolated === true;
  }

  /** The client is created on first use, so that a page that never uses MHFE does no work for it. */
  get client(): MhfeClient {
    this.#client ??= new MhfeClient({
      workerSource: __MHFE_WORKER_SOURCE__,
      argon2Threaded: __MHFE_ARGON2_THREADED_SOURCE__,
      argon2SingleThreaded: __MHFE_ARGON2_SINGLE_THREADED_SOURCE__,
      coreWasm: mhfeCoreWasm,
    });
    return this.#client;
  }

  /** Runs one operation with its Cancel button shown; Cancel discards the worker and its memory. */
  async runCancellable<T>(cancel: HTMLButtonElement, operation: () => Promise<T>): Promise<T> {
    cancel.hidden = false;
    cancel.onclick = () => this.#client?.cancel();
    try {
      return await operation();
    } finally {
      cancel.hidden = true;
      cancel.onclick = null;
    }
  }
}
