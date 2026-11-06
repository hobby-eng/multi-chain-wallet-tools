// Re-encode an old backup through MnemoCode's confirmation owner, then the existing Encode tab. A
// SeedStitch legend line stands for the record of the masked phrase it holds, as in Decode.
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  MnemoCodeReEncoding,
  MnemoCodeReEncodingDraft,
  MnemoCodeReEncodingError,
  RE_ENCODING_WORDS,
  type ReEncodingInput,
} from "@ckd/recovery-backup/mnemocode-reencoding.js";
import { effectiveMnemoCodeMode, type MnemoCodeFormat } from "@ckd/recovery-backup/mnemocode.js";
import {
  correctedRowWarning,
  isStitchLegendRefusal,
  readStitchLegendLine,
} from "@ckd/recovery-backup/mnemocode-stitch.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { InputRevision } from "./recovery-input-revision.js";
import { WalletEvidenceField } from "./recovery-mnemocode-evidence.js";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import {
  DatesField,
  chosenPhraseWords,
  installModeAndFormatChoices,
  installOptionHelp,
  installPhraseWordCounts,
  selectedMode,
} from "./recovery-mnemocode-fields.js";
import {
  MNEMOCODE_AUTO_FORMAT_HELP,
  MNEMOCODE_DECODE_MODE_HELP,
  MNEMOCODE_FORMAT_HELP,
} from "./recovery-mnemocode-help.js";
import { appendRecoveredFingerprint } from "./recovery-mnemocode-results.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";
import {
  installFieldImports,
  installSecretToggle,
  paragraph,
  renderRecoveredSecret,
  required,
  RECORD_FILE_IMPORT,
  PHRASE_FILE_IMPORT,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

const PREFIX = "mnemocode-reencode";

function reencodingErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof MnemoCodeReEncodingError)
    return "Read the old backup again before confirming its phrase.";
  return cause instanceof Error ? cause.message : fallback;
}

export class MnemoCodeReEncodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>(`#${PREFIX}-input`);
  readonly #mode = required<HTMLSelectElement>(`#${PREFIX}-mode`);
  readonly #format = required<HTMLSelectElement>(`#${PREFIX}-format`);
  readonly #words = required<HTMLSelectElement>(`#${PREFIX}-words`);
  readonly #lastWord = required<HTMLInputElement>(`#${PREFIX}-last-word`);
  readonly #dates = new DatesField("reencode");
  readonly #result = required<HTMLElement>(`#${PREFIX}-result`);
  readonly #confirm = required<HTMLElement>(`#${PREFIX}-confirmation`);
  readonly #person = required<HTMLInputElement>(`#${PREFIX}-person`);
  readonly #continue = required<HTMLButtonElement>(`#${PREFIX}-continue`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-status`);
  readonly #evidence = new WalletEvidenceField(PREFIX);
  readonly #inputs: InputRevision;
  readonly #walletInputs: InputRevision;
  #snapshot: MnemoCodeReEncodingDraft | undefined;
  #session: MnemoCodeReEncoding | undefined;
  #current: () => boolean = () => false;
  #linked = false;
  #handoffRevision = 0;
  #confirmedPassphrase: SecretValue<string> | undefined;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installModeAndFormatChoices("reencode", true);
    installPhraseWordCounts(this.#words);
    this.#evidence.optional = false;
    this.#inputs = new InputRevision(required(`#${PREFIX}-inputs`), () => this.#clear());
    this.#walletInputs = new InputRevision(required(`#${PREFIX}-wallet-inputs`), () =>
      this.#resetConfirmation(),
    );
    this.#inputs.bindPageLifetime();
    context.jobs.onChange((change) => {
      if (change === "ready" && !context.jobs.ready) this.#inputs.revise();
    });
    installSecretToggle(
      `#toggle-${PREFIX}-input`,
      `#${PREFIX}-input`,
      "Show",
      "Hide",
      "old backup",
    );
    installSecretToggle(
      `#toggle-${PREFIX}-last-word`,
      `#${PREFIX}-last-word`,
      "Show",
      "Hide",
      "original last word",
    );
    attachMnemoCodeWordHints(this.#input, "codes");
    attachMnemoCodeWordHints(this.#lastWord, "phrase");
    installTextFileImport(document, this.#lastWord, {
      accept: PHRASE_FILE_IMPORT.accept,
      preserveWhitespace: false,
    });
    installFieldImports(
      this.#input,
      (text) => {
        this.#status.textContent = text;
      },
      { file: RECORD_FILE_IMPORT, qr: {} },
    );
    installOptionHelp(
      this.#mode,
      `#${PREFIX}-mode-help`,
      (value) => MNEMOCODE_DECODE_MODE_HELP[value as ReEncodingInput["mode"]],
    );
    installOptionHelp(this.#format, `#${PREFIX}-format-help`, (value) =>
      value === "auto"
        ? MNEMOCODE_AUTO_FORMAT_HELP
        : MNEMOCODE_FORMAT_HELP[value as MnemoCodeFormat],
    );
    for (const control of [this.#input, this.#mode]) {
      for (const event of ["input", "change"])
        control.addEventListener(event, () => this.#showDates());
    }
    required<HTMLButtonElement>(`#${PREFIX}-read`).addEventListener("click", () => this.#read());
    required<HTMLButtonElement>(`#${PREFIX}-wallet-check`).addEventListener(
      "click",
      () => void this.#checkWallet(),
    );
    this.#person.addEventListener("change", () => {
      const checked = this.#person.checked;
      this.#walletInputs.revise();
      this.#person.checked = checked;
      this.#continue.disabled =
        this.#session === undefined ||
        (!this.#person.checked && this.#session.confirmation === undefined);
    });
    this.#continue.addEventListener("click", () => this.#use());
    this.#showDates();
    this.#clear();
  }

  #showDates(): void {
    try {
      const input = readStitchLegendLine(this.#input.value)?.record ?? this.#input.value;
      this.#dates.showFor(effectiveMnemoCodeMode(input, selectedMode(this.#mode)));
    } catch (cause) {
      // A legend line that does not read yet still stands for a Seedshift record. Reading reports
      // other invalid input; an edit must still revoke old confirmation.
      if (isStitchLegendRefusal(cause)) this.#dates.showFor("seedshift");
    }
  }

  #revokeLink(): void {
    if (!this.#linked) return;
    this.#linked = false;
    document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "mnemocode" }));
  }

  #clear(): void {
    this.#handoffRevision += 1;
    this.#confirmedPassphrase?.wipe();
    this.#confirmedPassphrase = undefined;
    this.#snapshot?.wipe();
    this.#session?.wipe();
    this.#snapshot = undefined;
    this.#session = undefined;
    this.#revokeLink();
    this.#result.replaceChildren();
    this.#confirm.hidden = true;
    this.#person.checked = false;
    this.#continue.disabled = true;
    this.#status.textContent = "";
  }

  #resetConfirmation(): void {
    this.#handoffRevision += 1;
    this.#confirmedPassphrase?.wipe();
    this.#confirmedPassphrase = undefined;
    this.#session?.wipe();
    this.#session =
      this.#snapshot !== undefined && this.#current() ? this.#snapshot.open() : undefined;
    this.#revokeLink();
    this.#person.checked = false;
    this.#continue.disabled = true;
    this.#status.textContent = "";
  }

  #read(): void {
    if (!this.#context.jobs.ready) return;
    this.#clear();
    this.#current = this.#inputs.capture();
    try {
      const lastWord = this.#lastWord.value.trim();
      // A legend holds a whole phrase: every word number of its record is read.
      const legend = readStitchLegendLine(this.#input.value);
      const snapshot: ReEncodingInput = Object.freeze({
        input: legend?.record ?? this.#input.value,
        mode: selectedMode(this.#mode),
        format: this.#format.value as MnemoCodeFormat | "auto",
        dates: this.#dates.input.value,
        words: legend === undefined ? chosenPhraseWords(this.#words) : undefined,
        ...(lastWord === "" ? {} : { lastWord }),
      });
      this.#snapshot = new MnemoCodeReEncodingDraft(snapshot);
      this.#session = this.#snapshot.open();
      this.#confirm.hidden = false;
      const phrase = this.#session.phrase;
      renderRecoveredSecret(
        this.#result,
        phrase,
        { reveal: "Show old phrase", hide: "Hide old phrase", copy: "Copy old phrase" },
        undefined,
        undefined,
        undefined,
        undefined,
        this.#current,
      );
      appendRecoveredFingerprint(
        this.#result,
        fingerprintWithoutPassphrase(phrase, this.#context.mnemonicToSeed),
      );
      if (legend?.correctedRow !== undefined)
        this.#result.append(paragraph(correctedRowWarning(legend.correctedRow), "warning-callout"));
      this.#result.append(
        paragraph(
          "A valid BIP39 checksum does not confirm the old backup. Recognise the phrase or its fingerprint, or compare it with the wallet before making the new backup.",
          "warning-callout",
        ),
      );
      this.#result.append(
        paragraph(
          `${RE_ENCODING_WORDS.oldBackupStillOpens} The new dates and representation are chosen in Encode; its share, card and backup-check options apply to the same confirmed phrase.`,
          "field-note",
        ),
      );
    } catch (cause) {
      this.#snapshot?.wipe();
      this.#session?.wipe();
      this.#snapshot = undefined;
      this.#session = undefined;
      this.#status.textContent = reencodingErrorText(cause, "The old backup could not be read.");
    }
  }

  async #checkWallet(): Promise<void> {
    if (!this.#context.jobs.ready) return;
    this.#resetConfirmation();
    const session = this.#session;
    if (session === undefined) return;
    const current = this.#walletInputs.capture();
    try {
      const wallet = this.#evidence.request();
      if (wallet === undefined) throw new Error("Choose the wallet to compare with.");
      // One phrase compared with the wallet: MnemoCode does it at once, here.
      await this.#context.jobs.runHeavy("Confirm the old MnemoCode backup", () => {
        const match = session.confirmByWallet(wallet);
        if (!current() || !this.#current() || session !== this.#session) return Promise.resolve();
        this.#status.textContent = [
          match.warning,
          match.matched ? session.confirmationLine(wallet) : RE_ENCODING_WORDS.notMatched,
        ]
          .filter(Boolean)
          .join(" ");
        this.#continue.disabled = !match.matched;
        return Promise.resolve();
      });
    } catch (cause) {
      if (current() && this.#current() && session === this.#session)
        this.#status.textContent = reencodingErrorText(cause, "Wallet comparison failed.");
    }
  }

  #use(): void {
    if (!this.#context.jobs.ready) return;
    const session = this.#session;
    if (session === undefined || !this.#current()) return;
    try {
      if (this.#person.checked) session.confirmByPerson();
      session.confirmedPhrase();
      const link = this.#context.useRecoverySource;
      if (link === undefined) throw new Error("The shared backup source owner is unavailable.");
      const oldCurrent = this.#current;
      const revision = this.#handoffRevision;
      this.#confirmedPassphrase?.wipe();
      this.#confirmedPassphrase = SecretValue.text(this.#evidence.passphrase);
      this.#linked = true;
      // The source owner retains only a revocable capability, never an expired session or factor.
      link(
        {
          label: "Confirmed old MnemoCode backup",
          read: () =>
            oldCurrent() &&
            revision === this.#handoffRevision &&
            this.#session !== undefined &&
            this.#confirmedPassphrase !== undefined
              ? {
                  mnemonic: this.#session.confirmedPhrase(),
                  passphrase: this.#confirmedPassphrase.value,
                }
              : null,
        },
        "mnemocode",
      );
    } catch (cause) {
      this.#status.textContent = reencodingErrorText(cause, "The phrase is not confirmed.");
    }
  }
}
