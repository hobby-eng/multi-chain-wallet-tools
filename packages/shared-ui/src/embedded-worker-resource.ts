// A worker keeps its Blob URL until its script reports loaded. The deadline bounds a browser
// that never emits either ready or error, including a stop deferred during script loading.
const STARTUP_TIMEOUT_MS = 15_000;

/** Owns an embedded worker, its script URL and its startup deadline as one resource. */
export class EmbeddedWorkerResource {
  readonly #worker: Worker;
  #url: string | undefined;
  #timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  #loaded = false;
  #stopAfterLoad = false;
  #disposed = false;

  constructor(source: readonly BlobPart[], options: WorkerOptions, onTimeout: () => void) {
    if (typeof Worker === "undefined")
      throw new Error("This browser does not support Web Workers.");
    const url = URL.createObjectURL(new Blob([...source], { type: "text/javascript" }));
    this.#url = url;
    let worker: Worker | undefined;
    try {
      worker = new Worker(url, options);
      this.#worker = worker;
      this.#timer = globalThis.setTimeout(() => {
        this.dispose();
        onTimeout();
      }, STARTUP_TIMEOUT_MS);
    } catch (cause) {
      // Allocation is not complete, so no client can reach dispose yet.
      try {
        worker?.terminate();
      } finally {
        URL.revokeObjectURL(url);
        this.#url = undefined;
      }
      throw cause;
    }
  }

  get worker(): Worker {
    return this.#worker;
  }

  /** Called only for the worker's ready message, after its script is loaded. */
  loaded(): void {
    if (this.#disposed) return;
    this.#loaded = true;
    this.#releaseUrl();
    if (this.#stopAfterLoad) this.dispose();
  }

  /**
   * A host may defer cancellation while a WASM worker starts. No request is admitted by the
   * host in that state; ready or the startup deadline still guarantees resource disposal.
   */
  dispose(afterLoad = false): void {
    if (this.#disposed) return;
    if (afterLoad && !this.#loaded) {
      this.#stopAfterLoad = true;
      return;
    }
    this.#disposed = true;
    try {
      this.#worker.terminate();
    } finally {
      this.#releaseUrl();
    }
  }

  #releaseUrl(): void {
    if (this.#timer !== undefined) globalThis.clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#url === undefined) return;
    URL.revokeObjectURL(this.#url);
    this.#url = undefined;
  }
}
