import { SigningMessage } from "@ckd/core/signing-message.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import { MessageSigningInputsField } from "./message-signing-inputs-field.js";
import type { MessageFormatText, MessageSigningPolicy } from "./message-signing-policy.js";

/** The message box's label for text, the default. */
const MESSAGE_LABEL = "Message";

/**
 * The dialog's format: its menu when an address offers several, its texts, its notes and the
 * fields it signs beside the message.
 */
export class MessageSigningFormatField {
  readonly #document: Document;
  readonly #policy: MessageSigningPolicy;
  readonly #ui;
  readonly #inputs: MessageSigningInputsField;
  #offers: readonly MessageSigningFormat[] = [];

  constructor(document: Document, policy: MessageSigningPolicy, line: HTMLElement) {
    this.#document = document;
    this.#policy = policy;
    this.#ui = {
      field: document.querySelector<HTMLElement>("#message-signer-format-field"),
      select: document.querySelector<HTMLSelectElement>("#message-signer-format-select"),
      notes: document.querySelector<HTMLElement>("#message-signer-notes"),
      output: document.querySelector<HTMLElement>("#message-signature-output-label"),
      messageLabel: document.querySelector<HTMLElement>("#message-signer-message-label"),
      messageHelp: document.querySelector<HTMLElement>("#message-signer-message-help"),
      line,
    };
    this.#inputs = new MessageSigningInputsField(
      document,
      document.querySelector<HTMLElement>("#message-signer-inputs"),
    );
  }

  /** The element whose `input` events, from every field of the format, the dialog listens to. */
  get inputs(): HTMLElement | null {
    return this.#inputs.container;
  }

  /** The selected format's texts, or undefined when the menu holds no offered format. */
  text(): MessageFormatText | undefined {
    return this.#policy.describe(this.selected());
  }

  /** The values of the selected format's fields, by input key. */
  inputValues(): Record<string, string> {
    return this.#inputs.values();
  }

  /** The menu whose `change` the dialog listens to, when the page has one. */
  get select(): HTMLSelectElement | null {
    return this.#ui.select;
  }

  /**
   * Shows an address's offers, its default selected; a menu only when there is a choice. The
   * fields of another address's formats are forgotten.
   */
  show(offers: readonly MessageSigningFormat[]): void {
    this.#offers = offers;
    this.#inputs.clear();
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
    return this.text()?.label ?? "";
  }

  /** Writes the selected format's label, notes, fields, message box and output label. */
  refresh(): void {
    const text = this.text();
    this.#ui.line.textContent = text?.label ?? "";
    this.#inputs.show(text?.inputs ?? []);
    const { notes, output, messageLabel, messageHelp } = this.#ui;
    if (output !== null) output.textContent = text?.output ?? "Signature";
    if (messageLabel !== null) messageLabel.textContent = text?.message?.label ?? MESSAGE_LABEL;
    if (messageHelp !== null) messageHelp.textContent = text?.message?.help ?? SigningMessage.help;
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
