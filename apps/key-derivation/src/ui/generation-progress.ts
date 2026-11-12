// The lines right under the Generate buttons (owner, 2026-11-11: a started job must visibly run):
// the start line within the click, the phrases tried, the time and the average at this speed while
// a draw runs, Stop for a draw that can last, and how the draw ended. A refusal or failure of
// generation is shown here too, not far below at the derivation's messages. generation-plan.ts
// writes the lines; phrase-generation.ts runs the draw.
//
// The announced elements, the line (role="status") and the error (role="alert"), stay rendered
// while they are empty, which the page's style shows as nothing: a screen reader then hears the
// first line as well as the later ones. Text is written only when it changes.

/** The page's elements of the view. */
export interface GenerationProgressElements {
  /** The start, done or stopped line, announced (role="status"); empty when there is none. */
  readonly line: HTMLElement;
  /** The phrases tried and the time, updated a few times a second and not announced. */
  readonly count: HTMLElement;
  readonly stop: HTMLButtonElement;
  /** A refusal or failure (role="alert"); empty when there is none. */
  readonly error: HTMLElement;
}

/** One draw as the view shows it; after the draw ends or another starts, its calls do nothing. */
export interface GenerationRun {
  /** Shows the phrases tried and the time, at most a few times a second. */
  count(text: string): void;
  done(text: string): void;
  stopped(text: string): void;
  fail(text: string): void;
}

/** The least time between two updates of the count: a few a second can be read. */
const COUNT_INTERVAL_MS = 250;

/** Writes `text` into `element` unless it is there already, so that nothing is announced again. */
function write(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export class GenerationProgress {
  readonly #elements: GenerationProgressElements;
  readonly #now: () => number;
  /** The draw shown while it runs, by number; undefined when none runs. */
  #running: number | undefined;
  #runs = 0;
  #stop: (() => void) | undefined;
  /** Whether the line shown is a done line, which describes the phrase field. */
  #done = false;

  /** `now` is the clock of the count's pace (CORE-09). */
  constructor(elements: GenerationProgressElements, now: () => number = () => performance.now()) {
    this.#elements = elements;
    this.#now = now;
    elements.stop.addEventListener("click", () => this.#stop?.());
  }

  /**
   * Shows `line` at once, with Stop when `stop` is given, and returns the draw's view. When Stop
   * hides while it has the focus, `pressed`, the button that started the draw, takes it back after a
   * stop; after a draw that ended by itself the status line takes it, so that a key pressed on Stop
   * just as the draw ends does not start a new draw on the Generate button.
   */
  begin(line: string, stop: (() => void) | undefined, pressed?: HTMLElement): GenerationRun {
    const id = ++this.#runs;
    this.#running = id;
    this.#stop = stop;
    const { count, stop: stopButton } = this.#elements;
    this.#show(line, false);
    write(count, "");
    count.hidden = true;
    stopButton.hidden = stop === undefined;
    this.dismissError();
    let counted = Number.NEGATIVE_INFINITY;
    const end = (show: () => void, stopped = false): void => {
      if (this.#running !== id) return;
      this.#running = undefined;
      this.#stop = undefined;
      const focused = stopButton.ownerDocument?.activeElement === stopButton;
      stopButton.hidden = true;
      if (focused) (stopped ? pressed : this.#elements.line)?.focus();
      count.hidden = true;
      show();
    };
    return {
      count: (text) => {
        const now = this.#now();
        if (this.#running !== id || now - counted < COUNT_INTERVAL_MS) return;
        counted = now;
        write(count, text);
        count.hidden = false;
      },
      done: (text) => end(() => this.#show(text, true)),
      stopped: (text) => end(() => this.#show(text, false), true),
      fail: (text) => end(() => this.#fail(text)),
    };
  }

  /** Shows a refusal that no draw started, such as a self-test that has not passed. */
  refuse(text: string): void {
    this.reset();
    this.#fail(text);
  }

  /** Hides a refusal or failure; the line of a draw stays. */
  dismissError(): void {
    write(this.#elements.error, "");
  }

  /** Hides a done line, once its passphrase changed, and a refusal; a draw and a stop stay. */
  dismissDone(): void {
    this.dismissError();
    if (this.#done) this.reset();
  }

  /** Hides everything and forgets the draw shown, for Clear and a phrase typed over the new one. */
  reset(): void {
    this.#running = undefined;
    this.#runs += 1;
    this.#stop = undefined;
    this.#done = false;
    const { line, count, stop } = this.#elements;
    write(line, "");
    write(count, "");
    count.hidden = true;
    stop.hidden = true;
    this.dismissError();
  }

  #show(text: string, done: boolean): void {
    this.#done = done;
    write(this.#elements.line, text);
  }

  #fail(text: string): void {
    this.#done = false;
    write(this.#elements.line, "");
    write(this.#elements.error, text);
  }
}
