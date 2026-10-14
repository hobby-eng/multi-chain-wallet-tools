const IMPORT_NOTE =
  "Imported passphrases keep their original line breaks. If you edit or clear this field, only the text shown here is used.";

/** An imported secret may contain CR/CRLF that a textarea presents as LF. */
export class LiteralSecretField {
  readonly #field: HTMLInputElement | HTMLTextAreaElement;
  #canonical: string | undefined;
  #presented: string | undefined;
  #assignmentEvent: Event | undefined;

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
    this.#field.value = text;
    this.#canonical = text;
    this.#presented = this.#field.value;
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
    if (this.#canonical !== undefined && this.#field.value === this.#presented)
      return this.#canonical;
    this.#invalidate();
    return this.#field.value;
  }

  clear(): void {
    this.#invalidate();
    this.#field.value = "";
    this.#field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  #invalidate(): void {
    // Drop references only: JavaScript cannot securely wipe immutable strings.
    this.#canonical = undefined;
    this.#presented = undefined;
  }
}
