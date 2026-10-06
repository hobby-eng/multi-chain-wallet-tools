// Input fields that every MHFE operation tab uses: the PIM with its checkbox, and a password with
// its Show button.
import { required } from "./recovery-workspace-shared.js";

/** The specification's largest PIM. */
const MAX_PIM = 1023;

/** A PIM field shown only while its "Use a custom PIM" checkbox is ticked; unticked means PIM 0. */
export class PimField {
  readonly #checkbox: HTMLInputElement;
  readonly #input: HTMLInputElement;

  /** `prefix` names the tab, as in `#mhfe-{prefix}-pim`. */
  constructor(prefix: string) {
    this.#checkbox = required<HTMLInputElement>(`#mhfe-${prefix}-use-pim`);
    this.#input = required<HTMLInputElement>(`#mhfe-${prefix}-pim`);
    const field = required<HTMLElement>(`#mhfe-${prefix}-pim-field`);
    const synchronize = (): void => {
      field.hidden = !this.#checkbox.checked;
    };
    this.#checkbox.addEventListener("change", synchronize);
    synchronize();
  }

  value(): number {
    if (!this.#checkbox.checked) return 0;
    const value = Number(this.#input.value);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PIM) {
      throw new Error(`PIM must be a whole number from 1 to ${MAX_PIM}.`);
    }
    return value;
  }
}

/** A password input with a Show/Hide button; `label` names it for screen readers. */
export class PasswordField {
  readonly input: HTMLInputElement;
  readonly #toggle: HTMLButtonElement;
  readonly #label: string;

  constructor(inputSelector: string, toggleSelector: string, label: string) {
    this.input = required<HTMLInputElement>(inputSelector);
    this.#toggle = required<HTMLButtonElement>(toggleSelector);
    this.#label = label;
    this.#toggle.addEventListener("click", () => {
      this.input.type = this.input.type === "password" ? "text" : "password";
      this.#render();
    });
    this.#render();
  }

  get value(): string {
    return this.input.value;
  }

  #render(): void {
    const revealed = this.input.type === "text";
    this.#toggle.textContent = revealed ? "Hide" : "Show";
    this.#toggle.setAttribute("aria-pressed", String(revealed));
    this.#toggle.setAttribute("aria-label", `${revealed ? "Hide" : "Show"} ${this.#label}`);
  }
}
