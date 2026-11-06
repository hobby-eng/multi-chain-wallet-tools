const IMPORT_NOTE =
  "Imported passphrases keep their original line breaks. If you edit or clear this field, only the text shown here is used.";

/** An imported secret may contain CR/CRLF that a textarea presents as LF. */
export class LiteralSecretField implements Disposable {
  readonly #field: HTMLInputElement | HTMLTextAreaElement;
  #snapshot: SecretValue<readonly string[]> | undefined;
  #assignmentEvent: Event | undefined;

  /** Owns exact imported code units until edits, Clear, disposal or page exit revoke them. */
  constructor(field: HTMLInputElement | HTMLTextAreaElement) {
    this.#field = field;
    field.classList.add("concealed");
    for (const type of ["input", "change"])
      field.addEventListener(type, (event) => {
        if (event !== this.#assignmentEvent) this.#invalidate();
      });
    // Clearing both avoids using a normalized password after a page is restored from its cache.
    field.ownerDocument.defaultView?.addEventListener("pagehide", () => this.clear());
    field.ownerDocument.querySelector("#clear-all")?.addEventListener("click", () => this.clear());
    const note = field.ownerDocument.createElement("p");
    note.id = `${field.id}-import-note`;
    note.className = "field-note";
    note.textContent = IMPORT_NOTE;
    const describedBy = field.getAttribute("aria-describedby");
    field.setAttribute("aria-describedby", [describedBy, note.id].filter(Boolean).join(" "));
    field.after(note);
  }

  /** Capture the exact imported text and emit one input event without discarding that capture. */
  assign(text: string): void {
    this.#invalidate();
    this.#field.value = text;
    // Imported opaque factors can contain lone surrogates; UTF-8 would change their code units.
    this.#snapshot = SecretValue.utf16Texts([text, this.#field.value]);
    const event = new Event("input", { bubbles: true });
    const previousEvent = this.#assignmentEvent;
    this.#assignmentEvent = event;
    try {
      this.#field.dispatchEvent(event);
    } finally {
      this.#assignmentEvent = previousEvent;
    }
  }

  /** A changed presentation abandons the import, even when a program changed it without an event. */
  read(): string {
    const [canonical, presented] = this.#snapshot?.value ?? [];
    if (canonical !== undefined && this.#field.value === presented) return canonical;
    this.#invalidate();
    return this.#field.value;
  }

  /** Revoke imported bytes and clear the native field, notifying the host of that edit. */
  wipe(): void {
    this.#invalidate();
    this.#field.value = "";
    this.#field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Compatibility entry for native Clear actions. */
  clear(): void {
    this.wipe();
  }

  /** Ends the same lifetime as Clear; browser-managed immutable views cannot be recalled. */
  [Symbol.dispose](): void {
    this.wipe();
  }

  #invalidate(): void {
    const previous = this.#snapshot;
    this.#snapshot = undefined;
    previous?.wipe();
  }
}
import { SecretValue } from "@ckd/core/secret-value.js";
