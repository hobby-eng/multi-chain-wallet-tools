// The Encode tab of the MHFE panel: a BIP39 phrase into a 24-word container, or on the user's
// choice into one as long as a 12- to 21-word phrase, with optional repair words for the container
// phrase.
// It asks nothing about a BIP39 passphrase, as the command-line tool asks nothing: in a tool that
// encrypts a phrase such a question looks suspicious, and without an answer the package's list of
// what to keep names any passphrase of the wallet (mhfe docs/BROWSER-PACKAGE.md).
import { NewContainerResult } from "./recovery-mhfe-cards.js";
import { MhfeInputText } from "@ckd/recovery-backup/mhfe-input-text.js";
import { EncryptCommandView, EncryptSettings } from "./recovery-mhfe-command.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { PasswordField, PasswordReview, StrengthNote, reviewSaid } from "./recovery-mhfe-fields.js";
import {
  ENCRYPT_STAGES,
  REHEARSE,
  clearOnFirstProgress,
  listed,
  readBackDiffers,
  StageProgress,
} from "./recovery-mhfe-status.js";
import { NewPasswordChoice, type NewPasswordDisclosure } from "./recovery-mhfe-new-password.js";
import { MhfeTask, type MhfeTaskOutcome } from "./recovery-mhfe-task.js";
import {
  renderReadBackWords,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The warning under a new password that the package calls weak. */
export function weakPasswordText(bits: number): string {
  return `This password is weak: about ${Math.round(bits)} bits, by a rough estimate. The Password tab makes a strong one.`;
}

export class MhfeEncodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-encrypt-status");
  readonly #readBack = required<HTMLElement>("#mhfe-encrypt-read");
  readonly #password = new PasswordField("mhfe-encrypt-password", "MHFE password");
  readonly #repeat = new PasswordField("mhfe-encrypt-password-confirm", "password confirmation");
  readonly #review: PasswordReview;
  readonly #newPassword: NewPasswordChoice;
  readonly #settings: EncryptSettings;
  readonly #result: NewContainerResult;
  readonly #task: MhfeTask;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    this.#review = new PasswordReview(engine, "mhfe-encrypt-password-review", [
      this.#password,
      this.#repeat,
    ]);
    new StrengthNote(engine, this.#password.input, "mhfe-encrypt-strength", weakPasswordText);
    this.#newPassword = new NewPasswordChoice(
      engine,
      "encrypt",
      { password: this.#password, repeat: this.#repeat },
      this.#status,
      context.jobs,
      // Read only once the person chooses a kind, after the settings below exist.
      () => this.#settings.runsHere(),
    );
    this.#settings = new EncryptSettings(this.#newPassword);
    new EncryptCommandView(context, engine, this.#settings);
    this.#result = new NewContainerResult(
      required<HTMLElement>("#mhfe-encrypt-result"),
      engine,
      context,
    );
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-encrypt-stop"),
      name: "MHFE encryption",
      failure: "MHFE encryption failed.",
      inputs: required<HTMLElement>("#mhfe-create-panel"),
      source: "mhfe",
      onEdit: () => {
        this.#readBack.replaceChildren();
        this.#result.reset();
      },
    });
    required<HTMLButtonElement>("#mhfe-encrypt").addEventListener("click", () => this.#start());
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#readBack.replaceChildren();
    this.#result.reset();
    const disclosure = this.#newPassword.captureDisclosure();
    void this.#task.run((run) => this.#encrypt(run, disclosure), {
      failed: (cause) => this.#result.failed(cause),
    });
  }

  async #encrypt(run: MhfeRun, disclosure: NewPasswordDisclosure): Promise<MhfeTaskOutcome> {
    const client = await run.step(() => this.#engine.client());
    const parameters = await run.step(() => this.#engine.coreParameters());
    // Refused before the phrase is read: a level the browser cannot run, or a PIM out of range.
    const settings = this.#settings.forBrowser(parameters);
    using phrase = new MhfeInputText(this.#context.readMnemonic("mhfe", "#mhfe-source"));
    const typed = this.#newPassword.passwords(disclosure);
    const facts = await run.step(() => phrase.use((text) => client.readPhrase(text)));
    if (phrase.use((text) => readBackDiffers(text, facts.phrase)))
      renderReadBackWords(
        this.#readBack,
        facts.phrase,
        "MHFE read your phrase as these words, written out in full. Check them against your backup.",
        this.#context.writeClipboard,
      );
    const choice = await this.#review.choose(run, typed.password, typed.repeat);
    if ("wait" in choice) return choice;
    const { sameLength } = settings;
    // About one phrase in four billion also passes the check of another length; automatic detection
    // would then not give it back on its own. The package says so for each container it offers:
    // never for a same-length one, which keeps the phrase's own length.
    const container = facts.containers.find((offered) => offered.sameLength === sameLength);
    const otherLengths = container?.otherLengths ?? [];
    const lengthNote =
      otherLengths.length === 0
        ? ""
        : ` Write down that your phrase has ${facts.words} words and select that length when you recover: ` +
          `by chance it also passes the check of ${listed(otherLengths)} words.`;
    const progress = new StageProgress(ENCRYPT_STAGES, parameters.rounds);
    this.#review.assertCurrent(choice);
    const outcome = reviewSaid(choice);
    this.#status.textContent = `Starting · ${facts.words}-word phrase accepted.${outcome}${lengthNote}`;
    const clearPasswords = clearOnFirstProgress(...this.#newPassword.inputs());
    const sealed = await run.step(() =>
      phrase.use((text) =>
        client.encrypt({
          phrase: text,
          password: typed.password,
          passwordRepeat: typed.repeat,
          passwordRepair: choice.repair,
          pim: settings.pim,
          memoryLevel: settings.memoryLevel,
          sameLength,
          repairWordCount: settings.repairWords,
          onProgress: (report) =>
            run.publish(() => {
              clearPasswords();
              this.#status.textContent = progress.line(report) + lengthNote;
            }),
          onUnverified: (result) => run.publish(() => this.#result.unverified(result)),
        }),
      ),
    );
    await this.#result.seal(
      sealed,
      {
        verified: "Verified: the container turns back into your original seed phrase.",
        next: REHEARSE,
        ...(typed.made === undefined ? {} : { password: typed.made }),
      },
      run,
    );
    this.#newPassword.forget();
    this.#status.textContent = `Encryption complete in ${progress.elapsed()}.${lengthNote}`;
    this.#status.classList.toggle("warning", lengthNote !== "");
  }
}
