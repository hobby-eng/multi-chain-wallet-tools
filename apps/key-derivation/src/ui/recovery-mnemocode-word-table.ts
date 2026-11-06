import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
// The Word table tab of the MnemoCode panel, as MnemoCode's menu offers "Look up a seed word, its
// number or its Unicode code": one row found from a word, a word number or a Unicode code, or the
// whole table saved as a file. Public data only; the rows are MnemoCode's.
import {
  UNICODE_CODE_HINT,
  WordTable,
  MnemoCodeWordTableExports,
  type WordTableLookup,
} from "@ckd/recovery-backup/mnemocode-word-table.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** How each look-up is typed, shown as the field's example. */
const PLACEHOLDERS: Readonly<Record<WordTableLookup, string>> = {
  word: "abandon",
  index: "1 to 2048",
  unicode: UNICODE_CODE_HINT,
};

export class MnemoCodeWordTableTab {
  readonly #value = required<HTMLInputElement>("#mnemocode-table-value");
  readonly #result = required<HTMLElement>("#mnemocode-table-result");
  readonly #exportFormat = required<HTMLSelectElement>("#mnemocode-table-export-format");
  readonly #exportStatus = required<HTMLElement>("#mnemocode-table-export-status");

  constructor(context: RecoveryFeatureContext) {
    for (const radio of this.#radios())
      radio.addEventListener("change", () => {
        this.#value.placeholder = PLACEHOLDERS[this.#lookup()];
        this.#result.replaceChildren();
      });
    this.#value.placeholder = PLACEHOLDERS[this.#lookup()];
    // A word looked up gets the hints of the BIP39 list; a number or a code gets none.
    attachMnemoCodeWordHints(this.#value, () => (this.#lookup() === "word" ? "phrase" : undefined));
    this.#value.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.#lookUp();
    });
    required<HTMLButtonElement>("#mnemocode-table-look-up").addEventListener("click", () =>
      this.#lookUp(),
    );
    for (const choice of MnemoCodeWordTableExports.CHOICES) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      this.#exportFormat.append(option);
    }
    this.#exportFormat.value = "legacy";
    for (const [selector, makeExport] of [
      ["#mnemocode-table-save", () => MnemoCodeWordTableExports.table(this.#exportFormat.value)],
      ["#mnemocode-table-guide", () => MnemoCodeWordTableExports.recoveryGuide()],
    ] as const) {
      required<HTMLButtonElement>(selector).addEventListener("click", () => {
        this.#exportStatus.textContent = "";
        try {
          const { text, fileName, mimeType } = makeExport();
          MnemoCodeDownload.text(context, text, fileName, mimeType);
        } catch (cause) {
          this.#exportStatus.textContent =
            cause instanceof Error ? cause.message : "The public reference could not be exported.";
        }
      });
    }
    required<HTMLButtonElement>("#mnemocode-table-full-set").addEventListener("click", () => {
      this.#exportStatus.textContent = "";
      try {
        const bytes = MnemoCodeWordTableExports.fullSet();
        try {
          MnemoCodeDownload.bytes(bytes, "application/zip", "mnemocode-recovery-reference-set.zip");
        } finally {
          bytes.fill(0);
        }
      } catch (cause) {
        this.#exportStatus.textContent =
          cause instanceof Error
            ? cause.message
            : "The recovery reference set could not be exported.";
      }
    });
  }

  #radios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[name="mnemocode-table-lookup"]')];
  }

  #lookup(): WordTableLookup {
    return (this.#radios().find((radio) => radio.checked)?.value ?? "word") as WordTableLookup;
  }

  #lookUp(): void {
    this.#result.replaceChildren();
    try {
      const row = WordTable.lookup(this.#lookup(), this.#value.value);
      const list = document.createElement("dl");
      list.className = "mnemocode-table-row";
      const character = String.fromCodePoint(Number.parseInt(row.unicodeHex, 16));
      for (const [label, value] of [
        ["Word number", String(row.index)],
        ["English word", row.english],
        ["Unicode code", `${row.unicodeHex} · ${character}`],
      ] as const) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        list.append(term, detail);
      }
      this.#result.append(list);
    } catch (cause) {
      const warning = document.createElement("p");
      warning.className = "warning-callout";
      warning.textContent = cause instanceof Error ? cause.message : String(cause);
      this.#result.append(warning);
    }
  }
}
