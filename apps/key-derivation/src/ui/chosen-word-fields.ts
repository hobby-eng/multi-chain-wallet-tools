// The fields of the words a new phrase must hold and must not hold: a chosen word, at a position or
// anywhere, and a word never to use. Generate & Derive and MHFE's New wallet tab show the same
// fields, built here; each hands what they hold to its own generator, whose library decides what
// it takes and what it costs.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { ChosenWord } from "@ckd/core/bip39-chosen-words.js";
import { BIP39_WORD_COUNTS } from "@ckd/core/bip39-parameters.js";
import { ENGLISH_BIP39_WORDS } from "@ckd/core/bip39-word-reader.js";
import { FieldEdits } from "./field-edits.js";

/** Positions offered by number: up to one before the longest phrase; "Last word" is the last. */
const LONGEST_NUMBERED_POSITION = Math.max(...BIP39_WORD_COUNTS) - 1;
/** One list of suggestions for every word field of the page: 2,048 options add 40 KB to it. */
const SUGGESTIONS_ID = "chosen-words-list";

/**
 * What a chosen word gives away and what it does not, in the words of mhfe new
 * (src/bin/mhfe/chosen_words.rs, tell) and of mhfe's README as the owner approved them: MHFE asks a
 * page to warn whenever describeDraw() says a phrase is recognisable, with any chosen word. Shown
 * whenever a word is chosen, with or without MHFE, since a phrase of the Deriver may be encrypted
 * with MHFE later.
 */
const CHOSEN_WORD_WARNING =
  "If someone learns or guesses your chosen word, it lets them rule out almost every wrong " +
  "password and tell this wallet from a decoy. Never tell anyone your chosen word. Choose no word " +
  "for a wallet you would protect with a decoy. If nobody knows or can guess your word, the " +
  "phrase stays as strong as a random one: the random bits stated are the worst case, for " +
  "someone who knows the word.";

/** Words separated by spaces or commas, as mhfe new reads its lines of words. */
export function wordsOf(text: string): string[] {
  return text.split(/[\s,]+/u).filter(Boolean);
}

/**
 * Whether a field holds something other than English BIP39 words, as the person types: a word
 * field must hold one word, the never-use field any number of them.
 */
export function hasUnknownWords(value: string, single: boolean): boolean {
  if (value.trim() === "") return false;
  const words = single ? [value] : wordsOf(value);
  return words.some((word) => !ENGLISH_BIP39_WORDS.accepts(word));
}

export interface ChosenWordFieldsOptions {
  /** The start of every id: "chosen" gives chosen-word-1, chosen-words-never and so on. */
  readonly prefix: string;
  /** How many words may be chosen: the generator's limit. */
  readonly words: number;
  /** How many words may be excluded: the generator's limit. */
  readonly neverUse: number;
  /** A Show button of their own, where no other control shows the phrase. */
  readonly toggle?: boolean;
}

interface WordRow {
  readonly position: HTMLSelectElement;
  readonly word: HTMLInputElement;
}

export class ChosenWordFields {
  readonly #rows: WordRow[];
  readonly #never: HTMLInputElement;
  /** Whether the never-use field holds one word only. */
  readonly #oneNeverUse: boolean;
  readonly #warning: HTMLParagraphElement;
  readonly #toggle: HTMLButtonElement | undefined;
  readonly #listeners: (() => void)[] = [];
  #revealed = false;

  constructor(
    container: HTMLElement,
    { prefix, words, neverUse, toggle = false }: ChosenWordFieldsOptions,
  ) {
    const page = container.ownerDocument;
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      properties: Partial<HTMLElementTagNameMap[K]> = {},
    ): HTMLElementTagNameMap[K] => Object.assign(page.createElement(tag), properties);
    const textInput = (id: string, placeholder: string): HTMLInputElement => {
      const input = element("input", { id, placeholder, autocomplete: "off", spellcheck: false });
      input.setAttribute("autocapitalize", "none");
      return input;
    };

    const head = element("div", { className: "chosen-words-head" });
    head.append(words === 1 ? "A word the phrase must contain" : "Words the phrase must contain");
    if (words > 1)
      head.append(" ", element("span", { className: "optional", textContent: `up to ${words}` }));
    if (toggle) {
      this.#toggle = element("button", {
        id: `toggle-${prefix}-words`,
        type: "button",
        className: "secondary compact",
      });
      this.#toggle.addEventListener("click", () => this.setRevealed(!this.#revealed));
      head.append(" ", this.#toggle);
    }
    container.append(head);
    this.#rows = Array.from({ length: words }, (_, index) => {
      const number = index + 1;
      const id = `${prefix}-word-${number}`;
      const position = element("select", { id: `${id}-position` });
      position.setAttribute("aria-label", `Where chosen word ${number} goes`);
      position.append(new Option("Anywhere", "anywhere"), new Option("First word", "1"));
      for (let place = 2; place <= LONGEST_NUMBERED_POSITION; place += 1)
        position.append(new Option(`Word ${place}`, String(place)));
      position.append(new Option("Last word", "last"));
      const word = textInput(id, "English BIP39 word");
      word.setAttribute("list", SUGGESTIONS_ID);
      word.setAttribute("aria-label", `Chosen word ${number}`);
      const clear = element("button", {
        id: `${id}-clear`,
        type: "button",
        className: "secondary compact",
        textContent: "Clear",
      });
      clear.addEventListener("click", () => {
        word.value = "";
        position.value = "anywhere";
        this.#changed();
        word.focus();
      });
      const row = element("div", { className: "chosen-words-row", id: `${id}-row` });
      row.append(position, word, clear);
      container.append(row);
      return { position, word };
    });
    this.#warning = element("p", {
      className: "field-note warning",
      textContent: CHOSEN_WORD_WARNING,
      hidden: true,
    });
    this.#oneNeverUse = neverUse === 1;
    const label = element("label", {
      htmlFor: `${prefix}-words-never`,
      textContent: this.#oneNeverUse ? "A word never to use " : "Words never to use ",
    });
    label.append(
      element("span", {
        className: "optional",
        textContent: this.#oneNeverUse
          ? "an English BIP39 word"
          : `up to ${neverUse} English BIP39 words separated by spaces or commas`,
      }),
    );
    this.#never = textInput(`${prefix}-words-never`, "for example: zoo");
    container.append(this.#warning, label, this.#never);
    if (page.getElementById(SUGGESTIONS_ID) === null) {
      const suggestions = element("datalist", { id: SUGGESTIONS_ID });
      suggestions.append(...wordlist.map((word) => new Option(word)));
      container.append(suggestions);
    }
    const edits = new FieldEdits();
    for (const event of ["input", "change"])
      container.addEventListener(event, (happened) => {
        // The Clear buttons report for themselves, after they have emptied their row.
        if (happened.target instanceof HTMLButtonElement) return;
        if (edits.isNew(happened)) this.#changed();
      });
    this.setRevealed(false);
    this.#mark();
  }

  /** The chosen words typed, each with its position in a phrase of `wordCount` words. */
  chosen(wordCount: number): ChosenWord[] {
    return this.#rows
      .filter(({ word }) => word.value.trim() !== "")
      .map(({ position, word }) => ({
        // Invalid input is preserved for the generator's labelled refusal, never silently cut.
        word: ENGLISH_BIP39_WORDS.accepts(word.value)
          ? ENGLISH_BIP39_WORDS.word(word.value)
          : word.value,
        position:
          position.value === "anywhere"
            ? "anywhere"
            : position.value === "last"
              ? wordCount
              : Number(position.value),
      }));
  }

  /** The words the phrase must not hold. */
  neverUse(): string[] {
    const words = this.#oneNeverUse
      ? this.#never.value.trim() === ""
        ? []
        : [this.#never.value]
      : wordsOf(this.#never.value);
    return words.map((word) =>
      ENGLISH_BIP39_WORDS.accepts(word) ? ENGLISH_BIP39_WORDS.word(word) : word,
    );
  }

  /** The word fields, for hints below them. */
  inputs(): HTMLInputElement[] {
    return [...this.#rows.map(({ word }) => word), this.#never];
  }

  /** Whether a word is chosen or excluded. */
  hasWishes(): boolean {
    return this.chosen(LONGEST_NUMBERED_POSITION + 1).length > 0 || this.neverUse().length > 0;
  }

  /**
   * Shows or hides the words, which are part of the secret phrase: hidden like the recovery phrase
   * until the person shows them.
   */
  setRevealed(revealed: boolean): void {
    this.#revealed = revealed;
    for (const field of [...this.#rows.map(({ word }) => word), this.#never]) {
      field.type = revealed ? "text" : "password";
      field.classList.toggle("concealed", !revealed);
    }
    if (this.#toggle === undefined) return;
    this.#toggle.textContent = revealed ? "Hide" : "Show";
    this.#toggle.setAttribute("aria-pressed", String(revealed));
    this.#toggle.setAttribute("aria-label", `${revealed ? "Hide" : "Show"} the chosen words`);
  }

  clear(): void {
    for (const { word, position } of this.#rows) {
      word.value = "";
      position.value = "anywhere";
    }
    this.#never.value = "";
    this.#mark();
  }

  /** Calls `listener` after every edit of the fields. */
  onChange(listener: () => void): void {
    this.#listeners.push(listener);
  }

  #changed(): void {
    this.#mark();
    for (const listener of this.#listeners) listener();
  }

  /** Marks a field that holds something other than English BIP39 words, and warns of a chosen word. */
  #mark(): void {
    for (const { word } of this.#rows)
      word.setAttribute("aria-invalid", String(hasUnknownWords(word.value, true)));
    this.#never.setAttribute(
      "aria-invalid",
      String(hasUnknownWords(this.#never.value, this.#oneNeverUse)),
    );
    this.#warning.hidden = this.#rows.every(({ word }) => word.value.trim() === "");
  }
}
