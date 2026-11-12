import type { MessageSigningFormat } from "../workers/protocol.js";
import type { MessageSigningPolicy } from "./message-signing-policy.js";

/** The dialog's format: its menu when an address offers several, its texts and its notes. */
export class MessageSigningFormatField {
  readonly #document: Document;
  readonly #policy: MessageSigningPolicy;
  readonly #ui;
  #offers: readonly MessageSigningFormat[] = [];

  constructor(document: Document, policy: MessageSigningPolicy, line: HTMLElement) {
    this.#document = document;
    this.#policy = policy;
    this.#ui = {
      field: document.querySelector<HTMLElement>("#message-signer-format-field"),
      select: document.querySelector<HTMLSelectElement>("#message-signer-format-select"),
      notes: document.querySelector<HTMLElement>("#message-signer-notes"),
      output: document.querySelector<HTMLElement>("#message-signature-output-label"),
      line,
    };
  }

  /** The menu whose `change` the dialog listens to, when the page has one. */
  get select(): HTMLSelectElement | null {
    return this.#ui.select;
  }

  /** Shows an address's offers, its default selected; a menu only when there is a choice. */
  show(offers: readonly MessageSigningFormat[]): void {
    this.#offers = offers;
    const { field, select } = this.#ui;
    const choice = offers.length > 1 && field !== null && select !== null;
    if (select !== null) {
      select.replaceChildren(
        ...(choice
          ? offers.map((format) => {
              const option = this.#document.createElement("option");
              option.value = format;
              option.textContent = this.#policy.describe(format)?.label ?? "";
              return option;
            })
          : []),
      );
      if (choice) select.value = offers[0] ?? "";
    }
    if (field !== null) field.hidden = !choice;
    this.refresh();
  }

  /** The selected format if the address offers it; null for any other menu value. */
  selected(): MessageSigningFormat | null {
    const select = this.#ui.select;
    const value = this.#offers.length > 1 && select !== null ? select.value : this.#offers[0];
    return this.#offers.find((format) => format === value) ?? null;
  }

  /**
   * The label of another offered format whose signature is the compact form, for a compact
   * signature pasted under the selected one; undefined when there is none.
   */
  compactAlternative(): string | undefined {
    const selected = this.selected();
    for (const format of this.#offers) {
      const text = this.#policy.describe(format);
      if (format !== selected && text?.compact === true) return text.label;
    }
    return undefined;
  }

  /** The selected format's label, or empty text when the menu holds no offered format. */
  label(): string {
    return this.#policy.describe(this.selected())?.label ?? "";
  }

  /** Writes the selected format's label, notes and output label. */
  refresh(): void {
    const text = this.#policy.describe(this.selected());
    this.#ui.line.textContent = text?.label ?? "";
    const { notes, output } = this.#ui;
    if (output !== null) output.textContent = text?.output ?? "Signature";
    if (notes === null) return;
    const texts = text?.notes ?? [];
    notes.replaceChildren(
      ...texts.map((note) => {
        const paragraph = this.#document.createElement("p");
        paragraph.className = "field-note";
        paragraph.textContent = note;
        return paragraph;
      }),
    );
    notes.hidden = texts.length === 0;
  }

  /** Forgets the address's offers when the dialog closes. */
  clear(): void {
    this.show([]);
  }
}
