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

/**
 * A generation mode that draws only phrases that pass a check, as the MHFE wallet check does
 * (checked-mnemonic-feature.ts), plugged into the panel by a build that has it. Its own library
 * rates the wishes, so the mode shows what they keep in its own place; the panel's table holds the
 * rules of the ordinary generator only.
 */
export interface CheckedGeneration {
  /** Whether the mode is chosen. */
  active(): boolean;
  /** Calls `listener` when the mode is chosen or left. */
  onChange(listener: () => void): void;
  /** Takes the panel's wishes, or null while there are none, and shows what they keep. */
  showWishes(request: ((wordCount: ChosenWordCount) => ChosenWordsRequest) | null): void;
}

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
  /** Hands the wishes to a checked generation mode while it is chosen. */
  useChecked(mode: CheckedGeneration): void;
}

export function installChosenWordsFeature(page: Document = document): ChosenWordsFeature {
  const required = <T extends Element>(selector: string) => requireQueryElement<T>(page, selector);
  const enabled = required<HTMLInputElement>("#chosen-words-enabled");
  const panel = required<HTMLElement>("#chosen-words-panel");
  const fields = new ChosenWordFields(required<HTMLElement>("#chosen-words-fields"), {
    prefix: "chosen",
    words: MOST_CHOSEN_WORDS,
    neverUse: MOST_NEVER_USE_WORDS,
  });
  const strength = required<HTMLElement>("#chosen-words-strength");
  const barFill = required<HTMLElement>("#chosen-words-bar-fill");
  const bits = required<HTMLElement>("#chosen-words-bits");
  const verdict = required<HTMLElement>("#chosen-words-verdict");
  const rule = required<HTMLElement>("#chosen-words-rule");
  let checked: CheckedGeneration | undefined;
  const listeners: (() => void)[] = [];

  function request(wordCount: ChosenWordCount): ChosenWordsRequest {
    return { wordCount, chosen: fields.chosen(wordCount), neverUse: fields.neverUse() };
  }

  function active(): boolean {
    return enabled.checked && fields.hasWishes();
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
    // A checked mode rates the wishes with its own library and shows that itself.
    const mode = checked?.active() === true ? checked : undefined;
    strength.hidden = mode !== undefined;
    rule.hidden = mode !== undefined;
    if (mode !== undefined) {
      mode.showWishes(active() ? request : null);
      return;
    }
    const results = WORD_COUNTS.map((wordCount) => ({ wordCount, result: remaining(wordCount) }));
    const shortest = results[0]!;
    const fraction =
      typeof shortest.result === "number"
        ? Math.max(0, shortest.result) / bip39EntropyBits(shortest.wordCount)
        : 0;
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
            ? `≈ ${(Math.floor(result * 10) / 10).toFixed(1)} / ${bip39EntropyBits(wordCount)} bits`
            : "—";
        cell.classList.toggle("chosen-words-alert", typeof result !== "number");
        cell.append(length, value);
        return cell;
      }),
    );
    const problem = results.find(({ result }) => typeof result === "string");
    verdict.classList.toggle("chosen-words-alert", problem !== undefined);
    // A mistake in a word fails every length alike; only a position depends on the length.
    const sameEverywhere = results.every(({ result }) => result === problem?.result);
    if (problem !== undefined && typeof problem.result === "string")
      verdict.textContent = sameEverywhere
        ? problem.result
        : `${problem.wordCount} words: ${problem.result}`;
    else verdict.textContent = "Enough random bits remain at every length.";
  }

  enabled.addEventListener("change", update);
  fields.onChange(update);
  update();

  // Any edit tells the page to drop publication for the older wishes: the panel owns
  // this notice, so that it holds in a build without a checked mode too (AUD-024-API002).
  const changed = (): void => {
    for (const listener of listeners) listener();
  };
  enabled.addEventListener("change", changed);
  fields.onChange(changed);

  return {
    active,
    generate: (wordCount) => generateMnemonicWithChosenWords(request(wordCount)),
    request,
    setRevealed: (revealed) => fields.setRevealed(revealed),
    clear() {
      fields.clear();
      update();
    },
    onChange(listener) {
      listeners.push(listener);
    },
    useChecked(mode) {
      checked = mode;
      mode.onChange(update);
      update();
    },
  };
}
