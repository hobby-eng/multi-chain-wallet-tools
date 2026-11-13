import { bytesToHex } from "@ckd/core/crypto.js";
import { secureRandomBytes } from "@ckd/core/secure-random.js";
import type { MessageInputText } from "./message-signing-policy.js";

/** A NEAR nonce's bytes, which the dialog draws for each address it opens. */
const NONCE_BYTES = 32;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * The dialog's fields for a format's inputs beside the message (MessageFormatText.inputs), drawn
 * from the coin's own texts into one container. The values stay while the person switches between
 * the formats of one address, and are forgotten when the dialog opens on another or closes.
 */
export class MessageSigningInputsField {
  readonly #document: Document;
  readonly #container: HTMLElement | null;
  readonly #values = new Map<string, string>();
  /** The shown fields' controls, by input key. */
  #controls = new Map<string, HTMLInputElement>();

  constructor(document: Document, container: HTMLElement | null) {
    this.#document = document;
    this.#container = container;
  }

  /** The element whose `input` events (from every field) the dialog listens to. */
  get container(): HTMLElement | null {
    return this.#container;
  }

  /** Shows a format's fields: values kept from the same address, else their initial values. */
  show(inputs: readonly MessageInputText[]): void {
    this.#remember();
    this.#controls = new Map();
    const container = this.#container;
    if (container === null) return;
    container.replaceChildren(...inputs.map((input) => this.#field(input)));
    container.hidden = inputs.length === 0;
  }

  /** The shown fields' values, by input key, exactly as entered. */
  values(): Record<string, string> {
    return Object.fromEntries([...this.#controls].map(([key, control]) => [key, control.value]));
  }

  /** Forgets every value, when the dialog opens on another address or closes. */
  clear(): void {
    this.#values.clear();
    this.#controls = new Map();
    if (this.#container === null) return;
    this.#container.replaceChildren();
    this.#container.hidden = true;
  }

  /** Keeps the shown values for the next format of the same address. */
  #remember(): void {
    for (const [key, control] of this.#controls) this.#values.set(key, control.value);
  }

  #field(input: MessageInputText): HTMLElement {
    const field = this.#document.createElement("div");
    const label = this.#document.createElement("label");
    const control = this.#document.createElement("input");
    const help = this.#document.createElement("p");
    control.id = this.#id(input);
    control.type = "text";
    control.autocomplete = "off";
    control.spellcheck = false;
    control.required = input.optional !== true;
    control.value = this.#values.get(input.key) ?? this.#initial(input);
    label.htmlFor = control.id;
    label.textContent = input.label;
    help.id = `${control.id}-help`;
    help.className = "help";
    help.textContent = input.help;
    control.setAttribute("aria-describedby", help.id);
    field.append(label, control, help);
    this.#controls.set(input.key, control);
    return field;
  }

  #id(input: MessageInputText): string {
    return `message-signer-input-${input.key}`;
  }

  /** A fresh nonce or the current time; nothing for any other input. */
  #initial(input: MessageInputText): string {
    if (input.initial === "nonce") return bytesToHex(secureRandomBytes(NONCE_BYTES));
    if (input.initial === "now") return String(Math.floor(Date.now() / MILLISECONDS_PER_SECOND));
    return "";
  }
}
