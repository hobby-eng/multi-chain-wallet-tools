// The candidate list for the Discovery Scanner, as MnemoCode's command line offers it: encrypted
// to the Scanner's one-time key or under a passphrase, or, behind Advanced and a confirmation, not
// encrypted at all. The library checks the key and the passphrase when the search starts.
import type { ListProtectionRequest } from "@ckd/recovery-backup/mnemocode-search.js";
import {
  parseListPassphrase,
  parseRecipient,
} from "../../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import { LiteralSecretField } from "@ckd/ui/literal-secret-field.js";
import { installSecretToggle, PHRASE_FILE_IMPORT, required } from "./recovery-workspace-shared.js";

export class CandidateListField {
  readonly #prefix: string;
  readonly #wanted: HTMLInputElement;
  readonly #plain: HTMLInputElement;
  readonly #passphrase: LiteralSecretField;
  readonly #passphraseConfirm: LiteralSecretField;
  readonly #listeners: ((wanted: boolean) => void)[] = [];

  /** `prefix` names the fields, as in `#{prefix}-list`. */
  constructor(prefix: string) {
    this.#prefix = prefix;
    this.#wanted = required<HTMLInputElement>(`#${prefix}-list`);
    this.#plain = required<HTMLInputElement>(`#${prefix}-list-plain`);
    installTextFileImport(document, required<HTMLInputElement>(`#${prefix}-list-key`), {
      accept: PHRASE_FILE_IMPORT.accept,
      normalize: parseRecipient,
    });
    const passphrase = required<HTMLTextAreaElement>(`#${prefix}-list-passphrase`);
    const confirm = required<HTMLTextAreaElement>(`#${prefix}-list-passphrase-confirm`);
    this.#passphrase = new LiteralSecretField(passphrase);
    this.#passphraseConfirm = new LiteralSecretField(confirm);
    for (const [field, value] of [
      [passphrase, this.#passphrase],
      [confirm, this.#passphraseConfirm],
    ] as const)
      installTextFileImport(document, field, {
        accept: PHRASE_FILE_IMPORT.accept,
        normalize: parseListPassphrase,
        value,
      });
    installSecretToggle(
      `#toggle-${prefix}-list-passphrase`,
      `#${prefix}-list-passphrase, #${prefix}-list-passphrase-confirm`,
      "Show",
      "Hide",
      "list passphrase",
    );
    for (const control of [this.#wanted, this.#plain, ...this.#radios()])
      control.addEventListener("change", () => this.#show());
    this.#show();
  }

  get wanted(): boolean {
    return this.#wanted.checked;
  }

  /** Disables the list where its candidates would not be wallets, with the reason. */
  set available(available: boolean) {
    this.#wanted.disabled = !available;
    if (!available) this.#wanted.checked = false;
    required<HTMLElement>(`#${this.#prefix}-list-unavailable`).hidden = available;
    this.#show();
  }

  onChange(listener: (wanted: boolean) => void): void {
    this.#listeners.push(listener);
  }

  /** The protection chosen, or undefined without a list. */
  request(): ListProtectionRequest | undefined {
    if (!this.#wanted.checked) return undefined;
    if (this.#plain.checked) {
      if (!required<HTMLInputElement>(`#${this.#prefix}-list-plain-confirm`).checked)
        throw new Error("Confirm that the list may be saved without encryption, or choose one.");
      return { kind: "none" };
    }
    const choice = this.#radios().find((radio) => radio.checked)?.value;
    if (choice === "key") return { kind: "key", recipient: this.#value("key") };
    if (choice === "passphrase") {
      const passphrase = this.#passphrase.read();
      if (passphrase !== this.#passphraseConfirm.read())
        throw new Error("The two list passphrases differ. Please type them again.");
      return { kind: "passphrase", passphrase };
    }
    throw new Error("Choose how the list should be encrypted.");
  }

  #value(name: string): string {
    return required<HTMLInputElement>(`#${this.#prefix}-list-${name}`).value;
  }

  #radios(): HTMLInputElement[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>(`input[name="${this.#prefix}-list-protect"]`),
    ];
  }

  #show(): void {
    const wanted = this.#wanted.checked;
    const choice = this.#radios().find((radio) => radio.checked)?.value;
    const field = (name: string, shown: boolean): void => {
      required<HTMLElement>(`#${this.#prefix}-list-${name}-field`).hidden = !shown;
    };
    field("protect", wanted && !this.#plain.checked);
    field("key", wanted && !this.#plain.checked && choice === "key");
    field("passphrase", wanted && !this.#plain.checked && choice === "passphrase");
    field("advanced", wanted);
    required<HTMLElement>(`#${this.#prefix}-list-plain-warning`).hidden = !(
      wanted && this.#plain.checked
    );
    for (const listener of this.#listeners) listener(wanted);
  }
}
