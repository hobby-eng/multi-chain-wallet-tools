import { KIBIBYTE } from "@ckd/core/byte-units.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

// Preserve the browser adapter's existing UTF-16 bound; this is not an encoded file-byte limit.
const MAX_INPUT_LENGTH = 64 * KIBIBYTE;
const ERRORS = new ErrorCatalog("wallet.mnemocode-input", {
  "too-large": (field: string) =>
    `${field} exceeds the ${MAX_INPUT_LENGTH} UTF-16 code-unit safety limit.`,
  empty: () => "Enter a MnemoCode payload or MNC1 record.",
});

/** Browser text admission shared by direct reads and retained re-encoding drafts. */
export class MnemoCodeInputAdmission {
  /** Refuse oversized raw text before trimming, encoding or storing a copy. */
  static assertSize(
    value: string,
    field: "MnemoCode input" | "Mnemonic input" | "Date input" | "Last word input",
  ): void {
    if (value.length > MAX_INPUT_LENGTH) throw ERRORS.create("too-large", [field]);
  }

  /** Admit a nonempty backup while retaining the original text for the upstream reader. */
  static backup(value: string): void {
    this.assertSize(value, "MnemoCode input");
    if (value.trim().length === 0) throw ERRORS.create("empty", []);
  }
}
