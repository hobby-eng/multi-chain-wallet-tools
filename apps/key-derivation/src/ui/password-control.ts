import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";

/** Concealed native input and its local disclosure button, including automatic concealment. */
export class PasswordControl {
  readonly input: HTMLInputElement;
  readonly #toggle: HTMLButtonElement;
  readonly #label: string;

  constructor(input: HTMLInputElement, toggle: HTMLButtonElement, label: string) {
    this.input = input;
    this.#toggle = toggle;
    this.#label = label;
    toggle.addEventListener("click", () => this.setVisible(input.type === "password"));
    RecoverySecretLifecycle.register(toggle, () => this.setVisible(false));
    this.setVisible(false);
  }
  /** A transient native string view; the control retains no extra string copy. */
  get value(): string {
    return this.input.value;
  }
  /** Explicit host disclosure and automatic concealment use exactly the same presentation. */
  setVisible(revealed: boolean): void {
    this.input.type = revealed ? "text" : "password";
    this.#toggle.textContent = revealed ? "Hide" : "Show";
    this.#toggle.setAttribute("aria-pressed", String(revealed));
    this.#toggle.setAttribute("aria-label", `${revealed ? "Hide" : "Show"} ${this.#label}`);
  }
  /** Drops the native field's reference; JavaScript cannot erase prior string views. */
  clear(): void {
    this.input.value = "";
  }
}
