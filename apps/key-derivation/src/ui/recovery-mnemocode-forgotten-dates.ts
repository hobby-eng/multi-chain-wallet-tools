import {
  effectiveMnemoCodeMode,
  mnemoCodeCodes,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import type { WalletEvidenceRequest } from "@ckd/recovery-backup/mnemocode-wallet.js";
import {
  DatesAnswer,
  walletNeeded,
} from "../../../../packages/recovery-mnemocode/source/core/date-search.js";
import { EncodedForm } from "../../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { FieldEdits } from "./field-edits.js";
import {
  chosenPhraseWords,
  installModeAndFormatChoices,
  installPhraseWordCounts,
} from "./recovery-mnemocode-fields.js";
import { MnemoCodeSearchSettingsFields } from "./recovery-mnemocode-search-settings.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";
import {
  installFieldImports,
  installSecretToggle,
  RECORD_FILE_IMPORT,
  required,
} from "./recovery-workspace-shared.js";

const PREFIX = "mnemocode-forgotten";

/** Owns the date tab's input capture; the library still reads every code, date and override. */
export class MnemoCodeForgottenDates {
  readonly #codes = required<HTMLTextAreaElement>(`#${PREFIX}-codes`);
  readonly #words = required<HTMLSelectElement>(`#${PREFIX}-words`);
  readonly #mode = required<HTMLSelectElement>(`#${PREFIX}-mode`);
  readonly #format = required<HTMLSelectElement>(`#${PREFIX}-format`);
  readonly #dates = required<HTMLInputElement>(`#${PREFIX}-dates`);
  readonly #settings = new MnemoCodeSearchSettingsFields(PREFIX, "dates");

  constructor(status: HTMLElement) {
    installModeAndFormatChoices("forgotten", true, true);
    installPhraseWordCounts(this.#words);
    installSecretToggle(`#toggle-${PREFIX}-codes`, `#${PREFIX}-codes`, "Show", "Hide", "codes");
    installFieldImports(this.#codes, (message) => (status.textContent = message), {
      file: RECORD_FILE_IMPORT,
      qr: {},
    });
    attachMnemoCodeWordHints(this.#codes, EncodedForm.typedWords);
  }

  onEdit(listener: () => void): void {
    this.#settings.onEdit(listener);
    const edits = new FieldEdits();
    for (const field of [this.#codes, this.#words, this.#mode, this.#format, this.#dates])
      for (const type of ["input", "change"])
        field.addEventListener(type, (event) => {
          if (edits.isNew(event)) listener();
        });
  }

  set available(available: boolean) {
    this.#settings.available = available;
  }

  get mode(): MnemoCodeMode {
    return effectiveMnemoCodeMode(this.#codes.value, this.#mode.value as MnemoCodeMode);
  }

  size(): string {
    if (this.#dates.value.trim() === "") return "";
    try {
      const dates = DatesAnswer.parse(this.#dates.value, { patterns: true });
      if (!dates.hasForgottenDigits)
        return "Mark what is forgotten in a date with ?: a digit, a whole day, month or year, or the whole date; join values you are unsure between with |.";
      return (
        dates.forgottenDigitsNote ?? `${dates.combinations.toLocaleString("en-US")} combinations.`
      );
    } catch (cause) {
      return cause instanceof Error ? cause.message : "";
    }
  }

  request(wallet: WalletEvidenceRequest | undefined) {
    const { mode, indexes } = mnemoCodeCodes(
      this.#codes.value,
      this.#mode.value as MnemoCodeMode,
      this.#format.value as MnemoCodeFormat | "auto",
      chosenPhraseWords(this.#words),
    );
    if (walletNeeded(mode) && wallet === undefined)
      throw new Error(
        "Every guessed date gives a valid phrase in this mode: only the wallet tells which is yours.",
      );
    return {
      type: "dates" as const,
      indexes,
      mode,
      dates: this.#dates.value,
      ...(wallet === undefined ? {} : { wallet }),
      ...this.#settings.request,
    };
  }
}
