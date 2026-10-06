// The forgotten-word search of the MnemoCode panel: every checksum-valid replacement for one word
// marked with ?, or for the final word of an old Legacy Seedshift phrase.
import {
  recoverMnemoCodeLegacyLastWords,
  recoverMnemoCodeWord,
} from "@ckd/recovery-backup/mnemocode.js";
import { MNEMOCODE_WORD_HELP } from "./recovery-mnemocode-help.js";
import { installOptionHelp } from "./recovery-mnemocode-fields.js";
import { renderMissingWordCandidates } from "./recovery-mnemocode-results.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

export class MnemoCodeWordSearch {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-missing-word-input");
  readonly #legacyLastWord = required<HTMLInputElement>("#mnemocode-legacy-last-word");
  readonly #result = required<HTMLElement>("#mnemocode-missing-word-result");

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installOptionHelp(this.#legacyLastWord, "#mnemocode-word-help", (_, checked) =>
      checked ? MNEMOCODE_WORD_HELP.legacy : MNEMOCODE_WORD_HELP.missing,
    );
    this.#input.addEventListener("input", () => this.#result.replaceChildren());
    this.#legacyLastWord.addEventListener("change", () => this.#result.replaceChildren());
    required<HTMLButtonElement>("#recover-mnemocode-word").addEventListener("click", () =>
      this.#search(),
    );
  }

  #search(): void {
    this.#result.replaceChildren();
    const legacy = this.#legacyLastWord.checked;
    try {
      const candidates = legacy
        ? recoverMnemoCodeLegacyLastWords(this.#input.value)
        : recoverMnemoCodeWord(this.#input.value);
      renderMissingWordCandidates(this.#result, candidates, this.#context.writeClipboard, legacy);
    } catch (cause) {
      this.#result.textContent =
        cause instanceof Error ? cause.message : "Forgotten-word recovery failed.";
    }
  }
}
