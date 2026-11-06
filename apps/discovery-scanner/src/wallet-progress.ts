import type { RecoveryProgress } from "./types.js";
import type { DiscoveryScannerView, WalletProgressView } from "./view.js";

type ProgressView = Pick<
  DiscoveryScannerView,
  "progressSectionLabel" | "renderWalletProgress" | "setStatus" | "showProgress"
>;
type ProgressRow = Omit<WalletProgressView, "sections"> & {
  readonly sections: Map<RecoveryProgress["section"], string>;
};

/** Owns per-input progress and terminal outcomes; the page receives only its display projection. */
export class WalletProgressTracker {
  readonly #entries = new Map<string, ProgressRow>();
  readonly #view: ProgressView;

  /** Uses only the host's progress presentation callbacks. */
  constructor(view: ProgressView) {
    this.#view = view;
  }

  /** Replaces the previous run with one queued row per admitted input identifier. */
  initialize(inputs: readonly { id: string; label: string }[]): void {
    this.#entries.clear();
    for (const input of inputs) {
      this.#entries.set(input.id, {
        label: input.label,
        state: "queued",
        stage: "Queued",
        message: "Waiting for a scan slot",
        sections: new Map(),
      });
    }
    this.render();
  }

  /** Finishes an input; incomplete work retains its component detail for review. */
  finish(inputId: string, failed = false): void {
    const progress = this.#entries.get(inputId);
    if (progress === undefined) return;
    progress.state = failed ? "failed" : "complete";
    progress.stage = failed ? "Stopped" : "Complete";
    progress.message = failed
      ? "This wallet did not produce a complete report"
      : "All requested scan sections finished";
    if (!failed) progress.sections.clear();
    this.render();
  }

  /** Updates only the named input and displays its current component stage. */
  update(progress: RecoveryProgress): void {
    this.#view.showProgress();
    const wallet = this.#entries.get(progress.inputId);
    if (wallet !== undefined) {
      wallet.state = "running";
      wallet.stage = this.#view.progressSectionLabel(progress.section);
      wallet.message = progress.message;
      wallet.sections.set(progress.section, progress.message);
    }
    this.render();
    this.#view.setStatus(`${wallet?.label ?? progress.inputId}: ${progress.message}`);
  }

  /** Stops nonterminal rows, leaving completed and already stopped reports untouched. */
  failPending(stage: string, message: string): void {
    for (const progress of this.#entries.values()) {
      if (progress.state === "complete" || progress.state === "failed") continue;
      progress.state = "failed";
      progress.stage = stage;
      progress.message = message;
    }
    this.render();
  }

  /** Marks inputs never reached after a person's cancellation as terminal cancelled rows. */
  cancelPending(): void {
    this.failPending("Cancelled", "This input was not checked after cancellation.");
  }

  /** Discards the previous run's progress rows. */
  clear(): void {
    this.#entries.clear();
  }

  /** Supplies the current progress projection to the host. */
  render(): void {
    this.#view.renderWalletProgress(this.#entries);
  }
}
