// The edits of a tab's fields, for a long job that reads them. A job captures the fields when it
// starts and shows its result or error only while that capture is current, so that nothing it found
// is shown next to inputs that are no longer the ones it used. The host callback owns job
// cancellation and result cleanup; this object revokes captures.

import { FieldEdits } from "./field-edits.js";

interface AncestorTarget {
  closest(selector: string): unknown;
}

const INTERACTION_SELECTORS = ["[data-job-question]", "[data-result-interaction]"] as const;

function interactionTarget(target: EventTarget | null): AncestorTarget | undefined {
  if (target === null || !("closest" in target) || typeof target.closest !== "function")
    return undefined;
  // The callable native method shape is checked; its return remains unknown until the null check.
  return target as EventTarget & AncestorTarget;
}

export class InputRevision {
  #revision = 0;
  readonly #onEdit: () => void;
  /** A text field's later `change` repeats an edit already counted (FieldEdits). */
  readonly #edits = new FieldEdits();

  /**
   * Every `input` or `change` event inside `root` is an edit: text fields send the first, and
   * checkboxes, radio buttons and selects the second; both bubble up to the tab. A text field's
   * later `change` with the text already counted repeats that edit and is ignored. `onEdit` removes
   * what the older inputs produced, such as a verdict. A question that a running job asks, in an
   * element marked `data-job-question`, is part of that job, not an edit.
   */
  constructor(root: EventTarget, onEdit: () => void) {
    this.#onEdit = onEdit;
    this.watch(root);
  }

  /** Add a field outside the original block to the same request and result ownership. */
  watch(root: EventTarget): void {
    const edited = (event: Event): void => {
      // Job answers and recovered-result checks are not source fields; never snapshot their text.
      const target = interactionTarget(event.target);
      if (
        INTERACTION_SELECTORS.some((selector) => {
          const interaction = target?.closest(selector);
          return interaction !== undefined && interaction !== null;
        })
      )
        return;
      if (!this.#edits.isNew(event)) return;
      this.revise();
    };
    root.addEventListener("input", edited);
    root.addEventListener("change", edited);
  }

  /** Clear all and leaving the page invalidate the same captured inputs as a field edit. */
  bindPageLifetime(retireInputs?: () => void): void {
    const retire = (): void => {
      try {
        this.retire();
      } finally {
        retireInputs?.();
      }
    };
    document.querySelector("#clear-all")?.addEventListener("click", retire);
    window.addEventListener("pagehide", retire);
  }

  /** End a source lifetime, wiping comparisons before revoking captures and calling onEdit. */
  retire(): void {
    this.#edits.wipe();
    this.revise();
  }

  /** The fields changed: every capture taken before is outdated. */
  revise(): void {
    this.#revision += 1;
    this.#onEdit();
  }

  /** Starts a job on the fields as they are now; true until they change or a newer job starts. */
  capture(): () => boolean {
    // A newer job makes an older one's capture stale too, even without an edit between them.
    this.#revision += 1;
    const revision = this.#revision;
    return () => revision === this.#revision;
  }
}
