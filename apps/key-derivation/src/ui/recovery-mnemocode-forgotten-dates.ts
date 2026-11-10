import {
  effectiveMnemoCodeMode,
  mnemoCodeCodesText,
  mnemoCodeFormAndMode,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { readHiddenQrRecord } from "@ckd/recovery-backup/mnemocode-hidden-qr.js";
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { Masking } from "@ckd/recovery-backup/mnemocode-facts.js";
import {
  correctedRowWarning,
  isStitchLegendRefusal,
  readStitchLegendLine,
} from "@ckd/recovery-backup/mnemocode-stitch.js";
import type { WalletEvidenceRequest } from "@ckd/recovery-backup/mnemocode-wallet.js";
import { FieldEdits } from "./field-edits.js";
import {
  chosenPhraseWords,
  DatesField,
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

/** The codes as MnemoCode reads them, and the legend row taken as misread where they were a legend. */
interface ForgottenCodes {
  readonly text: string;
  readonly legend: boolean;
  readonly correctedRow?: number | undefined;
}

/** Owns the date tab's input capture; the library still reads every code, date and override. */
export class MnemoCodeForgottenDates {
  readonly #codes = required<HTMLTextAreaElement>(`#${PREFIX}-codes`);
  readonly #words = required<HTMLSelectElement>(`#${PREFIX}-words`);
  readonly #mode = required<HTMLSelectElement>(`#${PREFIX}-mode`);
  readonly #format = required<HTMLSelectElement>(`#${PREFIX}-format`);
  readonly #dates = new DatesField("forgotten");
  readonly #settings = new MnemoCodeSearchSettingsFields(PREFIX, "dates");

  constructor(status: HTMLElement) {
    installModeAndFormatChoices("forgotten", true, true);
    installPhraseWordCounts(this.#words);
    installSecretToggle(`#toggle-${PREFIX}-codes`, `#${PREFIX}-codes`, "Show", "Hide", "codes");
    installFieldImports(this.#codes, (message) => (status.textContent = message), {
      file: RECORD_FILE_IMPORT,
      qr: { readHidden: readHiddenQrRecord },
    });
    attachMnemoCodeWordHints(this.#codes, "codes");
  }

  onEdit(listener: () => void): void {
    this.#settings.onEdit(listener);
    const edits = new FieldEdits();
    for (const field of [this.#codes, this.#words, this.#mode, this.#format, this.#dates.input])
      for (const type of ["input", "change"])
        field.addEventListener(type, (event) => {
          if (edits.isNew(event)) listener();
        });
  }

  set available(available: boolean) {
    this.#settings.available = available;
    this.#dates.available = available;
  }

  /** The codes typed; a SeedStitch legend line stands for the record it holds, as in Decode. */
  #codesText(): ForgottenCodes {
    const legend = readStitchLegendLine(this.#codes.value);
    return legend === undefined
      ? { text: this.#codes.value, legend: false }
      : { text: legend.record, legend: true, correctedRow: legend.correctedRow };
  }

  /** The form and mode of the codes; a legend holds a whole phrase, so every code is read. */
  #formAndMode(codes: ForgottenCodes) {
    return mnemoCodeFormAndMode(
      codes.text,
      this.#mode.value as MnemoCodeMode,
      this.#format.value as MnemoCodeFormat | "auto",
      codes.legend ? undefined : chosenPhraseWords(this.#words),
    );
  }

  get mode(): MnemoCodeMode {
    try {
      return effectiveMnemoCodeMode(this.#codesText().text, this.#mode.value as MnemoCodeMode);
    } catch (cause) {
      // A legend line that does not read yet still stands for a Seedshift record.
      return isStitchLegendRefusal(cause) ? "seedshift" : (this.#mode.value as MnemoCodeMode);
    }
  }

  /** How many date combinations MnemoCode will try, or why it cannot read the dates or codes yet. */
  size(): string {
    const dates = this.#dates.input.value;
    if (dates.trim() === "") return "";
    if (!/[?|]/u.test(dates))
      return "Mark what is forgotten in a date with ?: a digit, a whole day, month or year, or the whole date; join values you are unsure between with |.";
    if (this.#codes.value.trim() === "") return "";
    try {
      const codes = this.#codesText();
      const { format, mode } = this.#formAndMode(codes);
      using recovery = mnemocode().Recovery.withoutWallet();
      using search = recovery.dateSearch(
        mnemoCodeCodesText(codes.text),
        format,
        mode,
        dates,
        Number.NaN,
        0,
      );
      using progress = search.step(0);
      const corrected =
        codes.correctedRow === undefined ? "" : `${correctedRowWarning(codes.correctedRow)} `;
      return progress.total === undefined
        ? corrected.trim()
        : `${corrected}${progress.total.toLocaleString("en-US")} combinations.`;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "";
    }
  }

  request(wallet: WalletEvidenceRequest | undefined) {
    const codes = this.#codesText();
    const { format, mode } = this.#formAndMode(codes);
    if (Masking.of(mode).keepsChecksum && wallet === undefined)
      throw new Error(
        "Every guessed date gives a valid phrase in this mode: only the wallet tells which is yours.",
      );
    return {
      type: "dates" as const,
      codes: codes.text,
      format,
      mode,
      dates: this.#dates.input.value,
      ...(wallet === undefined ? {} : { wallet }),
      ...this.#settings.request,
    };
  }
}
