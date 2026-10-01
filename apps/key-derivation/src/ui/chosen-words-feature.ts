import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  CHOSEN_WORDS_MINIMUM_BITS,
  CHOSEN_WORDS_WARNING_BITS,
  chosenWordsRemainingBits,
  generateMnemonicWithChosenWords,
  type ChosenWord,
  type ChosenWordCount,
  type ChosenWordsRequest,
} from "@ckd/core/bip39-chosen-words.js";
import { requireQueryElement } from "@ckd/ui/dom.js";

/**
 * "Generate with chosen words" in Generate & Derive: up to two words, each anywhere or at a
 * position, and words never to use. With the box ticked, the Generate buttons draw a random
 * phrase that meets these wishes (bip39-chosen-words.ts); the panel shows how many random bits
 * remain for every phrase length.
 */

const WORD_COUNTS: readonly ChosenWordCount[] = [12, 15, 18, 21, 24];
/** Positions offered by number: 1 to 23; "Last word" stands for 24 and every shorter length. */
const LONGEST_NUMBERED_POSITION = 23;

export interface ChosenWordsFeature {
  /** True when the box is ticked and a wish is given: the Generate buttons then call generate. */
  active(): boolean;
  /**
   * A phrase that meets the wishes. A wish that cannot be met rejects; there is no fallback to an
   * ordinary phrase. A newer call or clear() cancels a running search, which rejects with an
   * AbortError.
   */
  generate(wordCount: ChosenWordCount): Promise<string>;
  /** Shows or hides the chosen words together with the recovery phrase: they are part of it. */
  setRevealed(revealed: boolean): void;
  clear(): void;
}

const knownWords = new Set(wordlist);

/**
 * Whether a field holds something other than English BIP39 words, as the person types: a word
 * field must hold one word, the never-use field any number of them.
 */
export function hasUnknownWords(value: string, single: boolean): boolean {
  const words = value.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (single && words.length > 1) return true;
  return words.some((word) => !knownWords.has(word));
}

export function installChosenWordsFeature(page: Document = document): ChosenWordsFeature {
  const required = <T extends Element>(selector: string) => requireQueryElement<T>(page, selector);
  const enabled = required<HTMLInputElement>("#chosen-words-enabled");
  const panel = required<HTMLElement>("#chosen-words-panel");
  const rows = [1, 2].map((number) => ({
    row: required<HTMLElement>(`#chosen-word-${number}-row`),
    position: required<HTMLSelectElement>(`#chosen-word-${number}-position`),
    word: required<HTMLInputElement>(`#chosen-word-${number}`),
  }));
  const addButton = required<HTMLButtonElement>("#chosen-words-add");
  const removeButton = required<HTMLButtonElement>("#chosen-word-2-remove");
  const clearButton = required<HTMLButtonElement>("#chosen-word-1-clear");
  const neverUse = required<HTMLInputElement>("#chosen-words-never");
  const list = required<HTMLDataListElement>("#chosen-words-list");
  const barFill = required<HTMLElement>("#chosen-words-bar-fill");
  const bits = required<HTMLElement>("#chosen-words-bits");
  const verdict = required<HTMLElement>("#chosen-words-verdict");

  // Filled here rather than written into the page: 2,048 options would add 40 KB to the HTML.
  list.replaceChildren(...wordlist.map((word) => new Option(word)));
  for (const { position } of rows) {
    position.append(new Option("Anywhere", "anywhere"), new Option("First word", "1"));
    for (let number = 2; number <= LONGEST_NUMBERED_POSITION; number += 1)
      position.append(new Option(`Word ${number}`, String(number)));
    position.append(new Option("Last word", "last"));
  }

  function chosenWords(wordCount: ChosenWordCount): ChosenWord[] {
    return rows
      .filter(({ row, word }) => !row.hidden && word.value.trim() !== "")
      .map(({ position, word }) => ({
        word: word.value,
        position:
          position.value === "anywhere"
            ? "anywhere"
            : position.value === "last"
              ? wordCount
              : Number(position.value),
      }));
  }

  function request(wordCount: ChosenWordCount): ChosenWordsRequest {
    return {
      wordCount,
      chosen: chosenWords(wordCount),
      neverUse: neverUse.value.split(/\s+/u).filter(Boolean),
    };
  }

  /** The random bits left at one length, or the reason these wishes do not fit it. */
  function remaining(wordCount: ChosenWordCount): number | string {
    try {
      return chosenWordsRemainingBits(request(wordCount));
    } catch (cause) {
      return cause instanceof Error ? cause.message : "These wishes cannot be met.";
    }
  }

  function update(): void {
    panel.hidden = !enabled.checked;
    for (const { word } of rows)
      word.setAttribute("aria-invalid", String(hasUnknownWords(word.value, true)));
    neverUse.setAttribute("aria-invalid", String(hasUnknownWords(neverUse.value, false)));
    const second = rows[1]!;
    addButton.hidden = !second.row.hidden;
    const results = WORD_COUNTS.map((wordCount) => ({ wordCount, result: remaining(wordCount) }));
    const shortest = results[0]!.result;
    const fraction = typeof shortest === "number" ? Math.max(0, shortest) / 128 : 0;
    barFill.style.width = `${(fraction * 100).toFixed(1)}%`;
    // One cell per length: "12 words" over "≈ 109 / 128 bits", or a dash when it cannot be met.
    bits.replaceChildren(
      ...results.map(({ wordCount, result }) => {
        const cell = document.createElement("span");
        const length = document.createElement("small");
        length.textContent = `${wordCount} words`;
        // Tenths, rounded down: a never-use word costs a few thousandths of a bit, and the shown
        // value never reaches a threshold that the exact value is below.
        const value =
          typeof result === "number"
            ? `≈ ${(Math.floor(result * 10) / 10).toFixed(1)} / ${(wordCount * 32) / 3} bits`
            : "—";
        cell.classList.toggle(
          "chosen-words-alert",
          typeof result !== "number" || result < CHOSEN_WORDS_WARNING_BITS,
        );
        cell.append(length, value);
        return cell;
      }),
    );
    const problem = results.find(({ result }) => typeof result === "string");
    const lowest = Math.min(
      ...results.map(({ result }) => (typeof result === "number" ? result : Infinity)),
    );
    verdict.classList.toggle(
      "chosen-words-alert",
      problem !== undefined || lowest < CHOSEN_WORDS_WARNING_BITS,
    );
    // A mistake in a word fails every length alike; only a position depends on the length.
    const sameEverywhere = results.every(({ result }) => result === problem?.result);
    if (problem !== undefined && typeof problem.result === "string")
      verdict.textContent = sameEverywhere
        ? problem.result
        : `${problem.wordCount} words: ${problem.result}`;
    else if (lowest < CHOSEN_WORDS_MINIMUM_BITS)
      verdict.textContent = `Below ${CHOSEN_WORDS_MINIMUM_BITS} bits the phrase is refused. Remove a wish or choose a longer phrase.`;
    else if (lowest < CHOSEN_WORDS_WARNING_BITS)
      verdict.textContent = `Below ${CHOSEN_WORDS_WARNING_BITS} bits: still far beyond guessing, but noticeably weaker. A longer phrase keeps more.`;
    else verdict.textContent = "Enough random bits remain at every length.";
  }

  enabled.addEventListener("change", update);
  for (const { position, word } of rows) {
    position.addEventListener("change", update);
    word.addEventListener("input", update);
  }
  neverUse.addEventListener("input", update);
  addButton.addEventListener("click", () => {
    rows[1]!.row.hidden = false;
    update();
    rows[1]!.word.focus();
  });
  clearButton.addEventListener("click", () => {
    rows[0]!.word.value = "";
    rows[0]!.position.value = "anywhere";
    update();
    rows[0]!.word.focus();
  });
  removeButton.addEventListener("click", () => {
    rows[1]!.row.hidden = true;
    rows[1]!.word.value = "";
    update();
    addButton.focus();
  });
  // Hidden like the recovery phrase until "Show phrase": a chosen word is part of the phrase.
  const secretFields = [...rows.map(({ word }) => word), neverUse];
  function setRevealed(revealed: boolean): void {
    for (const field of secretFields) {
      field.type = revealed ? "text" : "password";
      field.classList.toggle("concealed", !revealed);
    }
  }
  setRevealed(false);
  update();

  let search: AbortController | null = null;
  function cancelSearch(): void {
    search?.abort();
    search = null;
  }

  return {
    active() {
      if (!enabled.checked) return false;
      return (
        rows.some(({ row, word }) => !row.hidden && word.value.trim() !== "") ||
        neverUse.value.trim() !== ""
      );
    },
    async generate(wordCount) {
      cancelSearch();
      const current = new AbortController();
      search = current;
      try {
        return await generateMnemonicWithChosenWords(request(wordCount), {
          signal: current.signal,
        });
      } finally {
        if (search === current) search = null;
      }
    },
    setRevealed,
    clear() {
      cancelSearch();
      for (const { word, position } of rows) {
        word.value = "";
        position.value = "anywhere";
      }
      rows[1]!.row.hidden = true;
      neverUse.value = "";
      update();
    },
  };
}
