import {
  MnemoCodeDisclosure,
  type MnemoCodeCopy,
  type OriginalCopyChoice,
} from "@ckd/recovery-backup/mnemocode-disclosure.js";
import { Masking } from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import type { MaskingMode } from "../../../../packages/recovery-mnemocode/source/core/types.js";
import { paragraph, required, renderSensitiveShares } from "./recovery-workspace-shared.js";

/** Shared display fields and concealed copy rendering for ordinary Encode and Encode + SSKR. */
export class MnemoCodeDisclosureFields {
  readonly masked = required<HTMLInputElement>("#mnemocode-show-masked-words");

  /** The split-only original choice is owned by its section; ordinary Encode never reads it. */
  static installOriginal(): HTMLSelectElement {
    const select = required<HTMLSelectElement>("#mnemocode-show-original");
    select.replaceChildren(
      ...MnemoCodeDisclosure.ORIGINAL_CHOICES.map(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    return select;
  }

  /** Captures a validated selection before a split's asynchronous work. */
  static originalChoice(select: HTMLSelectElement): OriginalCopyChoice {
    return MnemoCodeDisclosure.originalChoice(select.value);
  }

  /** Direct has no after-Seedshift phrase; a hidden choice cannot change that meaning. */
  showFor(mode: MaskingMode): void {
    const masked = Masking.of(mode).masked;
    required<HTMLElement>("#mnemocode-show-masked-words-field").hidden = !masked;
    this.masked.disabled = !masked;
  }

  /** Each optional copy uses the existing reveal/copy/QR guard, without altering any export input. */
  static render(
    target: HTMLElement,
    copies: readonly MnemoCodeCopy[],
    clipboard: (text: string) => Promise<void>,
    current: () => boolean,
  ): void {
    for (const copy of copies) {
      renderSensitiveShares(target, [copy.text], clipboard, [copy.label], [copy.apart], current);
      target.append(paragraph(copy.note, "warning-callout"));
    }
  }
}
