// A new container password where one is set (Encode, New wallet, the new password of Change
// password), as `mhfe` offers it (mhfe src/bin/mhfe/made_password.rs): the person's own, typed
// twice, or one that MhfePasswords.make() makes: five dice words, five words and a check word, or
// sixteen random characters. A password made is shown once, then typed back from the person's
// copy, which shows that the copy is right before anything is encrypted with it; only an exact
// copy is used, with no second field, and the result names how it was made, never the words.
import type { MhfePasswords } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import type { RecoveryJobGate } from "./recovery-job-gate.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { PasswordField } from "./recovery-mhfe-fields.js";
import { describe } from "./recovery-mhfe-status.js";
import { required } from "./recovery-workspace-shared.js";

type MadeKind = "words" | "checkWord" | "characters";

const ERRORS = new ErrorCatalog("wallet.mhfe-password-choice", {
  pending: () => "The password is still being made. Try again.",
  copy: () => "Type the password from what you wrote down.",
  differs: () => NOT_AS_SHOWN,
  kind: () => "Choose a supported password kind.",
});
const NOT_AS_SHOWN = "That is not the password shown: correct your copy from the screen.";

/** A password made, held only until it is used or the choice changes. */
interface Made {
  readonly secret: SecretValue<string>;
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

/** A user operation may show a corrected-copy prompt only while its disclosure remains current. */
export type NewPasswordDisclosure = () => boolean;

/** The package edge needed to make one container password; recipes stay in MHFE. */
export interface NewPasswordEngine {
  passwords(): Promise<Pick<MhfePasswords, "make">>;
}

/** Owns one generated password until use, replacement or readiness loss; text views are temporary. */
export class NewPasswordChoice implements Disposable {
  readonly #engine: NewPasswordEngine;
  readonly #jobs: RecoveryJobGate;
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
  #disclosureRevision = 0;

  /** `prefix` names the fields, as in `#mhfe-{prefix}-password-kind`; `status` is the tab's line. */
  constructor(
    engine: NewPasswordEngine,
    prefix: string,
    own: { readonly password: PasswordField; readonly repeat: PasswordField },
    status: HTMLElement,
    jobs: RecoveryJobGate,
  ) {
    this.#engine = engine;
    this.#jobs = jobs;
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
    document.querySelector("#clear-all")?.addEventListener("click", () => this.wipe());
    window.addEventListener("pagehide", () => this.wipe());
    for (const radio of this.#radios()) radio.addEventListener("change", () => void this.#choose());
    required<HTMLButtonElement>(`#${made}-written`).addEventListener("click", () =>
      this.#askCopy(),
    );
    required<HTMLButtonElement>(`#${made}-again`).addEventListener("click", () => this.#show());
    // Enter alone shows it once more, as at mhfe's prompt.
    this.#copy.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && this.#copy.value === "") this.#show();
    });
    RecoverySecretLifecycle.register(this.#shown, () => {
      this.#disclosureRevision += 1;
      this.#askCopy(false);
    });
    jobs.onChange((change) => {
      if (change === "ready" && !jobs.ready) this.wipe();
    });
    this.#render();
  }

  /** The kind chosen; "own" until another is chosen. */
  get kind(): "own" | MadeKind {
    const checked = this.#radios().find((radio) => radio.checked);
    const kind = checked?.value ?? "own";
    if (kind === "own" || kind === "words" || kind === "checkWord" || kind === "characters")
      return kind;
    throw ERRORS.create("kind", []);
  }

  /**
   * The password and its repetition for the operation: one's own as typed twice, or a password
   * made once its copy was typed back exactly. A wrong copy throws; it is shown again only with
   * a current disclosure permit captured at the operation's start, before its first await.
   */
  passwords(disclosure: NewPasswordDisclosure = () => false): NewPassword {
    this.#jobs.assertReady();
    if (this.kind === "own")
      return { password: this.#own.password.value, repeat: this.#own.repeat.value };
    const made = this.#made;
    if (made === undefined) throw ERRORS.create("pending", []);
    const copy = this.#copy.value;
    if (copy === "") throw ERRORS.create("copy", []);
    if (copy !== made.secret.value) {
      this.#copy.clear();
      if (disclosure()) this.#show();
      throw ERRORS.create("differs", []);
    }
    const password = made.secret.value;
    return { password, repeat: password, made: made.summary };
  }

  /** Capture before the operation's first await; blur, hiding, replacement and gate loss revoke it. */
  captureDisclosure(): NewPasswordDisclosure {
    const revision = this.#revision;
    const disclosure = this.#disclosureRevision;
    const ready = this.#jobs.captureReadiness();
    return () => revision === this.#revision && disclosure === this.#disclosureRevision && ready();
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
    this.#dropMade();
    this.#render();
  }

  #dropMade(): void {
    const made = this.#made;
    this.#made = undefined;
    made?.secret.wipe();
  }

  /** Retires generated bytes and pending permission; JavaScript strings cannot be erased. */
  wipe(): void {
    this.forget();
    this.#own.password.clear();
    this.#own.repeat.clear();
  }
  /** Ends the generated-password lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }

  #radios(): HTMLInputElement[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>(`input[name="${this.#prefix}-password-kind"]`),
    ];
  }

  async #choose(): Promise<void> {
    this.#revision += 1;
    const revision = this.#revision;
    this.#dropMade();
    this.#askCopy(false);
    this.#copy.clear();
    const disclosure = this.#disclosureRevision;
    const ready = this.#jobs.captureReadiness();
    try {
      const kind = this.kind;
      this.#render();
      if (kind === "own" || !ready()) return;
      this.#own.password.clear();
      this.#own.repeat.clear();
      const passwords = await this.#engine.passwords();
      if (revision !== this.#revision || !ready()) return;
      const made = await passwords.make({ kind });
      // Every returned password is owned immediately, even a result whose permission expired.
      const secret = SecretValue.text(made.password);
      let admitted = false;
      try {
        made.password = "";
        if (revision !== this.#revision || !ready() || !this.#block.isConnected) return;
        this.#made = {
          secret,
          summary: `made by MHFE: ${this.#description(kind, secret.value)}, about ${made.bits.toFixed(1)} bits.`,
          checkWord: made.checkWord,
        };
        admitted = true;
        if (disclosure === this.#disclosureRevision && document.visibilityState !== "hidden")
          this.#show();
        else this.#askCopy(false);
      } finally {
        if (!admitted) secret.wipe();
      }
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
    if (made === undefined || !this.#jobs.ready || document.visibilityState === "hidden") return;
    this.#text.textContent = made.secret.value;
    this.#strength.textContent = made.summary.replace(/^made by MHFE: /u, "");
    this.#checkWordNote.hidden = !made.checkWord;
    this.#shown.hidden = false;
    this.#copyField.hidden = true;
  }

  /** Hides the password made and asks for it as written down. */
  #askCopy(focus = true): void {
    this.#text.textContent = "";
    this.#shown.hidden = true;
    this.#copyField.hidden = this.#made === undefined;
    if (focus && this.#made !== undefined) this.#copy.input.focus();
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
