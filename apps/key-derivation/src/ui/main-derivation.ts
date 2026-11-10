import type { CoinAdapter } from "@ckd/coins/registry.js";
import { DerivationStream } from "@ckd/coins/derivation-stream.js";
import type { DerivationStreamCallbacks } from "@ckd/coins/derivation-stream.js";
import { BrowserTurn } from "@ckd/ui/browser-turn.js";
import type { DerivationResults } from "@ckd/ui/derivation-results.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import type { AdapterSettingsStore } from "./adapter-settings.js";
import type { Bip38EncryptionFeature } from "./bip38-encryption-feature.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { DerivationErrorText } from "./derivation-error-text.js";
import type { DerivationResultPanel } from "./derivation-result-panel.js";
import type { DerivationWorkspaceTabs } from "./derivation-workspace-tabs.js";
import { readControls, type DerivationControlValues } from "./inputs.js";
import type { LargeRequestPolicy } from "./large-request-policy.js";
import type { KeyDerivationView } from "./view.js";

const STREAM_RENDER_INTERVAL_MS = 120;
type JobWorker = Pick<DerivationWorkerClient, "ready" | "derive" | "terminate">;

interface MainDerivationOptions {
  view: KeyDerivationView;
  results: DerivationResults;
  panel: DerivationResultPanel;
  tabs: DerivationWorkspaceTabs;
  settings: AdapterSettingsStore;
  policy: LargeRequestPolicy;
  adapter(): CoinAdapter;
  cryptoReady(): boolean;
  cancelAutomatic(): void;
  bip38(): Bip38EncryptionFeature | undefined;
  createWorker(): JobWorker;
  /** The seed of the phrase for the current variant: BIP39's, or for TON's Telegram wallet the TON phrase's. */
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  /** The page's texts of refusals that are neither the stream's nor the protocol's, by code. */
  messages?(): Readonly<Record<string, string>>;
}

/** One owned worker/seed pair; both revocation and normal settlement release its mutable seed. */
class DerivationJob implements Disposable {
  readonly #worker: JobWorker;
  #seed: Uint8Array | undefined;
  constructor(worker: JobWorker) {
    this.#worker = worker;
  }
  get worker(): JobWorker {
    return this.#worker;
  }
  take(seed: Uint8Array): Uint8Array {
    this.#seed = seed;
    return seed;
  }
  wipe(): void {
    this.#seed?.fill(0);
    this.#seed = undefined;
  }
  close(message: string): void {
    this.wipe();
    this.#worker.terminate(new DerivationCancelledError(message));
  }
  [Symbol.dispose](): void {
    this.close("Derivation worker released.");
  }
}

/** Owns main-wallet operation revisions, workers, seed lifetimes and streamed publication. */
export class MainDerivation {
  readonly #options: MainDerivationOptions;
  #revision = 0;
  #inFlight = 0;
  #cancelled = false;
  #job: DerivationJob | undefined;
  #lastRenderAt = 0;

  constructor(options: MainDerivationOptions) {
    this.#options = options;
  }

  /** Public source revision also revokes a phrase-generation result from the previous request. */
  get revision(): number {
    return this.#revision;
  }

  /** Revocation is synchronous; no preceding seed remains live while a newer action starts. */
  advance(): void {
    this.#revision += 1;
    this.stop();
  }

  /** Stop a worker without discarding already admitted result branches. */
  stop(message = "Derivation superseded by a new request."): void {
    const job = this.#job;
    this.#job = undefined;
    try {
      job?.close(message);
    } catch {
      queueMicrotask(() => this.#options.view.showError(DerivationErrorText.CLEANUP_FAILURE));
    }
  }

  /** A person's cancellation is an expected partial outcome, retaining the displayed rows. */
  cancel(): void {
    this.#cancelled = true;
    this.stop("Derivation cancelled by the user.");
    this.#options.view.showCancellationRequested();
    this.#options.view.showStatus("Generation worker stopped. Already displayed results are kept.");
  }

  /** Admit controls before reading the source; publication is revoked by source edits or Cancel. */
  async run(automatic = false): Promise<void> {
    const options = this.#options;
    const view = options.view;
    options.cancelAutomatic();
    if (!options.cryptoReady()) {
      view.showError(SELF_TEST_NOT_PASSED);
      return;
    }
    const adapter = options.adapter();
    let input: DerivationControlValues;
    try {
      input = readControls(adapter, view.controls);
    } catch (cause) {
      view.showError(cause instanceof Error ? cause.message : "Invalid derivation controls.");
      return;
    }
    if (!options.policy.authorize(input, automatic)) return;
    this.advance();
    view.clearMessages();
    options.panel.clear();
    this.#cancelled = false;
    view.showDerivationRunning();
    this.#inFlight += 1;
    const revision = this.#revision;
    const label =
      options.tabs.active === "coinjoin" ? "Dash Mobile CoinJoin · DIP9" : adapter.variantLabel;
    let job: DerivationJob | undefined;
    try {
      job = new DerivationJob(options.createWorker());
      this.#job = job;
      view.showStatus("Initialising cryptography locally…");
      await job.worker.ready();
      if (revision !== this.#revision || adapter !== options.adapter()) return;
      if (this.#cancelled) return;
      options.settings.remember(adapter, input);
      const seed = job.take(options.mnemonicToSeed(view.mnemonic.value, view.passphrase.value));
      const branches = options.policy.plannedBranches(input);
      const stream = new DerivationStream({ worker: job.worker, adapter, input, branches });
      const total = input.count * branches.length;
      const outcome = await stream.run(
        seed,
        this.#callbacks(revision, adapter, input, label, total),
      );
      if (outcome.stale) return;
      this.#complete(outcome.generated, total, automatic, label);
    } catch (cause) {
      this.#failed(cause, revision);
    } finally {
      if (this.#job === job) this.#job = undefined;
      this.#inFlight -= 1;
      try {
        job?.[Symbol.dispose]();
      } catch {
        view.showError(DerivationErrorText.CLEANUP_FAILURE);
      } finally {
        if (this.#inFlight === 0) view.showDerivationIdle(options.cryptoReady());
      }
    }
  }

  #callbacks(
    revision: number,
    adapter: CoinAdapter,
    input: DerivationControlValues,
    label: string,
    total: number,
  ): DerivationStreamCallbacks {
    const { view, results, panel, tabs } = this.#options;
    return {
      isStale: () => revision !== this.#revision || adapter !== this.#options.adapter(),
      isCancelled: () => this.#cancelled,
      onInitialBatch: (branch, result) => {
        const first = results.size === 0;
        results.accept(branch, result);
        view.showResults();
        if (first) panel.activate(branch, false);
        tabs.presentResults();
        panel.updateBranchTabs();
        if (results.active === branch) this.#render(true);
      },
      onAppendedBatch: (branch, rows) => {
        results.appendSelection(branch, rows);
        if (results.active === branch) this.#render(false);
      },
      onProgress: (branch, count, generated) => {
        const branchProgress =
          adapter.addressBranches === undefined
            ? ""
            : ` ${branch} branch ${count.toLocaleString()} of ${input.count.toLocaleString()};`;
        view.showStatus(
          `Derived${branchProgress} ${generated.toLocaleString()} of ${total.toLocaleString()} total results for ${label}.`,
        );
      },
      yieldTurn: () => BrowserTurn.yield(),
    };
  }

  #render(force: boolean): void {
    // Full row/selection projection per batch is quadratic; always force the terminal frame.
    const now = performance.now();
    if (!force && now - this.#lastRenderAt < STREAM_RENDER_INTERVAL_MS) return;
    this.#lastRenderAt = now;
    this.#options.panel.render();
  }

  #complete(generated: number, total: number, automatic: boolean, label: string): void {
    const { results, panel, view } = this.#options;
    if (results.current !== null) this.#render(true);
    panel.updateBulkActions();
    if (this.#cancelled)
      view.showStatus(
        `Generation cancelled after ${generated.toLocaleString()} of ${total.toLocaleString()} results. Displayed partial branches remain available.`,
      );
    else if (automatic)
      view.showStatus(`Automatically derived ${generated.toLocaleString()} results for ${label}.`);
    else view.showStatus(`Derived ${generated.toLocaleString()} results for ${label}.`);
    const bip38 = this.#options.bip38();
    if (!this.#cancelled && bip38?.isReady() === true) bip38.start();
    if (!automatic) view.scrollResultsIntoView();
  }

  #failed(cause: unknown, revision: number): void {
    if (revision !== this.#revision) return;
    const { results, panel, view } = this.#options;
    if (results.size === 0) panel.clear();
    if (cause instanceof DerivationCancelledError && this.#cancelled) {
      view.showStatus(
        `Generation cancelled after ${results.generated.toLocaleString()} results. The worker stopped immediately; displayed results remain available.`,
      );
      return;
    }
    view.showError(
      DerivationErrorText.of(cause, undefined, {
        ...this.#options.messages?.(),
        ...this.#options.adapter().inputMessages,
      }),
    );
  }
}
