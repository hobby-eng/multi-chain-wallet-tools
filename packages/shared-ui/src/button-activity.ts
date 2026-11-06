interface ButtonState {
  readonly text: string | null;
  readonly disabled: boolean;
}

/** Owns temporary native button state; repeated starts preserve the original label and availability. */
export class ButtonActivity {
  readonly #saved = new WeakMap<HTMLButtonElement, ButtonState>();

  /** Mark an operation busy without overwriting a previous start's original state. */
  start(button: HTMLButtonElement, text: string): void {
    if (!this.#saved.has(button))
      this.#saved.set(button, { text: button.textContent, disabled: button.disabled });
    button.disabled = true;
    button.textContent = text;
  }

  /** Restore the original state once; the caller may then apply its current readiness/disclosure policy. */
  finish(button: HTMLButtonElement): void {
    const state = this.#saved.get(button);
    if (state === undefined) return;
    this.#saved.delete(button);
    button.textContent = state.text;
    button.disabled = state.disabled;
  }
}
