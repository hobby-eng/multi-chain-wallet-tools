// One long MHFE operation of a tab, from its button to its status line: the page's single heavy
// job (the job gate), Cancel over every step (MhfeRun), and what the status line says at the end.
// An operation that waits for the person, such as for an answer to a password review, ends quietly
// with a waiting result; a refused operation is a warning in the package's words (describe).
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { InputRevision } from "./recovery-input-revision.js";
import { describe } from "./recovery-mhfe-status.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The worker lifecycle services that one UI task needs. */
export type MhfeTaskEngine = Pick<MhfeEngine, "cancelCore" | "runCancellable">;

/** An operation paused for a person's answer, with no failure or retained heavy job. */
export interface MhfeWaiting {
  readonly wait: string;
}

/** Completion or a question that must be answered before the next operation starts. */
export type MhfeTaskOutcome = void | MhfeWaiting;

export interface MhfeTaskOptions {
  /** The tab's status line. */
  readonly status: HTMLElement;
  /** The Cancel button shown while the operation runs. */
  readonly cancel: HTMLButtonElement;
  /** The job's name for the job gate, such as "MHFE encryption". */
  readonly name: string;
  /** What the status line says for an error without a message of its own. */
  readonly failure: string;
  /** Stops the package's running work: the core's unless given. */
  readonly stop?: () => void;
  readonly inputs?: HTMLElement;
  readonly onEdit?: () => void;
  readonly source?: string;
}

/** How one run ends besides its status line. */
export interface MhfeTaskRun {
  /**
   * False once the run's result no longer belongs to the fields, as for a check whose fields
   * changed: its error is then not shown either.
   */
  readonly current?: () => boolean;
  /** Called after the status line said an error, such as to mark a new container unfinished. */
  readonly failed?: (cause: unknown) => void;
  /**
   * Holds the job gate after the operation, without its Cancel, until the promise settles: a
   * session that stays open, such as one of hidden wallets.
   */
  readonly holds?: () => Promise<void>;
}

export class MhfeTask {
  readonly #context: Pick<RecoveryFeatureContext, "jobs">;
  readonly #engine: MhfeTaskEngine;
  readonly #options: MhfeTaskOptions;
  readonly #inputs: InputRevision | undefined;
  #active: MhfeRun | undefined;

  constructor(
    context: Pick<RecoveryFeatureContext, "jobs">,
    engine: MhfeTaskEngine,
    options: MhfeTaskOptions,
  ) {
    this.#context = context;
    this.#engine = engine;
    this.#options = options;
    if (options.inputs !== undefined) {
      this.#inputs = new InputRevision(options.inputs, () => {
        if (this.#active !== undefined) {
          this.#active.cancel();
          options.status.textContent =
            "The fields changed while the operation ran. Its result was dropped; start again with the current fields.";
        } else if (this.#context.jobs.runningJob === null) options.status.textContent = "";
        options.onEdit?.();
      });
      document.addEventListener("recovery-source-change", (event) => {
        if (
          options.source !== undefined &&
          (event as CustomEvent<string>).detail === options.source
        )
          this.#inputs?.revise();
      });
      this.#inputs.bindPageLifetime();
    }
  }

  /** A refused second start must not clear or replace the first run's state. */
  get available(): boolean {
    return this.#context.jobs.runningJob === null;
  }

  /** End this panel's work and source comparisons, even if a native cancellation callback fails. */
  retire(): void {
    try {
      this.#active?.cancel();
    } finally {
      this.#inputs?.retire();
    }
  }

  /** Runs `operation` as the page's heavy job; it never rejects. */
  run(
    operation: (run: MhfeRun) => Promise<MhfeTaskOutcome>,
    ends: MhfeTaskRun = {},
  ): Promise<void> {
    if (!this.available) return Promise.resolve();
    const { status, cancel, name, failure } = this.#options;
    const captured = this.#inputs?.capture();
    // A revision predicate has no UI effects: asking about an old run cannot replace newer status.
    const current = (): boolean => captured?.() !== false && ends.current?.() !== false;
    const stop = this.#options.stop ?? (() => this.#engine.cancelCore());
    status.classList.remove("warning");
    return this.#context.jobs
      .runHeavy(name, async () => {
        const outcome = await this.#engine.runCancellable(cancel, stop, async (run) => {
          this.#active = run;
          run.bindCurrent(current);
          try {
            const outcome = await operation(run);
            run.assertCurrent();
            return outcome;
          } finally {
            this.#active = undefined;
          }
        });
        if (outcome !== undefined) {
          status.textContent = outcome.wait;
          return;
        }
        await ends.holds?.();
      })
      .catch((cause: unknown) => {
        if (!current()) return;
        status.classList.add("warning");
        status.textContent = describe(cause, failure);
        ends.failed?.(cause);
      });
  }
}
