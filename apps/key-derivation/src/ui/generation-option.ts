// The parts that the generation options of Generate & Derive hold (CORE-12), the MHFE wallet check
// (checked-mnemonic-feature.ts) and the phrase the Telegram wallet accepts (ton-phrase-feature.ts):
// the Generate buttons, which one object owns for every option, and an option's own state.
/** What the controller asks of each generation option. */
export interface GenerationOption {
  /** Whether the option's box is ticked. */
  active(): boolean;
  /** Offers the option once the startup checks pass; disabled, it stops its draw. */
  setEnabled(enabled: boolean): void;
  /** Stops its draw and unticks it, for Clear. */
  clear(): void;
  /** Stops a draw in progress. */
  cancel(): void;
}

/**
 * The Generate buttons: none before the startup checks pass, and, while an option that draws one
 * length only is ticked, only that length.
 */
export class GenerateButtons {
  readonly #buttons: ReadonlyMap<number, HTMLButtonElement>;
  /** The length each ticked option draws, by the option's name. */
  readonly #limits = new Map<string, number>();
  #enabled = false;

  /** `buttons`: each Generate button by the length it draws. */
  constructor(buttons: Iterable<readonly [number, HTMLButtonElement]>) {
    this.#buttons = new Map(buttons);
  }

  /** Whether the startup checks passed. */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#sync();
  }

  /** Limits Generate to `words` while the option named `option` is ticked; undefined lifts it. */
  limit(option: string, words: number | undefined): void {
    if (words === undefined) this.#limits.delete(option);
    else this.#limits.set(option, words);
    this.#sync();
  }

  #sync(): void {
    const limits = [...this.#limits.values()];
    for (const [count, button] of this.#buttons)
      button.disabled = !this.#enabled || limits.some((words) => words !== count);
  }
}

/**
 * An option's state: offered once the startup checks pass; disabling the option or clearing the
 * page stops its draw and unticks it. `show` presents the option after each change.
 */
export class GenerationOptionState {
  readonly #box: HTMLInputElement;
  readonly #stop: () => void;
  readonly #show: () => void;
  #enabled = false;

  constructor(box: HTMLInputElement, stop: () => void, show: () => void) {
    this.#box = box;
    this.#stop = stop;
    this.#show = show;
  }

  /** Whether the startup checks passed, so that the option may draw. */
  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#stop();
    this.#show();
  }

  clear(): void {
    this.#stop();
    this.#box.checked = false;
    this.#show();
  }
}
