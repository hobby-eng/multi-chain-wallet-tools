import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";
import { EncodedForm } from "../../recovery-mnemocode/source/core/encoded-form.js";
import { ErrorCatalog } from "../../recovery-mnemocode/source/core/error-catalog.js";
import { Masking } from "../../recovery-mnemocode/source/core/masking.js";
import type { EncodedFormat, MaskingMode } from "../../recovery-mnemocode/source/core/types.js";

const ORIGINAL_CHOICES = [
  { value: "none", label: "Do not show the original phrase", words: false, codes: false },
  { value: "words", label: "Original English words only", words: true, codes: false },
  {
    value: "codes",
    label: "Original in the selected representation only",
    words: false,
    codes: true,
  },
  { value: "both", label: "Original English words and selected codes", words: true, codes: true },
] as const;
/** The original wallet copy is never enabled by a representation or masking selection. */
export type OriginalCopyChoice = (typeof ORIGINAL_CHOICES)[number]["value"];

/** One optional concealed display, separate from record and share export data. */
export interface MnemoCodeCopy {
  readonly role: "original" | "masked";
  readonly text: string;
  readonly label: string;
  readonly note: string;
  readonly apart?: readonly string[] | undefined;
}

const ERRORS = new ErrorCatalog("mnemocode.disclosure", {
  "original-choice": () => "Select how to show the original wallet seed phrase.",
});
const ORIGINAL_NOTE =
  "This complete original copy needs no shares or Seedshift dates. Any separate BIP39 passphrase is still needed. Keep it apart from the shares.";
const MASKED_NOTE =
  "These are the masked/decoy words after Seedshift. The same dates are still needed to recover the original wallet. Keep the words apart from the dates.";

/** Validates explicit copy choices, delegates representations and avoids duplicate English rows. */
export class MnemoCodeDisclosure {
  /** Display-only choices; none is the default and does not compute an original copy. */
  static readonly ORIGINAL_CHOICES = Object.freeze(ORIGINAL_CHOICES);

  /** Refuses unknown runtime selectors without echoing or coercing them. */
  static originalChoice(value: unknown): OriginalCopyChoice {
    return this.#choice(value).value;
  }

  static #choice(value: unknown) {
    const choice = this.ORIGINAL_CHOICES.find((choice) => choice.value === value);
    if (choice === undefined) throw ERRORS.create("original-choice", []);
    return choice;
  }

  /** Optional original displays use the existing direct encoder, never the shifted phrase. */
  static original(
    original: string,
    format: EncodedFormat,
    choice: OriginalCopyChoice,
  ): readonly MnemoCodeCopy[] {
    const selected = this.#choice(choice);
    const rows: MnemoCodeCopy[] = [];
    if (selected.words)
      rows.push({
        role: "original",
        text: original,
        label: "Original wallet seed phrase before Seedshift · English words",
        note: ORIGINAL_NOTE,
      });
    if (selected.codes) {
      const text = EncodedBackup.encode(original, [], format, "direct").backup.text();
      // English codes are the same words: when both were requested, that complete copy appears once.
      if (!rows.some((row) => row.text === text))
        rows.push({
          role: "original",
          text,
          label: "Original wallet seed phrase before Seedshift · selected representation",
          note: ORIGINAL_NOTE,
          apart: EncodedForm.of(format).apartCodes(text),
        });
    }
    return rows;
  }

  /** A separate explicit checkbox permits masked words; an existing identical English row suffices. */
  static masked(
    words: string,
    mode: MaskingMode,
    wanted: boolean,
    alreadyShown?: string,
  ): readonly MnemoCodeCopy[] {
    if (!wanted || !Masking.of(mode).masked || words === alreadyShown) return [];
    return [
      {
        role: "masked",
        text: words,
        label: "Masked/decoy seed phrase after Seedshift · English words",
        note: MASKED_NOTE,
      },
    ];
  }
}
