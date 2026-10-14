// One long MnemoCode job of a tab, in a worker of its own: the searches of the Forgotten tab, and
// the share restores and repairs. It wires the tab's Cancel button and status line, starts a long
// search only on a second press of the tab's button with the same inputs ("Search anyway"), and
// drops a result when the inputs changed while the job ran, so that no result is shown for inputs
// that are no longer in the fields.
import type { SearchProgress } from "@ckd/recovery-backup/mnemocode-search.js";
import { JOB_STOPPED, MnemoCodeWorker } from "../workers/mnemocode-worker-client.js";
import { JobClock, formatDuration } from "./recovery-progress.js";

/** What the status line says of an outcome, a result or an error, that was dropped. */
const DROPPED = "The inputs changed while the job ran, so its result was dropped.";

/**
 * The candidate list of a dropped outcome is wiped, as a saved one is: a plain list holds seed
 * phrases. Searches and restores carry it as `list.bytes` (mnemocode-search.ts); other outcomes
 * have none.
 */
function wipeList(outcome: unknown): void {
  const list = (outcome as { readonly list?: { readonly bytes?: unknown } } | undefined)?.list;
  if (list?.bytes instanceof Uint8Array) list.bytes.fill(0);
}

export class MnemoCodeWorkerJob<Request, Outcome> {
  readonly #source: string;
  readonly #button: HTMLButtonElement;
  readonly #cancel: HTMLButtonElement;
  readonly #status: HTMLElement;
  readonly #label: string;
  /** The inputs a long search was confirmed for; any change asks again. */
  #confirmedFor: string | undefined;
  /** Counts the changes of the inputs; a job that sees it move drops its result. */
  #revision = 0;

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
  }

  /** The inputs changed: a running job drops its result, and a confirmation is forgotten. */
  revise(): void {
    this.#revision += 1;
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
    return this.#confirmedFor === inputs;
  }

  /** After a question: the next press of the button starts the search announced. */
  ask(question: string, inputs: string): void {
    this.#confirmedFor = inputs;
    this.#button.textContent = "Search anyway";
    this.#status.textContent = `${question} Press Search anyway to start it.`;
  }

  /**
   * Runs `request`, with `progressLine` on the status line; the outcome and the time it took, or
   * undefined when Cancel stopped the job or the inputs changed meanwhile.
   */
  async run(
    request: Request,
    progressLine: (progress: SearchProgress, elapsed: string) => string,
    startLine: string,
  ): Promise<{ readonly outcome: Outcome; readonly elapsed: string } | undefined> {
    const revision = this.#revision;
    // Progress, a result and an error all belong to the inputs the job started with: after an
    // edit the status line says only that the job's outcome was dropped (AUD-024-API003).
    const current = (): boolean => revision === this.#revision;
    const worker = new MnemoCodeWorker<Request, Outcome>(this.#source);
    const clock = new JobClock();
    this.#cancel.hidden = false;
    this.#cancel.onclick = () => worker.terminate();
    this.#status.textContent = startLine;
    try {
      const outcome = await worker.run(request, (progress) => {
        if (!current()) return;
        this.#status.textContent = progressLine(progress, formatDuration(clock.elapsed()));
      });
      if (!current()) {
        wipeList(outcome);
        this.#status.textContent = DROPPED;
        return undefined;
      }
      return { outcome, elapsed: formatDuration(clock.elapsed()) };
    } catch (cause) {
      if (cause instanceof Error && cause.message === JOB_STOPPED) {
        this.#status.textContent = JOB_STOPPED;
        return undefined;
      }
      if (!current()) {
        this.#status.textContent = DROPPED;
        return undefined;
      }
      throw cause;
    } finally {
      worker.terminate();
      this.#cancel.hidden = true;
      this.#cancel.onclick = null;
    }
  }
}
