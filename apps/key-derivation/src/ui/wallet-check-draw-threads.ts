// How many workers the wallet-check draw uses (wallet-check-draw.ts): the person's choice, from one
// up to the threads the browser reports, kept only until a reload or Clear: the page stores
// nothing. The first two run on the browser's WebCrypto, the others in JavaScript, which adds speed
// only where the computer has power to spare.

/**
 * The threads a draw uses unless the person chooses others: the two WebCrypto workers, the fastest
 * measured on the owner's laptop in Chromium and Firefox (2026-11-12, sustained): more threads, in
 * JavaScript, made the draw slower under the laptop's power limit and only added heat.
 */
export const DEFAULT_DRAW_THREADS = 2;

/** The thread counts offered, 1 up to what the browser reports, and the one chosen at first. */
export function drawThreadChoices(reported: number | undefined): {
  readonly counts: readonly number[];
  readonly preset: number;
} {
  // A browser that reports nothing gets the default's choices.
  const most =
    reported !== undefined && reported >= 1 ? Math.floor(reported) : DEFAULT_DRAW_THREADS;
  return {
    counts: Array.from({ length: most }, (_, index) => index + 1),
    preset: Math.min(DEFAULT_DRAW_THREADS, most),
  };
}

/** The thread choice of the wallet check's options. */
export class DrawThreads {
  readonly #select: HTMLSelectElement;
  readonly #preset: number;

  /** `reported`: the browser's navigator.hardwareConcurrency. */
  constructor(select: HTMLSelectElement, reported: number | undefined) {
    this.#select = select;
    const { counts, preset } = drawThreadChoices(reported);
    this.#preset = preset;
    select.replaceChildren(
      ...counts.map((count) =>
        Object.assign(select.ownerDocument.createElement("option"), {
          value: String(count),
          textContent: String(count),
        }),
      ),
    );
    select.value = String(preset);
  }

  /** The threads chosen. */
  get count(): number {
    return Number(this.#select.value);
  }

  /** Locked while a draw runs, which keeps the threads it started with. */
  setEnabled(enabled: boolean): void {
    this.#select.disabled = !enabled;
  }

  /** Back to the threads offered at first, for Clear. */
  reset(): void {
    this.#select.value = String(this.#preset);
  }

  /** Calls `listener` when the person chooses other threads. */
  onChange(listener: () => void): void {
    this.#select.addEventListener("change", listener);
  }
}
