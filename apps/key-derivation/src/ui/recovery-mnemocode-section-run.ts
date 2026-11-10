// The run of a MnemoCode section whose work is one heavy job at a time (a cross-stitch pattern, a
// photo or MP3 hidden or opened): the job gate runs it, a failure of a run that is still current
// is said on the section's status line, and clearing takes back the result shown.
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { RenderedSecrets } from "./secrets.js";

/** Counts a section's input changes: a run that began before a change is no longer current. */
export class SectionRevision {
  #revision = 0;

  /** The inputs changed. */
  next(): void {
    this.#revision += 1;
  }

  /** Whether the inputs are still those of now, for a run that begins now. */
  capture(): () => boolean {
    const revision = this.#revision;
    return () => revision === this.#revision;
  }
}

/** What a section's job is: its gate, status line and revision, and the work itself. */
export interface SectionJob {
  readonly context: RecoveryFeatureContext;
  readonly status: HTMLElement;
  readonly revision: SectionRevision;
  readonly label: string;
  /** Takes back the result shown before the run begins. */
  readonly clear?: () => void;
  readonly work: (current: () => boolean) => Promise<void>;
  /** What the status line says of a failure. */
  readonly say: (cause: unknown) => string;
}

/**
 * Runs a section's job when the panel's gate is free: a failure while the inputs stay is said on
 * the section's status line.
 */
export function startSectionJob(job: SectionJob): void {
  const { context, status } = job;
  if (!context.jobs.ready || context.jobs.runningJob !== null) return;
  job.clear?.();
  const current = job.revision.capture();
  status.classList.remove("warning");
  void context.jobs
    .runHeavy(job.label, () => job.work(current))
    .catch((cause: unknown) => {
      if (!current()) return;
      status.classList.add("warning");
      status.textContent = job.say(cause);
    });
}

/** A failure's own message, or `fallback` for one that is no Error. */
export function failureText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/** Empties the listed fields and calls `clear` on Clear all and page departure. */
export function clearWithPage(
  clear: () => void,
  fields: readonly (HTMLInputElement | HTMLTextAreaElement)[] = [],
): void {
  const reset = (): void => {
    for (const field of fields) field.value = "";
    clear();
  };
  document.querySelector("#clear-all")?.addEventListener("click", reset);
  window.addEventListener("pagehide", reset);
}

/** Empties a section's status line and the secrets it shows, and hides them again. */
export function clearShownResult(
  status: HTMLElement,
  result: HTMLElement,
  toggle: HTMLButtonElement,
): void {
  status.classList.remove("warning");
  status.textContent = "";
  RenderedSecrets.replace(result);
  RecoverySecretLifecycle.concealControl(toggle);
}
