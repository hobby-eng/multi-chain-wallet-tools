import { UiEventScope } from "@ckd/ui/ui-event-scope.js";
import type { Bip38Decryption } from "./bip38-decryptor.js";
import { Bip38Input, Bip38InputError } from "./bip38-input.js";
import { copyPlainText, textElement } from "./ui-common.js";

/** Owns the result controls and listener lifetime, without capturing immutable private keys. */
export class Bip38Results {
  readonly #list: HTMLElement;
  readonly #toggle: HTMLButtonElement;
  readonly #onError: (cause: unknown) => void;
  readonly #fields = new Set<HTMLInputElement>();
  #events: UiEventScope;
  #revealed = false;
  #disposed = false;
  #generation = 0;

  constructor(list: HTMLElement, toggle: HTMLButtonElement, onError: (cause: unknown) => void) {
    this.#list = list;
    this.#toggle = toggle;
    this.#onError = onError;
    this.#events = new UiEventScope(onError);
  }

  #copyButton(label: string, read: () => string): HTMLButtonElement {
    const copy = document.createElement("button");
    copy.textContent = label;
    copy.className = "secondary compact";
    copy.type = "button";
    this.#events.listen(copy, "click", () => {
      const generation = this.#generation;
      if (!copy.disabled)
        void copyPlainText(read()).catch((cause: unknown) => {
          if (!this.#disposed && generation === this.#generation) this.#onError(cause);
        });
    });
    return copy;
  }

  #secret(label: string, value: string, copyLabel: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "bip38-secret-output";
    const input = document.createElement("input");
    input.type = this.#revealed ? "text" : "password";
    input.readOnly = true;
    input.value = value;
    input.dataset.bip38Secret = "true";
    this.#fields.add(input);
    const copy = this.#copyButton(copyLabel, () => input.value);
    copy.disabled = !this.#revealed;
    copy.dataset.copyBip38Secret = "true";
    row.append(textElement("label", "", label), input, copy);
    return row;
  }

  /** Conceals current fields and disables copying; it does not erase retained results. */
  conceal(): void {
    this.#visibility(false);
  }
  toggle(): void {
    this.#assertActive();
    this.#visibility(!this.#revealed);
  }

  #visibility(value: boolean): void {
    this.#revealed = value;
    for (const field of this.#fields) field.type = value ? "text" : "password";
    for (const button of this.#list.querySelectorAll<HTMLButtonElement>("[data-copy-bip38-secret]"))
      button.disabled = !value;
    this.#toggle.textContent = value ? "Hide private keys" : "Show private keys";
    this.#toggle.setAttribute("aria-pressed", String(value));
  }

  /** Clears still-referenced fields and listeners before detaching the result elements. */
  clear(): void {
    this.#generation += 1;
    this.conceal();
    for (const field of this.#fields) field.value = "";
    this.#fields.clear();
    this.#events.dispose();
    if (!this.#disposed) this.#events = new UiEventScope(this.#onError);
    this.#list.replaceChildren();
    this.conceal();
    this.#toggle.disabled = true;
  }

  /** Renders a current recovered key; only the DOM field owns its retained textual presentation. */
  success(position: number, value: Bip38Decryption): void {
    this.#assertActive();
    const card = document.createElement("article");
    card.className = "bip38-result-card";
    const address = value.address;
    const addressRow = document.createElement("div");
    addressRow.className = "policy-row";
    addressRow.append(
      textElement("span", "", "Verified P2PKH address"),
      textElement("code", "", address),
      this.#copyButton("Copy", () => address),
    );
    const compression = document.createElement("div");
    compression.className = "policy-row";
    compression.append(
      textElement("span", "", "Public-key encoding"),
      textElement(
        "code",
        "",
        value.compressed ? "Compressed public key" : "Uncompressed public key",
      ),
    );
    card.append(
      textElement("h3", "", `Recovered key #${position}`),
      addressRow,
      compression,
      this.#secret("Private key · WIF", value.wif, "Copy WIF"),
      this.#secret("Private key · hexadecimal", value.privateKeyHex, "Copy hex"),
    );
    this.#list.append(card);
    this.#toggle.disabled = false;
  }

  /** Unknown operational errors receive a fixed diagnostic without their cause or input text. */
  failure(position: number, cause: unknown): void {
    this.#assertActive();
    const card = document.createElement("article");
    card.className = "bip38-result-card bip38-result-error";
    card.append(
      textElement("h3", "", `Key #${position} could not be decrypted`),
      textElement("p", "", Bip38Input.message(cause)),
    );
    this.#list.append(card);
  }

  /** Page departure releases both result data and its native listeners. */
  dispose(): void {
    this.#disposed = true;
    this.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Bip38InputError("released");
  }
}
