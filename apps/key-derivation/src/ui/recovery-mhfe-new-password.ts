// A new container password where one is set (Encode, New wallet, the new password of Change
// password), as `mhfe` offers it (mhfe src/bin/mhfe/made_password.rs): the person's own, typed
// twice, or one that MhfePasswords.make() makes: five dice words, five words and a check word, or
// sixteen random characters. A password made is shown once, then typed back from the person's
// copy, which shows that the copy is right before anything is encrypted with it; only an exact
// copy is used, with no second field, and the result names how it was made, never the words.
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { PasswordField } from "./recovery-mhfe-fields.js";
import { describe } from "./recovery-mhfe-status.js";
import { required } from "./recovery-workspace-shared.js";

type MadeKind = "words" | "checkWord" | "characters";

const NOT_AS_SHOWN = "That is not the password shown: correct your copy from the screen.";

/** A password made, held only until it is used or the choice changes. */
interface Made {
  readonly text: string;
  readonly summary: string;
  readonly checkWord: boolean;
}

/** The password for an operation, its repetition, and how it was made, for the result. */
export interface NewPassword {
  readonly password: string;
  readonly repeat: string;
  /** "made by MHFE: 5 words from the EFF list, about 64.6 bits."; undefined for one's own. */
  readonly made?: string;
}

export class NewPasswordChoice {
  readonly #engine: MhfeEngine;
  readonly #prefix: string;
  readonly #own: { readonly password: PasswordField; readonly repeat: PasswordField };
  readonly #ownFields: HTMLElement;
  readonly #block: HTMLElement;
  readonly #shown: HTMLElement;
  readonly #text: HTMLElement;
  readonly #strength: HTMLElement;
  readonly #checkWordNote: HTMLElement;
  readonly #copyField: HTMLElement;
  readonly #copy: PasswordField;
  readonly #status: HTMLElement;
  #made: Made | undefined;
  /** Counts the passwords asked for, so that a late one for an older choice is dropped. */
  #revision = 0;

  /** `prefix` names the fields, as in `#mhfe-{prefix}-password-kind`; `status` is the tab's line. */
  constructor(
    engine: MhfeEngine,
    prefix: string,
    own: { readonly password: PasswordField; readonly repeat: PasswordField },
    status: HTMLElement,
  ) {
    this.#engine = engine;
    this.#prefix = `mhfe-${prefix}`;
    this.#own = own;
    this.#status = status;
    this.#ownFields = required<HTMLElement>(`#${this.#prefix}-own-password`);
    const made = `${this.#prefix}-made`;
    this.#block = required<HTMLElement>(`#${made}`);
    this.#shown = required<HTMLElement>(`#${made}-shown`);
    this.#text = required<HTMLElement>(`#${made}-text`);
    this.#strength = required<HTMLElement>(`#${made}-strength`);
    this.#checkWordNote = required<HTMLElement>(`#${made}-check-word-note`);
    this.#copyField = required<HTMLElement>(`#${made}-copy-field`);
    this.#copy = new PasswordField(`${made}-copy`, "password as written down");
    document.querySelector("#clear-all")?.addEventListener("click", () => this.forget());
    window.addEventListener("pagehide", () => this.forget());
    for (const radio of this.#radios()) radio.addEventListener("change", () => void this.#choose());
    required<HTMLButtonElement>(`#${made}-written`).addEventListener("click", () =>
      this.#askCopy(),
    );
    required<HTMLButtonElement>(`#${made}-again`).addEventListener("click", () => this.#show());
    // Enter alone shows it once more, as at mhfe's prompt.
    this.#copy.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && this.#copy.value === "") this.#show();
    });
    this.#render();
  }

  /** The kind chosen; "own" until another is chosen. */
  get kind(): "own" | MadeKind {
    const checked = this.#radios().find((radio) => radio.checked);
    return (checked?.value as "own" | MadeKind | undefined) ?? "own";
  }

  /**
   * The password and its repetition for the operation: one's own as typed twice, or a password
   * made once its copy was typed back exactly. Throws, and shows a made password again after a
   * wrong copy, before any work starts.
   */
  passwords(): NewPassword {
    if (this.kind === "own")
      return { password: this.#own.password.value, repeat: this.#own.repeat.value };
    const made = this.#made;
    if (made === undefined) throw new Error("The password is still being made. Try again.");
    const copy = this.#copy.value;
    if (copy === "") throw new Error("Type the password from what you wrote down.");
    if (copy !== made.text) {
      this.#copy.clear();
      this.#show();
      throw new Error(NOT_AS_SHOWN);
    }
    return { password: made.text, repeat: made.text, made: made.summary };
  }

  /** The fields that hold the password, emptied once the work has started. */
  inputs(): HTMLInputElement[] {
    return this.kind === "own"
      ? [this.#own.password.input, this.#own.repeat.input]
      : [this.#copy.input];
  }

  /** Forgets a password made, once it was used: the next one is made anew. */
  forget(): void {
    this.#revision += 1;
    for (const radio of this.#radios()) radio.checked = radio.value === "own";
    this.#made = undefined;
    this.#render();
  }

  #radios(): HTMLInputElement[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>(`input[name="${this.#prefix}-password-kind"]`),
    ];
  }

  async #choose(): Promise<void> {
    this.#revision += 1;
    const revision = this.#revision;
    this.#made = undefined;
    this.#render();
    const kind = this.kind;
    if (kind === "own") return;
    this.#own.password.clear();
    this.#own.repeat.clear();
    try {
      const passwords = await this.#engine.passwords();
      // The module owns its recipe defaults; describe what it actually returned.
      const made = await passwords.make({ kind });
      // Another kind chosen meanwhile makes its own password.
      if (revision !== this.#revision) return;
      this.#made = {
        text: made.password,
        summary: `made by MHFE: ${this.#description(kind, made.password)}, about ${made.bits.toFixed(1)} bits.`,
        checkWord: made.checkWord,
      };
      this.#show();
    } catch (cause) {
      if (revision !== this.#revision) return;
      this.#status.classList.add("warning");
      this.#status.textContent = describe(cause, "MHFE could not make a password.");
    }
  }

  #description(kind: MadeKind, password: string): string {
    if (kind === "characters") return `${password.length} random characters`;
    const words = password.trim().split(/\s+/u).length;
    return kind === "checkWord"
      ? `${words - 1} words from the EFF list and a check word`
      : `${words} words from the EFF list`;
  }

  /** Shows the password made, privately, until the person says it is written down. */
  #show(): void {
    const made = this.#made;
    if (made === undefined) return;
    this.#text.textContent = made.text;
    this.#strength.textContent = made.summary.replace(/^made by MHFE: /u, "");
    this.#checkWordNote.hidden = !made.checkWord;
    this.#shown.hidden = false;
    this.#copyField.hidden = true;
  }

  /** Hides the password made and asks for it as written down. */
  #askCopy(): void {
    this.#text.textContent = "";
    this.#shown.hidden = true;
    this.#copyField.hidden = false;
    this.#copy.input.focus();
  }

  #render(): void {
    const own = this.kind === "own";
    this.#ownFields.hidden = !own;
    this.#block.hidden = own;
    this.#text.textContent = "";
    this.#shown.hidden = true;
    this.#copyField.hidden = true;
    this.#copy.clear();
  }
}
