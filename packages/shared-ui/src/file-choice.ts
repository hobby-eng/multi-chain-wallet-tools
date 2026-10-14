// A file chooser in the look of every other button. The browser draws its own "Choose File"
// control, which no stylesheet makes look alike in every browser, so a label in the button style
// holds the file input. The input is not drawn but stays focusable, so that the keyboard reaches it
// (main.css, .file-choice). Every file chooser of every tool is one of these.

/** What the line under a chooser says before a file is chosen, as the browser's own control does. */
const NO_FILE_CHOSEN = "No file chosen";

export class FileChoice {
  readonly #input: HTMLInputElement;
  readonly #button: HTMLLabelElement;
  /** The line that names the file chosen; only for a chooser whose file another button uses. */
  readonly #name: HTMLElement | undefined;

  /**
   * Puts `input`, a file input, inside a button reading `text`, in the input's place where it is on
   * the page already. With `showName`, a line after the button names the file chosen, for a file
   * that is used later, by another button; a file read at once needs none. `document` makes the
   * button; it is the input's own unless a caller that made the input names it.
   */
  constructor(
    input: HTMLInputElement,
    text: string,
    options: Readonly<{ showName?: boolean }> = {},
    document: Document = input.ownerDocument,
  ) {
    this.#input = input;
    this.#button = document.createElement("label");
    this.#button.className = "secondary compact file-choice";
    // An input made by create() is not on the page yet: its caller places the elements.
    if (input.parentNode) input.replaceWith(this.#button);
    this.#button.append(text, input);
    if (options.showName === true) {
      this.#name = document.createElement("span");
      this.#name.className = "file-choice-name";
      this.#button.after(this.#name);
      input.addEventListener("change", () => this.#showName());
      this.#showName();
    }
  }

  /** A chooser of files of the kinds `accept` names, made off the page; place its elements. */
  static create(
    document: Document,
    text: string,
    options: Readonly<{ accept: string; multiple?: boolean }>,
  ): FileChoice {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    input.multiple = options.multiple === true;
    return new FileChoice(input, text, {}, document);
  }

  /** The button and the line that names the file, for a caller that places a chooser it made. */
  get elements(): HTMLElement[] {
    return this.#name === undefined ? [this.#button] : [this.#button, this.#name];
  }

  get files(): File[] {
    return [...(this.#input.files ?? [])];
  }

  get file(): File | undefined {
    return this.#input.files?.[0];
  }

  get disabled(): boolean {
    return this.#input.disabled;
  }

  set disabled(value: boolean) {
    this.#input.disabled = value;
  }

  /** Calls `listener` when a file is chosen, or the choice is cancelled. */
  onChoose(listener: () => void): void {
    this.#input.addEventListener("change", listener);
  }

  /** Forgets the file chosen, so that choosing the same file again counts as a new choice. */
  clear(): void {
    this.#input.value = "";
    this.#showName();
  }

  #showName(): void {
    if (this.#name !== undefined) this.#name.textContent = this.file?.name ?? NO_FILE_CHOSEN;
  }
}
