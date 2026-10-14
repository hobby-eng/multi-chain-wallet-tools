// The Encode tab of the MnemoCode panel: a BIP39 phrase into an MNC1 record in one of five
// representations, directly or shifted by dates (Seedshift).
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  encodeMnemoCode,
  type MnemoCodeEncodeResult,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { EncodedBackupCheck } from "../../../../packages/recovery-mnemocode/source/core/backup-check.js";
import {
  ALWAYS_MASKED_NOTE,
  UNMASKED_NOTE,
  alwaysMasked,
} from "../../../../packages/recovery-mnemocode/source/core/backup-options.js";
import { EncodedForm } from "../../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { EncodedBackup } from "../../../../packages/recovery-mnemocode/source/core/encoded-backup.js";
import { Masking } from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import { BackupCheckSection } from "./recovery-mnemocode-backup-check.js";
import { MNEMOCODE_FORMAT_HELP, MNEMOCODE_MODE_HELP } from "./recovery-mnemocode-help.js";
import {
  DatesField,
  installOptionHelp,
  installModeAndFormatChoices,
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
  installFieldImports,
  PHRASE_FILE_IMPORT,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

export class MnemoCodeEncodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #format = required<HTMLSelectElement>("#mnemocode-encode-format");
  readonly #dates = new DatesField("encode");
  readonly #result = required<HTMLElement>("#mnemocode-encode-result");
  readonly #backupCheck = new BackupCheckSection("mnemocode-encode", EncodedForm.typedWords);
  readonly #maskNote = required<HTMLElement>("#mnemocode-encode-mask-note");

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installModeAndFormatChoices("encode");
    installFieldImports(
      required<HTMLTextAreaElement>("#mnemocode-source"),
      (message) => {
        this.#result.textContent = message;
      },
      { file: PHRASE_FILE_IMPORT, qr: {} },
    );
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
    for (const control of [this.#mode, this.#format])
      control.addEventListener("change", () => this.#showMasking());
    this.#showMasking();
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

  /**
   * MnemoCode's menu always masks English words and word numbers, which unmasked show the phrase
   * itself; a copy of the other forms without Seedshift is only disguised. Direct stays offered
   * here, for plain copies and standard shares, with the line that says what it is worth.
   */
  #showMasking(): void {
    const direct = selectedMode(this.#mode) === "direct";
    const shown = selectedFormat(this.#format);
    const exposed = direct && alwaysMasked(shown);
    this.#maskNote.hidden = !direct;
    this.#maskNote.className = exposed ? "warning-callout" : "field-note";
    this.#maskNote.textContent = exposed
      ? `${ALWAYS_MASKED_NOTE} MnemoCode itself offers it only with Seedshift.`
      : `Direct: ${UNMASKED_NOTE}.`;
  }

  #clear(): void {
    this.#backupCheck.offer(undefined);
    this.#result.replaceChildren();
    this.#result
      .closest<HTMLElement>(".backup-operation")
      ?.dispatchEvent(new CustomEvent("secret-content-reset"));
  }

  #encode(): void {
    this.#clear();
    try {
      const mode = selectedMode(this.#mode);
      const dates = this.#dates.values(mode);
      const result = encodeMnemoCode(
        this.#context.readMnemonic("mnemocode", "#mnemocode-source"),
        mode,
        selectedFormat(this.#format),
        dates,
      );
      this.#show(result);
      this.#showLegacyWord(result);
      // The Original Seedshift with a valid last word replaced that word: only a search finds it.
      this.#backupCheck.offer(
        EncodedBackupCheck.supports(result.mode)
          ? new EncodedBackupCheck({
              mnemonic: result.mnemonic,
              format: result.format,
              mode: result.mode,
              codes: result.indexes,
              dates,
            })
          : undefined,
      );
    } catch (cause) {
      this.#result.textContent =
        cause instanceof Error ? cause.message : "MnemoCode encoding failed.";
    }
  }

  /**
   * The Original Seedshift's last word, as MnemoCode's encode report tells it: whether the shifted
   * phrase already passes the BIP39 checksum, the optional checksum-valid last word with the phrase
   * it gives (concealed, as the record is), or that a record of the checksum-valid mode replaced it.
   */
  #showLegacyWord(result: MnemoCodeEncodeResult): void {
    const note = (text: string): void => {
      const line = document.createElement("p");
      line.className = "field-note";
      line.textContent = text;
      this.#result.append(line);
    };
    if (result.mode === "seedshift-legacy-valid") {
      note(
        "The shifted last word was replaced with a checksum-valid word. The shifted word is not stored; decoding lists the candidates.",
      );
      return;
    }
    const valid = result.validLastWord;
    if (valid === undefined) return;
    if (!valid.changed) {
      note(
        "The shifted phrase already has a valid BIP39 checksum; no final-word replacement is needed.",
      );
      return;
    }
    renderSensitiveShares(
      this.#result,
      [`Final word: ${valid.phrase.split(" ").at(-1)} · phrase: ${valid.phrase}`],
      this.#context.writeClipboard,
      ["Optional checksum-valid last word"],
      [],
      () => this.#context.jobs.ready,
    );
    note(
      'That word replaces the shifted last word; the mode "Legacy Seedshift · checksum-valid final word" records it.',
    );
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
      [`${formatLabel(result.format)} of ${Masking.of(result.mode).holds}`],
      [EncodedForm.of(result.format).apartCodes(result.payload)],
      () => this.#context.jobs.ready,
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
    const json = document.createElement("button");
    json.type = "button";
    json.className = "secret-action compact secret-copy-action";
    json.textContent = "Save JSON with dates and shifts";
    json.disabled = true;
    json.addEventListener("click", () => {
      this.#context.downloadText(result.json, "mnemocode-representation.json", "application/json");
    });
    recordActions.append(json);
    const saveNote = document.createElement("p");
    saveNote.className = "field-note";
    saveNote.textContent =
      "The saved text record includes the mode, representation, and payload. Dates are not saved. The separate JSON export includes every representation, dates and shifts: keep it private.";
    this.#result.append(saveNote);
    const seed = this.#context.mnemonicToSeed;
    // The encoded fingerprint is MnemoCode's: the codes read as a phrase, when they are a valid one.
    appendEncodeFingerprints(
      this.#result,
      result.mode,
      fingerprintWithoutPassphrase(result.mnemonic, seed),
      EncodedBackup.of(result.indexes, result.format, result.mode).fingerprint((codes) =>
        fingerprintWithoutPassphrase(codes, seed),
      ),
    );
    // The palette of a backup written in colors (EncodedForm writtenInColors).
    if (EncodedForm.of(result.format).writtenInColors) appendPalette(this.#result, result.colors);
  }
}
