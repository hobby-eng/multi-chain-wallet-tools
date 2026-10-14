// Controls that the MnemoCode tabs share: the mode and representation selects with their "How it
// works" popovers, the Seedshift dates, and the words of the seed phrase.
import {
  mnemoCodeDatesFor,
  mnemoCodeTakesDates,
  type MnemoCodeDate,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  MNEMOCODE_PHRASE_WORD_COUNTS,
  MASKING_MODES,
  ENCODED_FORMATS,
  type MnemoCodePhraseWords,
} from "@ckd/recovery-backup/mnemocode.js";
import {
  MNEMOCODE_MODE_HELP,
  MNEMOCODE_FORMAT_HELP,
  renderMnemoCodeHelp,
  type MnemoCodeHelp,
} from "./recovery-mnemocode-help.js";
import { required } from "./recovery-workspace-shared.js";

export function selectedMode(select: HTMLSelectElement): MnemoCodeMode {
  return select.value as MnemoCodeMode;
}

export function selectedFormat(select: HTMLSelectElement): MnemoCodeFormat {
  return select.value as MnemoCodeFormat;
}

/** Every tab reads the library's choices and the same help titles, rather than copying lists. */
export function installModeAndFormatChoices(prefix: string, auto = false, datesOnly = false): void {
  const option = (value: string, label: string): HTMLOptionElement => {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    return item;
  };
  required<HTMLSelectElement>(`#mnemocode-${prefix}-mode`).replaceChildren(
    ...MASKING_MODES.filter((mode) => !datesOnly || mnemoCodeTakesDates(mode)).map((mode) =>
      option(mode, MNEMOCODE_MODE_HELP[mode].title),
    ),
  );
  required<HTMLSelectElement>(`#mnemocode-${prefix}-format`).replaceChildren(
    ...(auto ? [option("auto", "Auto-detect")] : []),
    ...ENCODED_FORMATS.map((format) => option(format, MNEMOCODE_FORMAT_HELP[format].title)),
  );
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
    this.#field.hidden = !mnemoCodeTakesDates(mode);
  }

  /** The dates for `mode`; Direct has none, and text left in the hidden field is ignored. */
  values(mode: MnemoCodeMode): MnemoCodeDate[] {
    return mnemoCodeDatesFor(mode, this.input.value);
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

/** Adds the lengths a seed phrase may have (MnemoCode's list) after a choice's first option. */
export function installPhraseWordCounts(select: HTMLSelectElement): void {
  for (const words of MNEMOCODE_PHRASE_WORD_COUNTS) {
    const option = document.createElement("option");
    option.value = String(words);
    option.textContent = `${words} words`;
    select.append(option);
  }
}

/** The word count chosen, or undefined for the first option, where every code typed is read. */
export function chosenPhraseWords(select: HTMLSelectElement): MnemoCodePhraseWords {
  return MNEMOCODE_PHRASE_WORD_COUNTS.find((words) => String(words) === select.value);
}
