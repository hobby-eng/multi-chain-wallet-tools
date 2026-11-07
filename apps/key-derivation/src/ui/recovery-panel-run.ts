// The run of a Recover & Back Up panel whose work goes to a derivation worker of its own, as the
// Wallet Matcher's search and the Multisig wallet's build do: one run at a time, its button enabled
// while the workspace is ready, and a run current only while its inputs, the job gate and the panel
// stay as they were when it began.
import { DerivationWorkerClient } from "../workers/derive-client.js";
import type { InputRevision } from "./recovery-input-revision.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** One run: whether it is still current, and its worker, made when the run first needs it. */
export class PanelRun {
  readonly current: () => boolean;
  readonly #made: (worker: DerivationWorkerClient) => void;
  #worker: DerivationWorkerClient | undefined;

  constructor(current: () => boolean, made: (worker: DerivationWorkerClient) => void) {
    this.current = current;
    this.#made = made;
  }

  /** The run's derivation worker; a run that fails before it needs one never starts one. */
  worker(): DerivationWorkerClient {
    if (this.#worker === undefined) {
      this.#worker = new DerivationWorkerClient();
      this.#made(this.#worker);
    }
    return this.#worker;
  }

  /** The worker this run made, if any. */
  get made(): DerivationWorkerClient | undefined {
    return this.#worker;
  }
}

export class RecoveryPanelRun {
  readonly #context: RecoveryFeatureContext;
  readonly #inputs: InputRevision;
  readonly #button: HTMLButtonElement;
  readonly #root: HTMLElement;
  #worker: DerivationWorkerClient | undefined;
  #running = false;

  constructor(
    context: RecoveryFeatureContext,
    inputs: InputRevision,
    button: HTMLButtonElement,
    root: HTMLElement,
  ) {
    this.#context = context;
    this.#inputs = inputs;
    this.#button = button;
    this.#root = root;
    context.jobs.onChange((change) => {
      if (change !== "ready") return;
      if (!context.jobs.ready) inputs.revise();
      button.disabled = !context.jobs.ready || this.#running;
    });
    button.disabled = !context.jobs.ready;
  }

  /** Begins a run; undefined while another run is going or the workspace is not ready. */
  begin(): PanelRun | undefined {
    if (!this.#context.jobs.ready || this.#running) return undefined;
    this.#inputs.revise();
    const inputCurrent = this.#inputs.capture();
    const ready = this.#context.jobs.captureReadiness();
    this.#running = true;
    this.#button.disabled = true;
    return new PanelRun(
      () => inputCurrent() && ready() && this.#root.isConnected,
      (worker) => (this.#worker = worker),
    );
  }

  /** Ends a run: its worker stops, and a current run gives the button back. */
  end(run: PanelRun): void {
    const worker = run.made;
    worker?.terminate();
    if (worker !== undefined && this.#worker === worker) this.#worker = undefined;
    if (!run.current()) return;
    this.#running = false;
    this.#button.disabled = !this.#context.jobs.ready;
  }

  /** Stops the run that is going, if any, with `cause`, and gives the button back. */
  revoke(cause: Error): void {
    this.#worker?.terminate(cause);
    this.#worker = undefined;
    this.#running = false;
    this.#button.disabled = !this.#context.jobs.ready;
  }
}
