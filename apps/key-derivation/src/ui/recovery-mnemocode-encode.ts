// The Encode tab of the MnemoCode panel: a BIP39 phrase into an MNC1 record in one of five
// representations, directly or shifted by dates (Seedshift).
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  encodeMnemoCode,
  type MnemoCodeEncodeResult,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { MNEMOCODE_FORMAT_HELP, MNEMOCODE_MODE_HELP } from "./recovery-mnemocode-help.js";
import {
  DatesField,
  installOptionHelp,
  selectedFormat,
  selectedMode,
} from "./recovery-mnemocode-fields.js";
import {
  appendEncodeFingerprints,
  appendMetadata,
  appendPalette,
  formatLabel,
  mncFileName,
} from "./recovery-mnemocode-results.js";
import {
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

export class MnemoCodeEncodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #format = required<HTMLSelectElement>("#mnemocode-encode-format");
  readonly #dates = new DatesField("encode");
  readonly #result = required<HTMLElement>("#mnemocode-encode-result");

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installOptionHelp(
      this.#mode,
      "#mnemocode-mode-help",
      (value) => MNEMOCODE_MODE_HELP[value as MnemoCodeMode],
    );
    installOptionHelp(
      this.#format,
      "#mnemocode-format-help",
      (value) => MNEMOCODE_FORMAT_HELP[value as MnemoCodeFormat],
    );
    this.#mode.addEventListener("change", () => this.#dates.showFor(selectedMode(this.#mode)));
    this.#dates.showFor(selectedMode(this.#mode));
    // A record shown for other inputs would be mistaken for the current one.
    for (const control of [this.#mode, this.#format]) {
      control.addEventListener("change", () => this.#clear());
    }
    for (const field of [required<HTMLTextAreaElement>("#mnemocode-source"), this.#dates.input]) {
      field.addEventListener("input", () => this.#clear());
    }
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#clear();
    });
    required<HTMLButtonElement>("#encode-mnemocode").addEventListener("click", () =>
      this.#encode(),
    );
  }

  #clear(): void {
    this.#result.replaceChildren();
    this.#result
      .closest<HTMLElement>(".backup-operation")
      ?.dispatchEvent(new CustomEvent("secret-content-reset"));
  }

  #encode(): void {
    this.#clear();
    try {
      const mode = selectedMode(this.#mode);
      const result = encodeMnemoCode(
        this.#context.readMnemonic("mnemocode", "#mnemocode-source"),
        mode,
        selectedFormat(this.#format),
        this.#dates.values(mode),
      );
      this.#show(result);
    } catch (cause) {
      this.#result.textContent =
        cause instanceof Error ? cause.message : "MnemoCode encoding failed.";
    }
  }

  #show(result: MnemoCodeEncodeResult): void {
    appendMetadata(this.#result, result.mode, result.format);
    if (!result.checksumValid) {
      const warning = document.createElement("div");
      warning.className = "warning-callout";
      warning.textContent =
        "Legacy Seedshift can produce a representation whose English form has an invalid BIP39 checksum.";
      this.#result.append(warning);
    }
    const recordActions = renderSensitiveShares(
      this.#result,
      [result.payload],
      this.#context.writeClipboard,
      [formatLabel(result.format)],
    );
    const save = document.createElement("button");
    save.type = "button";
    save.className = "secret-action compact secret-copy-action";
    save.textContent = "Save record";
    save.disabled = true;
    save.addEventListener("click", () => {
      this.#context.downloadText(
        result.record,
        mncFileName(result.mode, result.format),
        "text/plain",
      );
    });
    recordActions.append(save);
    const saveNote = document.createElement("p");
    saveNote.className = "field-note";
    saveNote.textContent =
      "The saved text record includes the mode, representation, and payload. Dates are not saved.";
    this.#result.append(saveNote);
    const seed = this.#context.mnemonicToSeed;
    appendEncodeFingerprints(
      this.#result,
      fingerprintWithoutPassphrase(result.mnemonic, seed),
      result.encodedMnemonic === undefined
        ? undefined
        : fingerprintWithoutPassphrase(result.encodedMnemonic, seed),
    );
    if (result.format === "colors" || result.format === "colors-unicode") {
      appendPalette(this.#result, result.colors);
    }
  }
}
