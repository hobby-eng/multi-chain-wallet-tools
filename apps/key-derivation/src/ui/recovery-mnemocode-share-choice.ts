// The share set and share form chosen in "Split into Shamir shares", read where another part of the
// MnemoCode panel needs them too: the split itself, and the sheet for heirs, which names how many
// shares restore the phrase and how they look. MnemoCode checks the set again when it splits.
import type { ShareFormat } from "@ckd/recovery-backup/mnemocode-facts.js";
import { required } from "./recovery-workspace-shared.js";

/** The value of the "Other" answer of the share set question. */
export const OTHER_SET = "other";

/** The fewest shares, and the fewest that restore the phrase with a digest; the most in one group. */
const MIN_SHARES = 2;
const MAX_SHARES = 16;

/** How many shares to make, and how many of them restore the seed phrase. */
export class ShareSetChoice {
  readonly threshold: number;
  readonly count: number;

  private constructor(threshold: number, count: number) {
    this.threshold = threshold;
    this.count = count;
  }

  /** `count` shares of which `threshold` restore the phrase. */
  static of(threshold: number, count: number): ShareSetChoice {
    if (!Number.isInteger(count) || count < MIN_SHARES || count > MAX_SHARES)
      throw new RangeError(`Choose ${MIN_SHARES} to ${MAX_SHARES} shares.`);
    if (!Number.isInteger(threshold) || threshold < MIN_SHARES || threshold > count)
      throw new RangeError(`Type a number from ${MIN_SHARES} to ${count}, the number of shares.`);
    return new ShareSetChoice(threshold, count);
  }

  /** The usual sets, offered first, as MnemoCode's menu offers them; Other takes any other. */
  static readonly PRESETS: readonly ShareSetChoice[] = Object.freeze(
    (
      [
        [2, 3],
        [2, 4],
        [3, 4],
        [3, 5],
        [4, 6],
        [5, 7],
      ] as const
    ).map(([threshold, count]) => new ShareSetChoice(threshold, count)),
  );

  /** What the answer Other says about the sets one may type. */
  static readonly OTHER_NOTE = `type the numbers, up to ${MAX_SHARES} shares`;

  /** A whole number as typed, or NaN, which `of` refuses. */
  static typed(answer: string): number {
    return /^\d+$/u.test(answer.trim()) ? Number(answer.trim()) : Number.NaN;
  }

  get label(): string {
    return `${this.threshold} of ${this.count}`;
  }

  get note(): string {
    return `${this.count} shares, any ${this.threshold} restore it`;
  }
}

export function chosenSetValue(): string | undefined {
  return document.querySelector<HTMLInputElement>('input[name="mnemocode-split-set"]:checked')
    ?.value;
}

/** The set chosen, or the person's own. */
export function chosenShareSet(): ShareSetChoice {
  const chosen = chosenSetValue();
  if (chosen !== OTHER_SET) {
    const preset = ShareSetChoice.PRESETS.find((set) => set.label === chosen);
    if (preset === undefined) throw new Error("Choose how many shares to make.");
    return preset;
  }
  return ShareSetChoice.of(
    ShareSetChoice.typed(required<HTMLInputElement>("#mnemocode-split-threshold").value),
    ShareSetChoice.typed(required<HTMLInputElement>("#mnemocode-split-count").value),
  );
}

export function chosenShareForm(): ShareFormat {
  return required<HTMLSelectElement>("#mnemocode-split-form").value as ShareFormat;
}
