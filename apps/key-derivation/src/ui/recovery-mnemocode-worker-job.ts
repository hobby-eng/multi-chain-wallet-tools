// One long MnemoCode job of a tab, in a worker of its own: the searches of the Forgotten tab, and
// the share restores and repairs. It wires the tab's Cancel button and status line, starts a long
// search only on a second press of the tab's button with the same inputs ("Search anyway"), and
// drops a result when the inputs changed while the job ran, so that no result is shown for inputs
// that are no longer in the fields.
import type { SearchProgress } from "@ckd/recovery-backup/mnemocode-search.js";
import { JOB_STOPPED, MnemoCodeWorker } from "../workers/mnemocode-worker-client.js";
import {
  MnemoCodeWorkerProtocol,
  type WorkerStopped,
} from "../workers/mnemocode-worker-protocol.js";
import { JobClock, formatDuration } from "./recovery-progress.js";
import { SecretValue } from "@ckd/core/secret-value.js";

/** What the status line says of an outcome, a result or an error, that was dropped. */
const DROPPED = "The inputs changed while the job ran, so its result was dropped.";

/** Owns confirmation bytes, the current native job and its Cancel/status presentation together. */
export class MnemoCodeWorkerJob<Request, Outcome, Progress = SearchProgress> implements Disposable {
  readonly #source: string;
  readonly #button: HTMLButtonElement;
  readonly #cancel: HTMLButtonElement;
  readonly #status: HTMLElement;
  readonly #label: string;
  /** The inputs a long search was confirmed for; any change asks again. */
  #confirmedFor: SecretValue<string> | undefined;
  /** Counts the changes of the inputs; a job that sees it move drops its result. */
  #revision = 0;
  #runRevision = 0;
  #cancelledRun: number | undefined;
  #active: MnemoCodeWorker<Request, Outcome, Progress> | undefined;

  /** `source` is the text of the worker script that the build embeds. */
  constructor(
    source: string,
    elements: {
      readonly button: HTMLButtonElement;
      readonly cancel: HTMLButtonElement;
      readonly status: HTMLElement;
    },
  ) {
    this.#source = source;
    this.#button = elements.button;
    this.#cancel = elements.cancel;
    this.#status = elements.status;
    this.#label = elements.button.textContent?.trim() ?? "";
    this.#cancel.addEventListener("click", () => {
      this.#forgetConfirmation();
      this.#cancelledRun = this.#runRevision;
      const worker = this.#active;
      this.#active = undefined;
      try {
        worker?.terminate();
      } finally {
        this.#cancel.hidden = true;
        this.#status.textContent = JOB_STOPPED;
      }
    });
    this.#button.ownerDocument
      .querySelector("#clear-all")
      ?.addEventListener("click", () => this.wipe());
    this.#button.ownerDocument.defaultView?.addEventListener("pagehide", () => this.wipe());
  }

  /** The inputs changed: a running job drops its result, and a confirmation is forgotten. */
  revise(): void {
    this.#revision += 1;
    this.#cancelledRun = undefined;
    this.#forgetConfirmation();
    const worker = this.#active;
    this.#active = undefined;
    try {
      worker?.terminate();
    } finally {
      this.#cancel.hidden = true;
    }
  }

  #forgetConfirmation(): void {
    this.#confirmedFor?.wipe();
    this.#confirmedFor = undefined;
    this.#button.textContent = this.#label;
  }

  /** A failed job may finish after its inputs changed; only its owner reports it. */
  fail(cause: unknown, fallback: string, current: () => boolean): void {
    if (!current()) return;
    this.#status.classList.add("warning");
    this.#status.textContent = cause instanceof Error ? cause.message : fallback;
  }

  /** Whether the person agreed to the long search of exactly these inputs. */
  confirmed(inputs: string): boolean {
    return this.#confirmedFor?.value === inputs;
  }

  /** After a question: the next press of the button starts the search announced. */
  ask(question: string, inputs: string): void {
    this.#forgetConfirmation();
    this.#confirmedFor = SecretValue.text(inputs);
    this.#button.textContent = "Search anyway";
    this.#status.textContent = `${question} Press Search anyway to start it.`;
  }

  /**
   * Runs `request`, with `progressLine` on the status line; the outcome and the time it took, or
   * undefined when Cancel stopped the job or the inputs changed meanwhile. `transfer` moves the
   * request's own buffers to the worker.
   */
  async run(
    request: Request,
    progressLine: (progress: Progress, elapsed: string) => string,
    startLine: string,
    transfer: readonly Transferable[] = [],
  ): Promise<
    { readonly outcome: Exclude<Outcome, WorkerStopped>; readonly elapsed: string } | undefined
  > {
    const runRevision = ++this.#runRevision;
    this.#cancelledRun = undefined;
    const previous = this.#active;
    this.#active = undefined;
    previous?.terminate();
    const revision = this.#revision;
    // Progress, a result and an error all belong to the inputs the job started with: after an
    // edit the status line says only that the job's outcome was dropped (AUD-024-API003).
    const current = (): boolean =>
      revision === this.#revision &&
      runRevision === this.#runRevision &&
      this.#cancelledRun !== runRevision;
    const dropped = (): void => {
      if (runRevision === this.#runRevision)
        this.#status.textContent = this.#cancelledRun === runRevision ? JOB_STOPPED : DROPPED;
    };
    let worker: MnemoCodeWorker<Request, Outcome, Progress> | undefined;
    try {
      worker = new MnemoCodeWorker<Request, Outcome, Progress>(this.#source);
      this.#active = worker;
      const clock = new JobClock();
      this.#cancel.hidden = false;
      this.#status.textContent = startLine;
      const outcome = await worker.run(
        request,
        (progress) => {
          if (!current()) return;
          this.#status.textContent = progressLine(progress, formatDuration(clock.elapsed()));
        },
        transfer,
      );
      if (!current()) {
        MnemoCodeWorkerProtocol.discard(outcome);
        dropped();
        return undefined;
      }
      const completed = MnemoCodeWorkerProtocol.completed<Outcome>(outcome);
      if (completed === undefined) {
        this.#status.textContent = JOB_STOPPED;
        return undefined;
      }
      return { outcome: completed, elapsed: formatDuration(clock.elapsed()) };
    } catch (cause) {
      if (!current()) {
        dropped();
        return undefined;
      }
      throw cause;
    } finally {
      try {
        worker?.terminate();
      } finally {
        if (runRevision === this.#runRevision && this.#active === worker) {
          this.#active = undefined;
          this.#cancel.hidden = true;
        }
      }
    }
  }
  /** Ends confirmation and pending native work; a late result cannot be published. */
  wipe(): void {
    this.revise();
  }
  /** Ends this tab operation's lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
