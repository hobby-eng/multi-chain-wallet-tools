import {
  MOST_CHOSEN_WORDS,
  MOST_NEVER_USE_WORDS,
  chosenWordsRemainingBits,
  generateMnemonicWithChosenWords,
  type ChosenWordCount,
  type ChosenWordsRequest,
} from "@ckd/core/bip39-chosen-words.js";
import { BIP39_WORD_COUNTS, bip39EntropyBits } from "@ckd/core/bip39-parameters.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import { ChosenWordFields } from "./chosen-word-fields.js";

/**
 * "Generate with a chosen word" in Generate & Derive: a chosen word, anywhere or at a position, and
 * a word never to use. With the box ticked, the Generate buttons draw a random phrase that meets
 * these wishes (bip39-chosen-words.ts); the panel shows how many random bits remain for every
 * phrase length.
 */

const WORD_COUNTS: readonly ChosenWordCount[] = BIP39_WORD_COUNTS;
const PERCENT_SCALE = 100;
const BIT_DISPLAY_SCALE = 10;

export interface ChosenWordsFeature {
  /** True when the box is ticked and a wish is given: the Generate buttons then call generate. */
  active(): boolean;
  /**
   * A phrase that meets the wishes. A wish that cannot be met rejects; there is no fallback to an
   * ordinary phrase. Sampling completes synchronously before this promise is returned;
   * the controller separately guards publication when an input changes before its await resumes.
   */
  generate(wordCount: ChosenWordCount): Promise<string>;
  /** A snapshot of the same wishes, for a sampler that also applies a wallet check. */
  request(wordCount: ChosenWordCount): ChosenWordsRequest;
  /** Shows or hides the chosen words together with the recovery phrase: they are part of it. */
  setRevealed(revealed: boolean): void;
  clear(): void;
  /**
   * Calls `listener` whenever a wish changes: a phrase made
   * for the earlier wishes must not be published (AUD-024-API002).
   */
  onChange(listener: () => void): void;
  /**
   * While a generation option that checks the phrase is chosen (TON's check, the MHFE wallet
   * check), the panel's table of bits for every length gives way to the option's own statement of
   * what the wishes and the checks keep (phrase-generation.ts).
   */
  setConditioned(conditioned: boolean): void;
}

import { defined } from "@ckd/core/defined.js";
/** Owns chosen-word controls and readiness; generation and strength rules come from the library. */
export class ChosenWordsPanel implements ChosenWordsFeature {
  readonly #enabled;
  readonly #panel;
  readonly #fields;
  readonly #strength;
  readonly #barFill;
  readonly #bits;
  readonly #verdict;
  readonly #rule;
  #conditioned = false;
  readonly #listeners: (() => void)[];
  constructor(page: Document = document) {
    const required = <T extends Element>(selector: string) =>
      requireQueryElement<T>(page, selector);
    this.#enabled = required<HTMLInputElement>("#chosen-words-enabled");
    this.#panel = required<HTMLElement>("#chosen-words-panel");
    this.#fields = new ChosenWordFields(required<HTMLElement>("#chosen-words-fields"), {
      prefix: "chosen",
      words: MOST_CHOSEN_WORDS,
      neverUse: MOST_NEVER_USE_WORDS,
    });
    this.#strength = required<HTMLElement>("#chosen-words-strength");
    this.#barFill = required<HTMLElement>("#chosen-words-bar-fill");
    this.#bits = required<HTMLElement>("#chosen-words-bits");
    this.#verdict = required<HTMLElement>("#chosen-words-verdict");
    this.#rule = required<HTMLElement>("#chosen-words-rule");
    this.#listeners = [];
    this.#enabled.addEventListener("change", this.#update);
    this.#fields.onChange(this.#update);
    this.#update();
    this.#enabled.addEventListener("change", this.#changed);
    this.#fields.onChange(this.#changed);
  }
  /** {@inheritDoc ChosenWordsFeature.request} */
  readonly request = (wordCount: ChosenWordCount): ChosenWordsRequest => {
    return { wordCount, chosen: this.#fields.chosen(wordCount), neverUse: this.#fields.neverUse() };
  };
  /** {@inheritDoc ChosenWordsFeature.active} */
  readonly active = (): boolean => {
    return this.#enabled.checked && this.#fields.hasWishes();
  };
  readonly #remaining = (wordCount: ChosenWordCount): number | string => {
    try {
      return chosenWordsRemainingBits(this.request(wordCount));
    } catch (cause) {
      return cause instanceof Error ? cause.message : "These wishes cannot be met.";
    }
  };
  readonly #update = (): void => {
    this.#panel.hidden = !this.#enabled.checked;
    // A generation option that checks the phrase states the bits itself.
    this.#strength.hidden = this.#conditioned;
    this.#rule.hidden = this.#conditioned;
    if (this.#conditioned) return;
    const results = WORD_COUNTS.map((wordCount) => ({
      wordCount,
      result: this.#remaining(wordCount),
    }));
    const shortest = defined(results[0]);
    const fraction =
      typeof shortest.result === "number"
        ? Math.max(0, shortest.result) / bip39EntropyBits(shortest.wordCount)
        : 0;
    this.#barFill.style.width = `${(fraction * PERCENT_SCALE).toFixed(1)}%`;
    // One cell per length: "12 words" over "≈ 109 / 128 bits", or a dash when it cannot be met.
    this.#bits.replaceChildren(
      ...results.map(({ wordCount, result }) => {
        const cell = document.createElement("span");
        const length = document.createElement("small");
        length.textContent = `${wordCount} words`;
        // Tenths, rounded down: a never-use word costs a few thousandths of a bit, and the shown
        // value never reaches a threshold that the exact value is below.
        const value =
          typeof result === "number"
            ? `≈ ${(Math.floor(result * BIT_DISPLAY_SCALE) / BIT_DISPLAY_SCALE).toFixed(1)} / ${bip39EntropyBits(wordCount)} bits`
            : "—";
        cell.classList.toggle("chosen-words-alert", typeof result !== "number");
        cell.append(length, value);
        return cell;
      }),
    );
    const problem = results.find(({ result }) => typeof result === "string");
    this.#verdict.classList.toggle("chosen-words-alert", problem !== undefined);
    // A mistake in a word fails every length alike; only a position depends on the length.
    const sameEverywhere = results.every(({ result }) => result === problem?.result);
    if (problem !== undefined && typeof problem.result === "string")
      this.#verdict.textContent = sameEverywhere
        ? problem.result
        : `${problem.wordCount} words: ${problem.result}`;
    else this.#verdict.textContent = "Enough random bits remain at every length.";
  };
  readonly #changed = (): void => {
    for (const listener of this.#listeners) listener();
  };
  /** {@inheritDoc ChosenWordsFeature.generate} */
  readonly generate = (wordCount: ChosenWordCount) =>
    generateMnemonicWithChosenWords(this.request(wordCount));
  /** {@inheritDoc ChosenWordsFeature.setRevealed} */
  readonly setRevealed = (revealed: boolean) => this.#fields.setRevealed(revealed);
  /** {@inheritDoc ChosenWordsFeature.clear} */
  readonly clear = () => {
    this.#fields.clear();
    this.#update();
  };
  /** {@inheritDoc ChosenWordsFeature.onChange} */
  readonly onChange = (listener: () => void): void => {
    this.#listeners.push(listener);
  };
  /** {@inheritDoc ChosenWordsFeature.setConditioned} */
  readonly setConditioned = (conditioned: boolean): void => {
    if (conditioned === this.#conditioned) return;
    this.#conditioned = conditioned;
    this.#update();
  };
}
/** Compatibility installer; one panel owns its native fields and event bindings. */
export function installChosenWordsFeature(page: Document = document): ChosenWordsFeature {
  return new ChosenWordsPanel(page);
}
