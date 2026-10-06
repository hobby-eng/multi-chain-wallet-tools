// The Decode tab of the MnemoCode panel: an MNC1 record or a raw representation back into the
// BIP39 phrase. The input comes first because a record names its own mode and representation; the
// selects and the dates field follow what the record says.
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  decodeMnemoCode,
  effectiveMnemoCodeMode,
  mnemoCodeEncodedPhrase,
  parseMnemoCodeRecord,
  type MnemoCodeDecodeResult,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { installQrImageImport } from "@ckd/ui/qr-image-import.js";
import {
  MNEMOCODE_AUTO_FORMAT_HELP,
  MNEMOCODE_DECODE_MODE_HELP,
  MNEMOCODE_FORMAT_HELP,
} from "./recovery-mnemocode-help.js";
import { DatesField, installOptionHelp, selectedMode } from "./recovery-mnemocode-fields.js";
import {
  appendMetadata,
  appendRecoveredFingerprint,
  formatLabel,
  renderCandidates,
  renderInvalidMnemonic,
} from "./recovery-mnemocode-results.js";
import {
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** Typing pause before the codes' fingerprint is computed; a QR import counts as typing. */
const FINGERPRINT_DELAY_MS = 300;

export class MnemoCodeDecodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-input");
  readonly #recordNote = required<HTMLElement>("#mnemocode-decode-record-note");
  readonly #codesNote = required<HTMLElement>("#mnemocode-decode-codes-note");
  readonly #mode = required<HTMLSelectElement>("#mnemocode-decode-mode");
  readonly #format = required<HTMLSelectElement>("#mnemocode-decode-format");
  readonly #dates = new DatesField("decode");
  readonly #result = required<HTMLElement>("#mnemocode-decode-result");
  #fingerprintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installOptionHelp(
      this.#mode,
      "#mnemocode-decode-mode-help",
      (value) => MNEMOCODE_DECODE_MODE_HELP[value as MnemoCodeMode],
    );
    installOptionHelp(this.#format, "#mnemocode-decode-format-help", (value) =>
      value === "auto"
        ? MNEMOCODE_AUTO_FORMAT_HELP
        : MNEMOCODE_FORMAT_HELP[value as MnemoCodeFormat],
    );
    installQrImageImport(document, this.#input, {
      onDecoded: (decoded) => decoded.text.trim(),
      onError: (message) => {
        this.#result.textContent = message;
      },
    });
    this.#input.addEventListener("input", () => this.#inputChanged());
    this.#mode.addEventListener("change", () => this.#inputChanged());
    this.#format.addEventListener("change", () => this.#inputChanged());
    this.#readHeader();
    required<HTMLButtonElement>("#decode-mnemocode").addEventListener("click", () =>
      this.#decode(),
    );
  }

  /** The mode the decode will use: a record's own, otherwise the selected one. */
  #effectiveMode(): MnemoCodeMode {
    try {
      return effectiveMnemoCodeMode(this.#input.value, selectedMode(this.#mode));
    } catch {
      return selectedMode(this.#mode);
    }
  }

  #inputChanged(): void {
    this.#readHeader();
    // The fingerprint takes a BIP39 seed computation, so it waits for a pause in typing.
    showNote(this.#codesNote, "");
    clearTimeout(this.#fingerprintTimer);
    this.#fingerprintTimer = setTimeout(() => this.#showCodesFingerprint(), FINGERPRINT_DELAY_MS);
  }

  /** Says what a record names, and shows the dates field only for a mode that uses dates. */
  #readHeader(): void {
    this.#dates.showFor(this.#effectiveMode());
    showNote(this.#recordNote, this.#recordText());
  }

  #recordText(): string {
    if (this.#input.value.trim() === "") return "";
    try {
      const record = parseMnemoCodeRecord(this.#input.value);
      return record === undefined
        ? ""
        : `MNC1 record · mode ${record.mode} · ${formatLabel(record.format)}. The record names its mode ` +
            "and representation, so the two selectors are not used.";
    } catch (cause) {
      return cause instanceof Error ? cause.message : "";
    }
  }

  #showCodesFingerprint(): void {
    const phrase = mnemoCodeEncodedPhrase(
      this.#input.value,
      selectedMode(this.#mode),
      this.#format.value as MnemoCodeFormat | "auto",
    );
    showNote(
      this.#codesNote,
      phrase === undefined
        ? ""
        : `Encoded fingerprint of the codes as typed: ${fingerprintWithoutPassphrase(phrase, this.#context.mnemonicToSeed)}. ` +
            "If it differs from the one noted at Encode, a code is miscopied.",
    );
  }

  #decode(): void {
    this.#result.replaceChildren();
    try {
      const mode = this.#effectiveMode();
      const result = decodeMnemoCode(this.#input.value, {
        mode: selectedMode(this.#mode),
        format: this.#format.value as MnemoCodeFormat | "auto",
        dates: this.#dates.values(mode),
      });
      this.#show(result);
    } catch (cause) {
      this.#result.textContent =
        cause instanceof Error ? cause.message : "MnemoCode decoding failed.";
    }
  }

  #show(result: MnemoCodeDecodeResult): void {
    appendMetadata(this.#result, result.mode, result.format);
    const copy = this.#context.writeClipboard;
    if (result.candidates !== undefined) {
      renderCandidates(this.#result, result.candidates, copy);
      return;
    }
    if (result.mnemonic === undefined) return;
    if (!result.checksumValid) {
      renderInvalidMnemonic(this.#result, result.mnemonic, copy);
      return;
    }
    if (result.mode === "seedshift") {
      const warning = document.createElement("div");
      warning.className = "warning-callout";
      warning.textContent =
        "Not verified: any dates give a valid phrase, so wrong dates are not detected. Compare the " +
        "fingerprint below with your wallet, or a known address after Use in Generate & Derive; the " +
        "fingerprint is for the phrase without a BIP39 passphrase.";
      this.#result.append(warning);
    }
    appendRecoveredFingerprint(
      this.#result,
      fingerprintWithoutPassphrase(result.mnemonic, this.#context.mnemonicToSeed),
    );
    renderRecoveredMnemonic(
      this.#result,
      result.mnemonic,
      copy,
      this.#context.useMnemonicInDeriver,
      this.#context.mnemonicToSeed,
    );
  }
}

/** An empty note is hidden, so that it leaves no gap. */
function showNote(note: HTMLElement, text: string): void {
  note.textContent = text;
  note.hidden = text === "";
}
