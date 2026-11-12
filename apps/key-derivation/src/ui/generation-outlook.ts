// What a phrase drawn with the generation options keeps of its random bits, how long it takes on
// this computer, and what a person who keeps a BIP39 passphrase with it must know: the lines under
// the generation options while an option that checks the phrase is ticked (phrase-generation.ts).

/** The page's elements of the outlook. */
export interface GenerationOutlookElements {
  readonly box: HTMLElement;
  readonly bits: HTMLElement;
  readonly time: HTMLElement;
  readonly note: HTMLElement;
}

/** The outlook's lines; a null line is hidden. */
export interface GenerationOutlookLines {
  /** The bits kept; `alert` marks a phrase that is not recommended. */
  readonly bits: { readonly text: string; readonly alert: boolean };
  readonly time: string | null;
  readonly note: string | null;
}

export class GenerationOutlook {
  readonly #elements: GenerationOutlookElements;

  constructor(elements: GenerationOutlookElements) {
    this.#elements = elements;
  }

  /**
   * Shows `lines`, or hides the outlook for null. Text is written only when it changes: the outlook
   * is announced, and a passphrase typed while an option is ticked refreshes it on every key.
   */
  show(lines: GenerationOutlookLines | null): void {
    const { box, bits, time, note } = this.#elements;
    box.hidden = lines === null;
    bits.classList.toggle("warning", lines?.bits.alert === true);
    for (const [element, text] of [
      [bits, lines?.bits.text ?? null],
      [time, lines?.time ?? null],
      [note, lines?.note ?? null],
    ] as const) {
      if (element.textContent !== (text ?? "")) element.textContent = text ?? "";
      element.hidden = text === null;
    }
  }
}
