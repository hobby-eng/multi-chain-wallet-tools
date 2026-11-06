import type { DatesField } from "./recovery-mnemocode-fields.js";
import type { ShareMode } from "@ckd/recovery-backup/mnemocode-shares.js";
import { InputRevision } from "./recovery-input-revision.js";
import { type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { RenderedSecrets, RenderedSecretsError } from "./secrets.js";
import { DerivationErrorText } from "./derivation-error-text.js";
const OPERATION_TEXT = {
  restore: { label: "A MnemoCode share restore", failure: "The restore failed." },
  repair: { label: "A MnemoCode share repair", failure: "The repair failed." },
} as const;
type ShareWorkerRevision = Readonly<{
  revise(): void;
  fail(cause: unknown, fallback: string, current: () => boolean): void;
}>;

/** Native action admission and captured source lifetimes shared by the share operations. */
export class ShareActions {
  readonly #job: ShareWorkerRevision;
  readonly #dates: DatesField;
  readonly #operation: keyof typeof OPERATION_TEXT;
  readonly #mode: () => ShareMode;
  readonly #clear: (releases?: readonly (() => void)[]) => boolean;

  /** Bind one operation's factor and worker owners; reads of its mode occur only on edits. */
  constructor(
    job: ShareWorkerRevision,
    dates: DatesField,
    operation: keyof typeof OPERATION_TEXT,
    mode: () => ShareMode,
    clear: (releases?: readonly (() => void)[]) => boolean,
  ) {
    this.#job = job;
    this.#dates = dates;
    this.#operation = operation;
    this.#mode = mode;
    this.#clear = clear;
  }

  /** Factor and worker revocation precede native cleanup; the clear owner attempts both. */
  changed(): boolean {
    return this.#clear([() => this.#dates.showFor(this.#mode()), () => this.#job.revise()]);
  }

  /** Admit, clear and run the current operation; cleanup cannot bypass captured admission. */
  start(
    context: RecoveryFeatureContext,
    inputs: InputRevision,
    status: HTMLElement,
    run: (current: () => boolean) => Promise<void>,
  ): void {
    if (!ShareActions.available(context)) return;
    const current = ShareActions.capture(inputs, context);
    if (!this.#clear() || !current()) return;
    status.classList.remove("warning");
    if (!current()) return;
    const text = OPERATION_TEXT[this.#operation];
    void context.jobs
      .runHeavy(text.label, async () => {
        if (current()) await run(current);
      })
      .catch((cause: unknown) => this.#job.fail(cause, text.failure, current));
  }

  /** Release captures, attempt native removal and reset any persistent result control on a fault. */
  static clear(
    view: Readonly<{ result: HTMLElement; status: HTMLElement; reset?(): void }>,
    releases: readonly (() => void)[],
  ): boolean {
    let clean = true;
    for (const release of [
      ...releases,
      () => RenderedSecrets.replace(view.result),
      () => view.reset?.(),
    ]) {
      try {
        release();
      } catch {
        clean = false;
      }
    }
    if (!clean) {
      view.status.classList.add("warning");
      view.status.textContent = DerivationErrorText.of(
        new RenderedSecretsError("ui.secret.cleanup"),
      );
    }
    return clean;
  }
  /** Bind source edits, page departure and readiness loss to one captured operation. */
  static inputs(
    root: EventTarget,
    context: RecoveryFeatureContext,
    changed: () => void,
  ): InputRevision {
    const inputs = new InputRevision(root, changed);
    inputs.bindPageLifetime();
    context.jobs.onChange((change) => {
      if (change === "ready" && !context.jobs.ready) inputs.revise();
    });
    return inputs;
  }
  /** Whether the common gate permits a new share operation. */
  static available(context: RecoveryFeatureContext): boolean {
    return context.jobs.ready && context.jobs.runningJob === null;
  }
  /** Capture the current source revision and common readiness together. */
  static capture(inputs: InputRevision, context: RecoveryFeatureContext): () => boolean {
    const current = inputs.capture();
    return () => context.jobs.ready && current();
  }
  /** Lend the native clipboard only while this result remains current. */
  static clipboard(
    context: RecoveryFeatureContext,
    current: () => boolean,
  ): (value: string) => Promise<void> {
    return async (value) => {
      if (current()) await context.writeClipboard(value);
    };
  }
  /** Refuse actions on detached or superseded results before their native handlers run. */
  static guard(result: HTMLElement, current: () => boolean): void {
    for (const action of result.querySelectorAll<HTMLElement>("button, a"))
      action.addEventListener(
        "click",
        (event) => {
          if (current()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        { capture: true },
      );
  }
}
