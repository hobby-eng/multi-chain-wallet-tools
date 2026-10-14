// Re-encode an old backup through MnemoCode's confirmation owner, then the existing Encode tab.
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  MnemoCodeReEncoding,
  type ReEncodingInput,
  type ReEncodingWalletRequest,
} from "@ckd/recovery-backup/mnemocode-reencoding.js";
import { effectiveMnemoCodeMode, type MnemoCodeFormat } from "@ckd/recovery-backup/mnemocode.js";
import type { WalletMatch } from "../../../../packages/recovery-mnemocode/source/core/wallet-check.js";
import { EncodedForm } from "../../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { WordList } from "../../../../packages/recovery-mnemocode/source/core/word-hints.js";
import { MnemoCodeWorker } from "../workers/mnemocode-worker-client.js";
import { InputRevision } from "./recovery-input-revision.js";
import { WalletEvidenceField } from "./recovery-mnemocode-evidence.js";
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
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

const PREFIX = "mnemocode-reencode";

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
  readonly #cancel = required<HTMLButtonElement>(`#${PREFIX}-cancel`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-status`);
  readonly #evidence = new WalletEvidenceField(PREFIX);
  readonly #inputs: InputRevision;
  readonly #walletInputs: InputRevision;
  #snapshot: ReEncodingInput | undefined;
  #session: MnemoCodeReEncoding | undefined;
  #current: () => boolean = () => false;
  #worker: MnemoCodeWorker<ReEncodingWalletRequest, WalletMatch> | undefined;
  #linked = false;
  #handoffRevision = 0;
  #confirmedPassphrase = "";

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
    attachMnemoCodeWordHints(this.#input, EncodedForm.typedWords);
    attachMnemoCodeWordHints(this.#lastWord, WordList.BIP39);
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
      this.#dates.showFor(effectiveMnemoCodeMode(this.#input.value, selectedMode(this.#mode)));
    } catch {
      // Reading reports invalid mode/record input; an edit must still revoke old confirmation.
    }
  }

  #revokeLink(): void {
    if (!this.#linked) return;
    this.#linked = false;
    document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "mnemocode" }));
  }

  #clear(): void {
    this.#handoffRevision += 1;
    this.#confirmedPassphrase = "";
    this.#worker?.terminate();
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
    this.#confirmedPassphrase = "";
    this.#worker?.terminate();
    this.#session =
      this.#snapshot !== undefined && this.#current()
        ? MnemoCodeReEncoding.of(this.#snapshot)
        : undefined;
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
      const snapshot: ReEncodingInput = Object.freeze({
        input: this.#input.value,
        mode: selectedMode(this.#mode),
        format: this.#format.value as MnemoCodeFormat | "auto",
        dates: this.#dates.input.value,
        words: chosenPhraseWords(this.#words),
        ...(lastWord === "" ? {} : { lastWord }),
      });
      this.#snapshot = snapshot;
      this.#session = MnemoCodeReEncoding.of(snapshot);
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
      this.#result.append(
        paragraph(
          "A valid BIP39 checksum does not confirm the old backup. Recognise the phrase or its fingerprint, or compare it with the wallet before making the new backup.",
          "warning-callout",
        ),
      );
      this.#result.append(
        paragraph(
          "Making a new backup does not revoke the old one. The new dates and representation are chosen in Encode; its share, card and backup-check options apply to the same confirmed phrase.",
          "field-note",
        ),
      );
    } catch (cause) {
      this.#snapshot = undefined;
      this.#session = undefined;
      this.#status.textContent =
        cause instanceof Error ? cause.message : "The old backup could not be read.";
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
      await this.#context.jobs.runHeavy("Confirm the old MnemoCode backup", async () => {
        const worker = new MnemoCodeWorker<ReEncodingWalletRequest, WalletMatch>(
          __MNEMOCODE_SEARCH_WORKER_SOURCE__,
        );
        this.#worker = worker;
        this.#cancel.hidden = false;
        this.#cancel.onclick = () => worker.terminate();
        try {
          const match = await session.confirmByWallet(wallet, (request) =>
            worker.run(request, () => undefined),
          );
          if (!current() || !this.#current() || session !== this.#session) return;
          this.#status.textContent = [
            match.warning,
            match.matched
              ? "The wallet matches. Continue to choose the new backup."
              : "The wallet does not match: the phrase is not confirmed.",
            match.path,
          ]
            .filter(Boolean)
            .join(" ");
          this.#continue.disabled = !match.matched;
        } finally {
          worker.terminate();
          if (this.#worker === worker) {
            this.#worker = undefined;
            this.#cancel.hidden = true;
            this.#cancel.onclick = null;
          }
        }
      });
    } catch (cause) {
      if (current() && this.#current())
        this.#status.textContent =
          cause instanceof Error ? cause.message : "Wallet comparison failed.";
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
      this.#confirmedPassphrase = this.#evidence.passphrase;
      this.#linked = true;
      // The source owner retains only a revocable capability, never an expired session or factor.
      link(
        {
          label: "Confirmed old MnemoCode backup",
          read: () =>
            oldCurrent() && revision === this.#handoffRevision && this.#session !== undefined
              ? { mnemonic: this.#session.confirmedPhrase(), passphrase: this.#confirmedPassphrase }
              : null,
        },
        "mnemocode",
      );
    } catch (cause) {
      this.#status.textContent =
        cause instanceof Error ? cause.message : "The phrase is not confirmed.";
    }
  }
}
