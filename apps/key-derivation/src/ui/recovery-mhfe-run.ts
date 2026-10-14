// Cancel for one MHFE operation, from its first step to its last: preparing the package, reading
// the container or phrase, the password review and the long work. The package's own cancel reaches
// only the work in its operation slot, so a Cancel pressed while the WebAssembly compiles, or during
// a quick step, would otherwise let the next step start anyway. A run latches Cancel: a step that
// has not started never starts, and a step that is running gives no late result.
import { MhfeCancelledError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";

export class MhfeRun {
  readonly #stopActive: () => void;
  /** Rejects once, on Cancel; every running step races it. */
  readonly #stopped: Promise<never>;
  readonly #stop: (cause: MhfeCancelledError) => void;
  #cancelled = false;
  #finished = false;
  #current: () => boolean = () => true;

  /** `stopActive` stops the package's running work, such as MhfeEngine.cancelCore. */
  constructor(stopActive: () => void) {
    this.#stopActive = stopActive;
    let stop!: (cause: MhfeCancelledError) => void;
    this.#stopped = new Promise<never>((_, reject) => {
      stop = reject;
    });
    this.#stop = stop;
    // A Cancel between two steps finds no step racing it; that rejection is not an unhandled error.
    this.#stopped.catch(() => undefined);
  }

  get cancelled(): boolean {
    return this.#cancelled;
  }

  /** Binds every step and callback to the inputs that started this operation. */
  bindCurrent(current: () => boolean): void {
    this.#current = current;
  }

  /** A late worker callback must not restore output after Cancel or an input edit. */
  publish(work: () => void): void {
    if (!this.#cancelled && !this.#finished && this.#current()) work();
  }

  assertCurrent(): void {
    if (this.#cancelled || this.#finished || !this.#current()) throw new MhfeCancelledError();
  }

  /** Stops the run: the package's running work, the step that runs and every later one. */
  cancel(): void {
    if (this.#cancelled || this.#finished) return;
    this.#cancelled = true;
    try {
      this.#stopActive();
    } finally {
      this.#finished = true;
      this.#stop(new MhfeCancelledError());
    }
  }

  /**
   * Starts `work` unless Cancel came first. Cancel while it runs rejects at once, so that the code
   * after the await never runs with its late result.
   */
  async step<T>(work: () => Promise<T>): Promise<T> {
    this.assertCurrent();
    const result = await Promise.race([work(), this.#stopped]);
    this.assertCurrent();
    return result;
  }

  /** Runs `operation` with `button` shown as its Cancel button, and hides it again at the end. */
  async withButton<T>(
    button: HTMLButtonElement,
    operation: (run: MhfeRun) => Promise<T>,
  ): Promise<T> {
    button.hidden = false;
    button.onclick = () => this.cancel();
    try {
      return await operation(this);
    } finally {
      this.#finished = true;
      button.hidden = true;
      button.onclick = null;
    }
  }
}
