import { QrActionLifecycle } from "@ckd/ui/qr-action-lifecycle.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";

interface ToggleLabels {
  readonly reveal: string;
  readonly hide: string;
  readonly subject?: string | undefined;
}

/** Owns one Show/Hide control and the Copy/QR presentation of its current secret targets. */
export class RecoverySecretToggle {
  /** A nested result owns its controls independently from its enclosing recovery operation. */
  static readonly SCOPE = "[data-secret-scope], .backup-operation";
  readonly #button: HTMLButtonElement;
  readonly #scope: HTMLElement;
  readonly #targets: string;
  readonly #labels: ToggleLabels;
  #revealed: boolean;

  /** Targets are queried live because one control can outlive several replacement result cards. */
  constructor(button: HTMLButtonElement, targets: string, labels: ToggleLabels) {
    this.#button = button;
    this.#scope =
      button.closest<HTMLElement>(RecoverySecretToggle.SCOPE) ?? button.ownerDocument.body;
    this.#targets = targets;
    this.#labels = labels;
    this.#revealed = button.getAttribute("aria-pressed") === "true";
    button.addEventListener("click", () => {
      this.#revealed = !this.#revealed;
      this.#synchronize();
    });
    for (const target of button.ownerDocument.querySelectorAll<HTMLElement>(targets))
      target.addEventListener("input", () => queueMicrotask(() => this.#synchronize()));
    this.#scope.addEventListener("secret-content-reset", () => this.#conceal());
    RecoverySecretLifecycle.register(button, () => this.#conceal());
    this.#synchronize();
  }

  #synchronize(): void {
    const targets = [...this.#button.ownerDocument.querySelectorAll<HTMLElement>(this.#targets)];
    for (const target of targets) {
      target.classList.toggle("concealed", !this.#revealed);
      if (!this.#revealed) {
        const card = target.closest("article");
        if (card !== null) QrActionLifecycle.hideWithin(card);
      }
    }
    for (const action of this.#scope.querySelectorAll<HTMLButtonElement>(".secret-copy-action"))
      if (this.#copiesTarget(action, targets)) action.disabled = !this.#revealed;
    this.#button.textContent = this.#revealed ? this.#labels.hide : this.#labels.reveal;
    if (this.#labels.subject !== undefined)
      this.#button.setAttribute(
        "aria-label",
        `${this.#revealed ? "Hide" : "Show"} ${this.#labels.subject}`,
      );
    this.#button.setAttribute("aria-pressed", String(this.#revealed));
  }

  #copiesTarget(action: HTMLElement, targets: readonly HTMLElement[]): boolean {
    if (action.closest(RecoverySecretToggle.SCOPE) !== this.#scope) return false;
    const holder = action.closest("article") ?? action.parentElement?.parentElement;
    return holder != null && targets.some((target) => holder.contains(target));
  }

  #conceal(): void {
    this.#revealed = false;
    this.#synchronize();
  }
}
