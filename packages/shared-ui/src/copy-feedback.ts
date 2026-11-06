const COPY_FEEDBACK_MS = 900;
const COPIED = "Copied";

interface CopyFeedbackClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
}

interface CopyButtonState {
  readonly icon: boolean;
  readonly text: string | null;
  readonly title: string;
  readonly timer: number;
}

/** Owns temporary native copy feedback; repeated successes keep the original label and title. */
export class CopyFeedback {
  readonly #timers: CopyFeedbackClock;
  readonly #active = new WeakMap<HTMLButtonElement, CopyButtonState>();

  /** The host supplies its window's native timers; tests may advance the same clock boundary. */
  constructor(timers: CopyFeedbackClock) {
    this.#timers = timers;
  }

  /** Show success until the final timer settles; availability and disclosure stay with the caller. */
  flash(button: HTMLButtonElement): void {
    const previous = this.#active.get(button);
    if (previous !== undefined) this.#timers.clearTimeout(previous.timer);
    const icon = previous?.icon ?? button.dataset.iconButton === "true";
    const text = previous === undefined ? button.textContent : previous.text;
    const title = previous?.title ?? button.title;
    const state: CopyButtonState = {
      icon,
      text,
      title,
      timer: this.#timers.setTimeout(() => {
        if (this.#active.get(button) !== state) return;
        this.#active.delete(button);
        if (icon) {
          button.classList.remove("copied");
          button.title = title;
        } else button.textContent = text;
      }, COPY_FEEDBACK_MS),
    };
    this.#active.set(button, state);
    if (icon) {
      button.classList.add("copied");
      button.title = COPIED;
    } else button.textContent = COPIED;
  }
}
