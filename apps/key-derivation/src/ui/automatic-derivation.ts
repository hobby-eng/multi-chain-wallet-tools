/** Delay in milliseconds before deriving after the person's last edit. */
const AUTOMATIC_DERIVATION_DELAY_MS = 350;

/** Owns the debounce timer used by automatic derivation. */
export class AutomaticDerivationScheduler {
  #pending: number | null = null;
  readonly #timers: Pick<Window, "setTimeout" | "clearTimeout">;
  readonly #delayMs: number;

  constructor(
    timers: Pick<Window, "setTimeout" | "clearTimeout">,
    delayMs = AUTOMATIC_DERIVATION_DELAY_MS,
  ) {
    this.#timers = timers;
    this.#delayMs = delayMs;
  }

  /** Revoke the pending automatic start, leaving any already running operation to its owner. */
  cancel(): void {
    if (this.#pending === null) return;
    this.#timers.clearTimeout(this.#pending);
    this.#pending = null;
  }

  /** Replace the previous timer and recheck readiness before starting work. */
  schedule(ready: () => boolean, run: () => void): void {
    this.cancel();
    if (!ready()) return;
    this.#pending = this.#timers.setTimeout(() => {
      this.#pending = null;
      if (ready()) run();
    }, this.#delayMs);
  }
}
