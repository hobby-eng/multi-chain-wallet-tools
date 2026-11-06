// Which actions of Recover & Back Up may run. Every action waits for the startup self-test. A heavy
// job reserves gigabytes of memory or every processor core (an MHFE Argon2 run takes 2 GiB), so
// only one runs at a time across all panels; quick actions stay usable meanwhile.

/** What changed: the self-test result, or the heavy job that runs. */
export type JobGateChange = "ready" | "job";

/** Readiness and heavy-job ownership; a failed known answer closes this gate permanently. */
export class RecoveryJobGate {
  #ready = false;
  #selfTestFailed = false;
  #readinessRevision = 0;
  #runningJob: string | null = null;
  readonly #listeners = new Set<(change: JobGateChange) => void>();

  /** True once the startup self-test passed and no later known answer failed. */
  get ready(): boolean {
    return this.#ready;
  }

  /** The name of the heavy job that runs, such as "MHFE encryption", or null. */
  get runningJob(): string | null {
    return this.#runningJob;
  }

  /** Updates ordinary readiness without reopening a gate whose known answer failed. */
  setReady(ready: boolean): void {
    this.#ready = ready && !this.#selfTestFailed;
    if (!this.#ready) this.#readinessRevision += 1;
    this.#notify("ready");
  }

  /** Permission for one result: losing readiness revokes it even after an ordinary reopening. */
  captureReadiness(): () => boolean {
    const revision = this.#readinessRevision;
    return () => this.#ready && revision === this.#readinessRevision;
  }

  /** Latches a computed wrong answer; cancellation and unavailable workers do not call this. */
  failSelfTest(): void {
    if (this.#selfTestFailed) return;
    this.#selfTestFailed = true;
    this.setReady(false);
  }

  onChange(listener: (change: JobGateChange) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Every secret operation asks the same gate, including callbacks from older result cards. */
  assertReady(): void {
    if (!this.#ready)
      throw new Error("The cryptographic self-test has not passed. Controls are closed.");
  }

  /** Runs a heavy job; a second one is refused until the first ends, fails or is cancelled. */
  async runHeavy<T>(name: string, job: () => Promise<T>): Promise<T> {
    this.assertReady();
    if (this.#runningJob !== null) {
      throw new Error(`${this.#runningJob} is running. Wait until it ends, or press Cancel there.`);
    }
    this.#runningJob = name;
    this.#notify("job");
    try {
      return await job();
    } finally {
      this.#runningJob = null;
      this.#notify("job");
    }
  }

  #notify(change: JobGateChange): void {
    for (const listener of this.#listeners) listener(change);
  }
}

/**
 * Shows the gate on the page. Buttons marked `data-heavy-job` belong to the gate alone. A change of
 * the running job touches only them, so that a quick action a feature disabled itself, such as the
 * Wallet Matcher's search button during its search, stays as the feature set it.
 */
export function bindJobGate(
  gate: RecoveryJobGate,
  actions: readonly HTMLButtonElement[],
  busyLine: HTMLElement,
): void {
  const heavy = new Set(actions.filter((action) => action.dataset.heavyJob !== undefined));
  const apply = (change: JobGateChange): void => {
    const running = gate.runningJob;
    for (const action of change === "ready" ? actions : heavy) {
      action.disabled = !gate.ready || (running !== null && heavy.has(action));
    }
    busyLine.hidden = running === null;
    busyLine.textContent =
      running === null
        ? ""
        : `${running} is running. Other long operations wait until it ends or you press Cancel there.`;
  };
  gate.onChange(apply);
  apply("ready");
}
