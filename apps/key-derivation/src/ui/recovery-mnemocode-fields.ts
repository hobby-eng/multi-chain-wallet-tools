// Controls that the MnemoCode Encode and Decode tabs share: the mode and representation selects
// with their "How it works" popovers, and the Seedshift dates.
import {
  parseMnemoCodeDates,
  type MnemoCodeDate,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { renderMnemoCodeHelp, type MnemoCodeHelp } from "./recovery-mnemocode-help.js";
import { required } from "./recovery-workspace-shared.js";

export function selectedMode(select: HTMLSelectElement): MnemoCodeMode {
  return select.value as MnemoCodeMode;
}

export function selectedFormat(select: HTMLSelectElement): MnemoCodeFormat {
  return select.value as MnemoCodeFormat;
}

/** A Seedshift dates field, shown only for a mode that uses dates. */
export class DatesField {
  readonly input: HTMLTextAreaElement;
  readonly #field: HTMLElement;

  /** `prefix` names the tab, as in `#mnemocode-{prefix}-dates`. */
  constructor(prefix: string) {
    this.input = required<HTMLTextAreaElement>(`#mnemocode-${prefix}-dates`);
    this.#field = required<HTMLElement>(`#mnemocode-${prefix}-dates-field`);
  }

  showFor(mode: MnemoCodeMode): void {
    this.#field.hidden = mode === "direct";
  }

  /** The dates for `mode`; Direct has none, and text left in the hidden field is ignored. */
  values(mode: MnemoCodeMode): MnemoCodeDate[] {
    return mode === "direct" ? [] : parseMnemoCodeDates(this.input.value);
  }
}

/** Keeps a "How it works" popover in step with the selected option. */
export function installOptionHelp(
  control: HTMLSelectElement | HTMLInputElement,
  helpSelector: string,
  helpFor: (value: string, checked: boolean) => MnemoCodeHelp | undefined,
): void {
  const popover = required<HTMLElement>(`${helpSelector} .recovery-help-popover`);
  const update = (): void => {
    const checked = control instanceof HTMLInputElement && control.checked;
    const help = helpFor(control.value, checked);
    if (help !== undefined) renderMnemoCodeHelp(popover, help);
  };
  control.addEventListener("change", update);
  update();
}
