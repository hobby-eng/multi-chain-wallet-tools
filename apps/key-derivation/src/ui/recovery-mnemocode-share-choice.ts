// The share set and share form chosen in "Split into Shamir shares", read where another part of the
// MnemoCode panel needs them too: the split itself, and the sheet for heirs, which names how many
// shares restore the phrase and how they look. The rules are MnemoCode's (ShareSetChoice).
import { ShareSetChoice } from "../../../../packages/recovery-mnemocode/source/core/backup-options.js";
import type { ShareFormat } from "../../../../packages/recovery-mnemocode/source/sskr/transport.js";
import { required } from "./recovery-workspace-shared.js";

/** The value of the "Other" answer of the share set question. */
export const OTHER_SET = "other";

export function chosenSetValue(): string | undefined {
  return document.querySelector<HTMLInputElement>('input[name="mnemocode-split-set"]:checked')
    ?.value;
}

/** The set chosen, or the person's own, checked as MnemoCode checks it. */
export function chosenShareSet(): ShareSetChoice {
  const chosen = chosenSetValue();
  if (chosen !== OTHER_SET) {
    const preset = ShareSetChoice.PRESETS.find((set) => set.label === chosen);
    if (preset === undefined) throw new Error("Choose how many shares to make.");
    return preset;
  }
  const count = ShareSetChoice.typedCount(
    required<HTMLInputElement>("#mnemocode-split-count").value,
  );
  const threshold = ShareSetChoice.typedThreshold(
    required<HTMLInputElement>("#mnemocode-split-threshold").value,
    count,
  );
  return ShareSetChoice.of(threshold, count);
}

export function chosenShareForm(): ShareFormat {
  return required<HTMLSelectElement>("#mnemocode-split-form").value as ShareFormat;
}
