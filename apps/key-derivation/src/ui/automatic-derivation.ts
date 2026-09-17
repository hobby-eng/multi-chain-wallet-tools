/** Owns the debounce timer used by automatic derivation. */
export class AutomaticDerivationScheduler {
  #pending: number | null = null;

  constructor(
    private readonly timers: Pick<Window, 'setTimeout' | 'clearTimeout'>,
    private readonly delayMs = 350,
  ) {}

  cancel(): void {
    if (this.#pending === null) return;
    this.timers.clearTimeout(this.#pending);
    this.#pending = null;
  }

  schedule(ready: () => boolean, run: () => void): void {
    this.cancel();
    if (!ready()) return;
    this.#pending = this.timers.setTimeout(() => {
      this.#pending = null;
      if (ready()) run();
    }, this.delayMs);
  }
}
