import { RenderedSecrets } from "./secrets.js";
import { qrText } from "@ckd/ui/qr-text.js";
// The Decode tab of the MnemoCode panel: an MNC1 record or a raw representation back into the
// BIP39 phrase. The input comes first because a record names its own mode and representation; the
// selects and the dates field follow what the record says. A SeedStitch legend line stands for the
// record of the masked phrase it holds, as in MnemoCode's decode.
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  decodeMnemoCode,
  effectiveMnemoCodeMode,
  mnemoCodeEncodedFingerprint,
  mnemoCodeRecordHeader,
  type MnemoCodeDecodeResult,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  type MnemoCodePhraseWords,
  mnemoCodeTakesDates,
} from "@ckd/recovery-backup/mnemocode.js";
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { Masking, MISSING_CODES_TEXTS } from "@ckd/recovery-backup/mnemocode-facts.js";
import {
  correctedRowWarning,
  isStitchLegendRefusal,
  readStitchLegendLine,
  type StitchLegendReading,
} from "@ckd/recovery-backup/mnemocode-stitch.js";
import {
  MNEMOCODE_AUTO_FORMAT_HELP,
  MNEMOCODE_DECODE_MODE_HELP,
  MNEMOCODE_FORMAT_HELP,
  MNEMOCODE_FINGERPRINT_NOTICE,
} from "./recovery-mnemocode-help.js";
import {
  chosenPhraseWords,
  DatesField,
  installOptionHelp,
  installModeAndFormatChoices,
  installPhraseWordCounts,
  selectedMode,
} from "./recovery-mnemocode-fields.js";
import {
  appendMetadata,
  appendRecoveredFingerprint,
  formatLabel,
  renderFoundCodes,
  renderLegacyCandidates,
  renderInvalidMnemonic,
  renderMissingCodesList,
  renderShorterPhrases,
} from "./recovery-mnemocode-results.js";
import {
  MnemoCodeMissingCodes,
  type MissingCodesFound,
} from "./recovery-mnemocode-missing-codes.js";
import {
  paragraph,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
  installFieldImports,
  RECORD_FILE_IMPORT,
  RESERVED_NOTE_LINE,
} from "./recovery-workspace-shared.js";
import { handOverShare } from "./recovery-mnemocode-share-handover.js";
import { InputRevision } from "./recovery-input-revision.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";

/** Typing pause before the codes' fingerprint is computed; a QR import counts as typing. */
const FINGERPRINT_DELAY_MS = 300;

/** The input as MnemoCode decodes it, or why a legend line in it does not read. */
type DecodeInput =
  { readonly text: string; readonly legend?: StitchLegendReading } | { readonly refused: unknown };

export class MnemoCodeDecodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-input");
  readonly #recordNote = required<HTMLElement>("#mnemocode-decode-record-note");
  readonly #codesNote = required<HTMLElement>("#mnemocode-decode-codes-note");
  readonly #mode = required<HTMLSelectElement>("#mnemocode-decode-mode");
  readonly #format = required<HTMLSelectElement>("#mnemocode-decode-format");
  /** The words of the seed phrase: codes typed from printed cards end with decoys. */
  readonly #words = required<HTMLSelectElement>("#mnemocode-decode-words");
  readonly #dates = new DatesField("decode");
  readonly #result = required<HTMLElement>("#mnemocode-decode-result");
  readonly #inputKind = required<HTMLFieldSetElement>("#mnemocode-decode-input-kind");
  /** The search of codes marked with ?, which MnemoCode's decode offers. */
  readonly #missing: MnemoCodeMissingCodes;
  /** The text a QR image gave, to tell a share from a QR code from one typed. */
  #qrText: string | undefined;
  /** Every captured Decode factor owns both asynchronous publication and its result actions. */
  readonly #inputs: InputRevision;
  #fingerprintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installModeAndFormatChoices("decode", true);
    this.#missing = new MnemoCodeMissingCodes(
      context,
      () => required<HTMLTextAreaElement>("#mnemocode-decode-dates").value,
      (found) => this.#showFound(found),
      () => {
        const current = this.#inputs.capture();
        RenderedSecrets.replace(this.#result);
        return current;
      },
    );
    this.#result.dataset.resultInteraction = "";
    this.#inputs = new InputRevision(this.#input, () => {
      RenderedSecrets.replace(this.#result);
      this.#missing.revise();
    });
    installPhraseWordCounts(this.#words);
    for (const input of [this.#mode, this.#format, this.#words, this.#dates.input])
      this.#inputs.watch(input);
    this.#inputs.watch(this.#inputKind);
    // A different interpretation needs a fresh Decode, without resetting the chosen radio.
    for (const type of ["input", "change"]) {
      this.#inputKind.addEventListener(type, () => this.#missing.hide());
    }
    this.#inputs.watch(required<HTMLElement>("#mnemocode-decode-missing"));
    this.#inputs.bindPageLifetime();
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
    installFieldImports(this.#input, (message) => RenderedSecrets.text(this.#result, message), {
      file: RECORD_FILE_IMPORT,
      qr: {
        onDecoded: (decoded) => {
          const text = qrText(decoded).trim();
          this.#qrText = text;
          // A share read from a QR code goes to Restore at once, as MnemoCode's decode sends it.
          queueMicrotask(() => {
            if (this.#input.value.trim() !== text || !this.#context.jobs.ready) return;
            try {
              if (mnemocode().shareKind(text) === "share") this.#decode();
            } catch (cause) {
              RenderedSecrets.text(
                this.#result,
                cause instanceof Error ? cause.message : "The share input could not be read.",
              );
            }
          });
          return text;
        },
      },
    });
    attachMnemoCodeWordHints(this.#input, "codes");
    for (const input of [this.#input, this.#mode, this.#format, this.#words, this.#dates.input]) {
      input.addEventListener("input", () => this.#inputChanged());
      input.addEventListener("change", () => this.#inputChanged());
    }
    this.#readHeader();
    required<HTMLButtonElement>("#decode-mnemocode").addEventListener("click", () =>
      this.#decode(),
    );
  }

  /**
   * The input as MnemoCode decodes it: a SeedStitch legend line turned into the record of the
   * masked phrase it holds, any other text as typed; read once for each use, as it takes a moment.
   */
  #backup(): DecodeInput {
    try {
      const legend = readStitchLegendLine(this.#input.value);
      return legend === undefined ? { text: this.#input.value } : { text: legend.record, legend };
    } catch (refused) {
      return { refused };
    }
  }

  /** The mode the decode will use: a record's own, otherwise the selected one. */
  #effectiveMode(backup: DecodeInput = this.#backup()): MnemoCodeMode {
    // A legend line that does not read yet still stands for a Seedshift record.
    if ("refused" in backup)
      return isStitchLegendRefusal(backup.refused) ? "seedshift" : selectedMode(this.#mode);
    return effectiveMnemoCodeMode(backup.text, selectedMode(this.#mode));
  }

  #inputChanged(): void {
    // A search of other codes, or of the same ones read otherwise, is offered anew by Decode.
    this.#missing.hide();
    // What the text is is asked again for another text.
    this.#inputKind.hidden = true;
    for (const radio of this.#kindRadios()) radio.checked = false;
    this.#readHeader();
    // The fingerprint takes a BIP39 seed computation, so it waits for a pause in typing.
    showNote(this.#codesNote, this.#keptNoteLine());
    clearTimeout(this.#fingerprintTimer);
    this.#fingerprintTimer = setTimeout(() => {
      this.#fingerprintTimer = undefined;
      this.#showCodesFingerprint();
    }, FINGERPRINT_DELAY_MS);
  }

  /** A typed text keeps the note's line; an empty field gives it up. */
  #keptNoteLine(): string {
    return this.#input.value.trim() === "" ? "" : RESERVED_NOTE_LINE;
  }

  /** Decode shows the waiting fingerprint at once, above its result, so nothing moves afterwards. */
  #flushFingerprint(): void {
    if (this.#fingerprintTimer === undefined) return;
    clearTimeout(this.#fingerprintTimer);
    this.#fingerprintTimer = undefined;
    this.#showCodesFingerprint();
  }

  /** Says what a record names, and shows the dates field only for a mode that uses dates. */
  #readHeader(): void {
    const backup = this.#backup();
    this.#dates.showFor(this.#effectiveMode(backup));
    showNote(
      this.#recordNote,
      this.#recordText(backup),
      "legend" in backup && backup.legend?.correctedRow !== undefined,
    );
  }

  #recordText(backup: DecodeInput): string {
    if (this.#input.value.trim() === "") return "";
    if ("refused" in backup) return backup.refused instanceof Error ? backup.refused.message : "";
    const legend = backup.legend;
    if (legend !== undefined)
      return (
        `SeedStitch legend · the record of a phrase masked with MnemoCode Seedshift, as ${formatLabel("indexes")}. ` +
        "The legend names its mode and representation, so the two selectors are not used; type the dates." +
        (legend.correctedRow === undefined ? "" : ` ${correctedRowWarning(legend.correctedRow)}`)
      );
    try {
      const record = mnemoCodeRecordHeader(backup.text);
      return record === undefined
        ? ""
        : `MNC1 record · mode ${record.mode} · ${formatLabel(record.format)}. The record names its mode ` +
            "and representation, so the two selectors are not used.";
    } catch (cause) {
      return cause instanceof Error ? cause.message : "";
    }
  }

  /** The word count chosen, or undefined where every code typed is read. */
  #phraseWords(): MnemoCodePhraseWords {
    return chosenPhraseWords(this.#words);
  }

  #showCodesFingerprint(): void {
    const backup = this.#backup();
    if ("refused" in backup) {
      showNote(this.#codesNote, this.#keptNoteLine());
      return;
    }
    const fingerprint = mnemoCodeEncodedFingerprint(
      backup.text,
      selectedMode(this.#mode),
      this.#format.value as MnemoCodeFormat | "auto",
      this.#phraseWords(),
    );
    showNote(
      this.#codesNote,
      fingerprint === undefined
        ? this.#keptNoteLine()
        : `${Masking.of(this.#effectiveMode(backup)).encodedFingerprintLabel}, from the codes as typed: ${fingerprint}. ` +
            `If it differs from the one noted at Encode, a code is miscopied. ${MNEMOCODE_FINGERPRINT_NOTICE}`,
    );
  }

  #kindRadios(): HTMLInputElement[] {
    return [...this.#inputKind.querySelectorAll<HTMLInputElement>("input[type=radio]")];
  }

  /**
   * Whether the whole share text goes to Restore: a definite share part routes the whole input, one
   * that may also be the codes as the person answers; true when Restore took it.
   */
  #handedOver(): boolean {
    const text = this.#input.value.trim();
    const kind = mnemocode().shareKind(text);
    if (kind === undefined) return false;
    const answer = this.#kindRadios().find((radio) => radio.checked)?.value;
    if (kind === "either" && answer === undefined) {
      this.#inputKind.hidden = false;
      this.#result.append(
        paragraph("Choose what these codes are, then press Decode again.", "field-note"),
      );
      return true;
    }
    if (kind === "either" && answer === "codes") return false;
    if (handOverShare({ text, fromQr: text === this.#qrText })) {
      this.#result.append(
        paragraph(
          "The share text went to Restore. Every part and its line boundaries were kept.",
          "field-note",
        ),
      );
      return true;
    }
    this.#result.append(
      paragraph(
        "This is a Shamir share, and this build cannot restore from shares.",
        "warning-callout",
      ),
    );
    return true;
  }

  #decode(): void {
    this.#flushFingerprint();
    const current = this.#inputs.capture();
    RenderedSecrets.replace(this.#result);
    try {
      if (this.#handedOver()) return;
      const backup = this.#backup();
      if ("refused" in backup) throw backup.refused;
      const { text, legend } = backup;
      // Codes marked with ? are searched, as MnemoCode's decode searches them.
      if (
        this.#missing.offer(
          text,
          this.#format.value as MnemoCodeFormat | "auto",
          selectedMode(this.#mode),
          this.#phraseWords(),
        )
      ) {
        this.#result.append(
          paragraph(
            "Some codes cannot be read: choose below how MnemoCode can tell them.",
            "field-note",
          ),
        );
        return;
      }
      const mode = this.#effectiveMode(backup);
      // Complete codes with forgotten date digits are a date search, which the Forgotten tab makes.
      if (mnemoCodeTakesDates(mode) && /[?|]/u.test(this.#dates.input.value))
        throw new Error(
          "Dates with ? or | are searched in Forgotten › “A digit of a date”, with these codes. Here, type every date in full.",
        );
      // A legend holds a whole phrase: every word number of its record is read.
      const result = decodeMnemoCode(text, {
        mode: selectedMode(this.#mode),
        format: this.#format.value as MnemoCodeFormat | "auto",
        dates: this.#dates.values(mode),
        words: legend === undefined ? this.#phraseWords() : undefined,
      });
      if (legend?.correctedRow !== undefined)
        this.#result.append(paragraph(correctedRowWarning(legend.correctedRow), "warning-callout"));
      this.#show(result, current);
    } catch (cause) {
      RenderedSecrets.text(
        this.#result,
        cause instanceof Error ? cause.message : "MnemoCode decoding failed.",
      );
    }
  }

  /**
   * What the search of codes marked with ? found: every candidate listed, or the one set of codes,
   * reported and then decoded as complete codes, with the dates found or those typed.
   */
  #showFound(found: MissingCodesFound): void {
    const current = this.#inputs.capture();
    RenderedSecrets.replace(this.#result);
    const copy = this.#copy(current);
    if (found.kind === "list") {
      renderMissingCodesList(this.#result, found.rows, MISSING_CODES_TEXTS.list, copy, current);
      return;
    }
    renderFoundCodes(this.#result, found, MISSING_CODES_TEXTS.correct, copy, current);
    try {
      const mode = found.mode as MnemoCodeMode;
      this.#show(
        decodeMnemoCode(found.codes, {
          mode,
          format: found.format as MnemoCodeFormat,
          dates: found.dates ?? this.#dates.values(mode),
        }),
        current,
        found.passphrase,
      );
    } catch (cause) {
      this.#result.append(
        paragraph(
          cause instanceof Error ? cause.message : "MnemoCode decoding failed.",
          "warning-callout",
        ),
      );
    }
  }

  /** Each candidate's fingerprint, by MnemoCode: up to 128 seeds. */
  #showCandidates(candidates: readonly string[], current: () => boolean): void {
    let fingerprints: string[];
    try {
      const binding = mnemocode();
      fingerprints = candidates.map((candidate) => binding.masterFingerprint(candidate, undefined));
    } catch (cause) {
      if (!current()) return;
      this.#result.append(
        paragraph(
          cause instanceof Error ? cause.message : "The fingerprints failed.",
          "warning-callout",
        ),
      );
      return;
    }
    if (!current()) return;
    renderLegacyCandidates(this.#result, candidates, fingerprints, this.#copy(current), current);
  }

  /** All result variants, including lists and invalid readings, lose their Copy action together. */
  #copy(current: () => boolean): (value: string) => Promise<void> {
    return async (value) => {
      if (current()) await this.#context.writeClipboard(value);
    };
  }

  #show(result: MnemoCodeDecodeResult, current: () => boolean, passphrase?: string): void {
    appendMetadata(this.#result, result.mode, result.format);
    const copy = this.#copy(current);
    if (result.candidates !== undefined) {
      this.#showCandidates(result.candidates, current);
      return;
    }
    if (result.mnemonic === undefined) return;
    if (!result.checksumValid) {
      renderInvalidMnemonic(this.#result, result.mnemonic, copy, current);
      renderShorterPhrases(
        this.#result,
        (result.shorter ?? []).map(({ words, mnemonic }) => ({
          words,
          fingerprint: fingerprintWithoutPassphrase(mnemonic, this.#context.mnemonicToSeed),
        })),
      );
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
      passphrase === undefined
        ? this.#context.useMnemonicInDeriver
        : (mnemonic) => this.#context.useMnemonicInDeriver(mnemonic, passphrase),
      this.#context.mnemonicToSeed,
      passphrase ?? "",
      current,
    );
  }
}

/** An empty note is hidden, so that it leaves no gap. */
function showNote(note: HTMLElement, text: string, warning = false): void {
  note.textContent = text;
  note.hidden = text === "";
  note.classList.toggle("warning", warning);
}
