// "Check the written backup": after Encode or a split, the person types the backup again from the
// paper, and MnemoCode says whether it restores the same seed phrase, without showing it. Most
// losses come from a backup written wrongly. The rules and their lines are MnemoCode's
// (checkBackup, checkShareBackup); one section serves both kinds of backup through its BackupCheck.
import {
  BackupCheckSession,
  type BackupCheck,
  type BackupResult,
} from "@ckd/recovery-backup/mnemocode-backup-check.js";
import {
  attachMnemoCodeWordHints,
  type MnemoCodeHintList,
} from "./recovery-mnemocode-word-hints.js";
import { installSecretToggle, paragraph, required } from "./recovery-workspace-shared.js";

export class BackupCheckSection {
  readonly #section: HTMLElement;
  readonly #backup: HTMLTextAreaElement;
  readonly #datesField: HTMLElement;
  readonly #dates: HTMLInputElement;
  readonly #result: HTMLElement;
  #check: BackupCheckSession | undefined;
  /** Counts edits, offers and presses, so that a late verdict of an older one is not shown. */
  #revision = 0;

  /**
   * `prefix` names the section's fields, as in `#{prefix}-check-backup`; `hints` are those of the
   * backup typed there: an encoded seed phrase's codes, or none for shares.
   */
  constructor(prefix: string, hints: MnemoCodeHintList | undefined) {
    this.#section = required<HTMLElement>(`#${prefix}-check-section`);
    this.#backup = required<HTMLTextAreaElement>(`#${prefix}-check-backup`);
    this.#datesField = required<HTMLElement>(`#${prefix}-check-dates-field`);
    this.#dates = required<HTMLInputElement>(`#${prefix}-check-dates`);
    this.#result = required<HTMLElement>(`#${prefix}-check-result`);
    installSecretToggle(
      `#toggle-${prefix}-check-backup`,
      `#${prefix}-check-backup`,
      "Show",
      "Hide",
      "backup",
    );
    if (hints !== undefined) attachMnemoCodeWordHints(this.#backup, hints);
    for (const field of [this.#backup, this.#dates])
      field.addEventListener("input", () => this.#invalidate());
    required<HTMLButtonElement>(`#${prefix}-check`).addEventListener("click", () => this.#run());
    this.offer(undefined);
    document.querySelector("#clear-all")?.addEventListener("click", () => this.offer(undefined));
    document.defaultView?.addEventListener("pagehide", () => this.offer(undefined));
  }

  /**
   * Offers the check of the result just shown, or none: the section is hidden, and what was typed
   * for an earlier result is cleared, since it would be compared with the wrong phrase.
   */
  offer(check: BackupCheck | undefined): void {
    const incoming = check === undefined ? undefined : new BackupCheckSession(check);
    let transferred = false;
    using _incoming = {
      [Symbol.dispose]: () => {
        if (!transferred) incoming?.wipe();
      },
    };
    let dated = false;
    {
      using _previous = this.#check;
      this.#check = undefined;
      // Revoke the old verdict before any backend getter or retirement can fail.
      this.#section.hidden = true;
      this.#datesField.hidden = true;
      this.#backup.value = "";
      this.#dates.value = "";
      // Setting a value from code fires no input event, so the offer moves the revision itself.
      this.#invalidate();
      dated = incoming?.dated === true;
    }
    this.#section.hidden = incoming === undefined;
    this.#datesField.hidden = !dated;
    this.#check = incoming;
    transferred = true;
  }

  /** What was typed or offered changed: a verdict shown, or still to come, is of older text. */
  #invalidate(): void {
    this.#revision += 1;
    this.#result.replaceChildren();
  }

  #run(): void {
    const check = this.#check;
    if (check === undefined) return;
    this.#invalidate();
    const revision = this.#revision;
    let result: BackupResult;
    try {
      result = check.check({
        backup: this.#backup.value,
        ...(check.dated ? { dates: this.#dates.value } : {}),
      });
    } catch (cause) {
      result = {
        verdict: "unreadable",
        message: cause instanceof Error ? cause.message : String(cause),
        notes: [],
      };
    }
    // Only the verdict of the latest press for the text still in the fields: an edit, another
    // press or another offered check meanwhile makes this one obsolete.
    if (revision !== this.#revision) return;
    this.#result.append(
      paragraph(
        result.verdict === "restores" ? `✓ ${result.message}` : result.message,
        result.verdict === "restores" ? "success-callout" : "warning-callout",
      ),
      ...result.notes.map((note) => paragraph(note, "field-note")),
    );
  }
}
