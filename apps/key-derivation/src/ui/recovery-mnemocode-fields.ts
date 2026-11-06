// Controls that the MnemoCode tabs share: the mode and representation selects with their "How it
// works" popovers, the Seedshift dates, and the words of the seed phrase.
import {
  mnemoCodeDatesFor,
  mnemoCodeTakesDates,
  type MnemoCodeDates,
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
import { PHRASE_FILE_IMPORT, required } from "./recovery-workspace-shared.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import { FieldImportRevision } from "@ckd/ui/field-import-revision.js";
import { isMaskingMode, isEncodedFormat } from "@ckd/recovery-backup/mnemocode-facts.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const ERRORS = new ErrorCatalog("wallet.mnemocode-fields", {
  mode: () => "Choose a supported MnemoCode mode.",
  format: () => "Choose a supported MnemoCode representation.",
});

export function selectedMode(select: HTMLSelectElement): MnemoCodeMode {
  const value = select.value;
  if (!isMaskingMode(value)) throw ERRORS.create("mode", []);
  return value;
}

export function selectedFormat(select: HTMLSelectElement): MnemoCodeFormat {
  const value = select.value;
  if (!isEncodedFormat(value)) throw ERRORS.create("format", []);
  return value;
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
  readonly #input: HTMLTextAreaElement;
  readonly #field: HTMLElement;
  readonly #imports: FieldImportRevision;
  #mode: MnemoCodeMode | undefined;

  /** `prefix` names the tab, as in `#mnemocode-{prefix}-dates`. */
  constructor(prefix: string) {
    this.#input = required<HTMLTextAreaElement>(`#mnemocode-${prefix}-dates`);
    this.#field = required<HTMLElement>(`#mnemocode-${prefix}-dates-field`);
    this.#imports = new FieldImportRevision(document, this.#input);
    installTextFileImport(document, this.#input, {
      label: "Open a dates text file",
      accept: PHRASE_FILE_IMPORT.accept,
      preserveWhitespace: false,
    });
  }

  /** The editable native field; callers attach operation edits and read marked date patterns. */
  get input(): HTMLTextAreaElement {
    return this.#input;
  }

  /** Ends pending imports when the operation stops accepting dates, even if it later reopens. */
  set available(available: boolean) {
    if (this.#input.disabled === available) this.#imports.revise();
    this.#input.disabled = !available;
  }

  /** Hidden date controls reject pending file publication until a dates mode is selected. */
  showFor(mode: MnemoCodeMode): void {
    if (this.#mode !== mode) this.#imports.revise();
    this.#mode = mode;
    const takesDates = mnemoCodeTakesDates(mode);
    this.#field.hidden = !takesDates;
    this.available = takesDates;
  }

  /** The dates for `mode` as typed; Direct has none, and text left in the hidden field is ignored. */
  values(mode: MnemoCodeMode): MnemoCodeDates {
    return mnemoCodeDatesFor(mode, this.#input.value);
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
