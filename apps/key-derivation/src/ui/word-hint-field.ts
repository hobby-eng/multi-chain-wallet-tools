// Hints below a field of words as it is typed, by mhfe's rule, which MnemoCode keeps too (its
// core/word-hints.ts): after one letter of the last word how many words begin with it, from two
// letters those words, and a warning where none does; Tab completes the word as far as the words
// that fit agree. Every word field of the page shows its hints through this one class, whatever
// gives them: MHFE's engine in the MHFE panel (recovery-mhfe-word-hints.ts), MnemoCode's word lists
// in its panel (recovery-mnemocode-word-hints.ts). A concealed field gets no hint: the command-line
// tools show one only where the typed text is shown. Ctrl+W, which deletes a word there, closes the
// tab in a browser and stays the browser's.

/** What Tab adds at the end of the text, as MnemoCode's WordCompletion and mhfe's completion say. */
export interface TypedCompletion {
  /** The letters every word that fits has next; empty where they differ. */
  readonly letters: string;
  /** Whether one word is left, so that the word ends and a space follows. */
  readonly wordEnds: boolean;
}

/** What a field shows for the text typed so far. */
export interface TypedWordHint {
  /** The line below the field, a warning where no word fits; null shows none. */
  readonly shown: { readonly text: string; readonly warning: boolean } | null;
  /** What Tab adds; left out where Tab moves on to the next control, as in a password. */
  readonly completion?: TypedCompletion;
}

/**
 * Where a field's hints come from: the hint for the end of the text typed so far, the word being
 * typed and the few before it (hintContext).
 */
export type WordHintSource = (typed: string) => TypedWordHint | Promise<TypedWordHint>;

/** Milliseconds without typing before a hint is asked for: MHFE's engine starts a worker for each. */
const TYPING_PAUSE_MS = 150;
/**
 * The most words a hint shows, about the three rows mhfe shows on an 80-column terminal
 * (HINT_ROWS); the rest are counted.
 */
const SHOWN_WORDS = 24;

/**
 * The words a hint is given: the word being typed and three before it, enough to tell the form of
 * the line, such as Bytewords after the codes of another share. MnemoCode's command line gives no
 * more (HINT_CONTEXT_WORDS, its AUD-019-SEC001), so that a phrase, which may be secret, does not
 * go whole to a hint, nor to the worker that answers MHFE's.
 */
const HINT_CONTEXT_WORDS = 4;

/** The end of `text` that a hint is given: its last HINT_CONTEXT_WORDS words, as typed. */
export function hintContext(text: string): string {
  const spaceBefore = (index: number): boolean => /\s/u.test(text[index - 1] ?? "");
  let start = text.length;
  // The word being typed, empty after white space, then the words before it.
  while (start > 0 && !spaceBefore(start)) start -= 1;
  for (let words = 1; words < HINT_CONTEXT_WORDS && start > 0; words += 1) {
    while (start > 0 && spaceBefore(start)) start -= 1;
    while (start > 0 && !spaceBefore(start)) start -= 1;
  }
  return text.slice(start);
}

/** The words that begin with the letters typed, as a hint lists them: the first SHOWN_WORDS. */
export function wordsText(words: readonly string[]): string {
  const shown = words.slice(0, SHOWN_WORDS).join(" ");
  const more = words.length - SHOWN_WORDS;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

type WordField = HTMLInputElement | HTMLTextAreaElement;

export class WordHintField {
  /** The fields that have hints, so that none gets two. */
  static readonly #attached = new WeakSet<WordField>();
  /** The documents whose pointer presses are followed (#watchPresses). */
  static readonly #watched = new WeakSet<Document>();
  /** Whether a pointer is pressed down: a field it takes the focus from waits for its click. */
  static #pressed = false;
  readonly #field: WordField;
  readonly #source: WordHintSource;
  readonly #hint: HTMLParagraphElement;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Counts the changes of the field, so that only the newest answer is shown. */
  #revision = 0;
  /** The newest answer and the field's text it is for: Tab completes only that text. */
  #latest: { readonly value: string; readonly hint: TypedWordHint } | undefined;

  /** Shows the hints of `source` below `field`, once however often it is asked. */
  static attach(field: WordField, source: WordHintSource): void {
    if (WordHintField.#attached.has(field)) return;
    WordHintField.#attached.add(field);
    new WordHintField(field, source);
  }

  private constructor(field: WordField, source: WordHintSource) {
    const document = field.ownerDocument;
    WordHintField.#watchPresses(document);
    this.#field = field;
    this.#source = source;
    this.#hint = document.createElement("p");
    this.#hint.className = "field-note word-hint";
    this.#hint.setAttribute("aria-live", "polite");
    this.#hint.hidden = true;
    field.insertAdjacentElement("afterend", this.#hint);
    for (const event of ["input", "focus"]) field.addEventListener(event, () => this.#changed());
    field.addEventListener("blur", () => this.#left());
    field.addEventListener("keydown", (event) => this.#complete(event as KeyboardEvent));
    // Show and Hide change the field's type or class: the hint follows them.
    new MutationObserver(() => this.#changed()).observe(field, {
      attributes: true,
      attributeFilter: ["type", "class"],
    });
  }

  static #watchPresses(document: Document): void {
    if (WordHintField.#watched.has(document)) return;
    WordHintField.#watched.add(document);
    document.addEventListener("pointerdown", () => (WordHintField.#pressed = true), true);
    for (const type of ["pointerup", "pointercancel"])
      document.addEventListener(type, () => (WordHintField.#pressed = false), true);
  }

  /** Whether the typed text is hidden, as in a password field or a concealed phrase. */
  #concealed(): boolean {
    return (
      (this.#field instanceof HTMLInputElement && this.#field.type === "password") ||
      this.#field.classList.contains("concealed")
    );
  }

  /**
   * A press elsewhere takes the focus before its click lands: a hint that went at once would move
   * what was pressed away from under the pointer, as the late Decode note did (2026-10-12). So the
   * hint of a field left by a press goes after the click; one left by the keyboard goes at once.
   */
  #left(): void {
    if (!WordHintField.#pressed) {
      this.#changed();
      return;
    }
    this.#field.ownerDocument.addEventListener("click", () => setTimeout(() => this.#changed()), {
      capture: true,
      once: true,
    });
  }

  #changed(): void {
    clearTimeout(this.#timer);
    const revision = ++this.#revision;
    this.#latest = undefined;
    if (this.#concealed() || this.#field.ownerDocument.activeElement !== this.#field) {
      this.#show(null);
      return;
    }
    this.#timer = setTimeout(() => void this.#ask(revision), TYPING_PAUSE_MS);
  }

  async #ask(revision: number): Promise<void> {
    const value = this.#field.value;
    try {
      const hint = await this.#source(hintContext(value));
      if (revision !== this.#revision) return;
      this.#latest = { value, hint };
      this.#show(hint.shown);
    } catch {
      // A hint only helps typing: without one the field works as before.
      if (revision === this.#revision) this.#show(null);
    }
  }

  /** Tab at the end of the text adds what the words that fit share next, where the source says. */
  #complete(event: KeyboardEvent): void {
    if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
      return;
    const latest = this.#latest;
    const field = this.#field;
    const completion = latest?.hint.completion;
    if (completion === undefined || latest?.value !== field.value) return;
    if (field.selectionStart !== field.value.length) return;
    const added = `${completion.letters}${completion.wordEnds ? " " : ""}`;
    if (added === "") return;
    event.preventDefault();
    field.value += added;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  #show(shown: TypedWordHint["shown"]): void {
    this.#hint.textContent = shown?.text ?? "";
    this.#hint.classList.toggle("warning", shown?.warning === true);
    this.#hint.hidden = shown === null;
  }
}
