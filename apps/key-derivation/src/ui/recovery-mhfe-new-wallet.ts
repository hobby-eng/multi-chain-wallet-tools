// The New wallet tab of the MHFE panel: draws a new 24-word phrase from the browser's random
// generator, with the phrase + passphrase check and a chosen word if the user chooses them, shows it
// for the wallet and encrypts it at once into a 24-word container.
import type { MhfeNewPhrase } from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import { ChosenWordFields } from "./chosen-word-fields.js";
import { NewContainerResult, renderPhrase } from "./recovery-mhfe-cards.js";
import { MhfeDrawOutlook, NO_WISHES, type MhfeWishes } from "./recovery-mhfe-draw-outlook.js";
import { mhfeWordHints } from "./recovery-mhfe-word-hints.js";
import { WordHintField } from "./word-hint-field.js";
import { weakPasswordText } from "./recovery-mhfe-encode.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import {
  PasswordField,
  PasswordReview,
  PimField,
  StrengthNote,
  selectedRepairCount,
  reviewSaid,
  type ReviewChoice,
} from "./recovery-mhfe-fields.js";
import {
  ENCRYPT_STAGES,
  MHFE_PHRASE_WORDS,
  REHEARSE,
  clearOnFirstProgress,
  progressCallback,
  drawLine,
  drawStartLine,
} from "./recovery-mhfe-status.js";
import { NewPasswordChoice } from "./recovery-mhfe-new-password.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
import { JobClock, formatDuration } from "./recovery-progress.js";
import { paragraph, required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

export class MhfeNewWalletTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-new-status");
  readonly #phraseResult = required<HTMLElement>("#mhfe-new-phrase");
  readonly #passphrase = new PasswordField("mhfe-new-passphrase", "BIP39 passphrase");
  readonly #passphraseRepeat = new PasswordField(
    "mhfe-new-passphrase-confirm",
    "passphrase repetition",
  );
  readonly #password = new PasswordField("mhfe-new-password", "container password");
  readonly #passwordRepeat = new PasswordField(
    "mhfe-new-password-confirm",
    "container password repetition",
  );
  readonly #pim = new PimField("new");
  readonly #review: PasswordReview;
  readonly #newPassword: NewPasswordChoice;
  readonly #passphraseStrength: StrengthNote;
  readonly #result: NewContainerResult;
  /** Drawing a phrase and encrypting it: Cancel stops whichever runs. */
  readonly #generation: MhfeTask;
  readonly #encryption: MhfeTask;
  /** What the wishes keep of the phrase's randomness, as MHFE rates them. */
  readonly #outlook: MhfeDrawOutlook;
  /** The chosen word and the words never to use, built once MHFE's values are known. */
  #wishFields: ChosenWordFields | undefined;
  /** The phrase drawn last, until it is encrypted: a failed encryption can be run again here. */
  #drawn: { phrase: MhfeNewPhrase; hasPassphrase: boolean } | undefined;
  #retrySubscription: (() => void) | undefined;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#phraseResult.dataset.resultInteraction = "";
    this.#engine = engine;
    this.#review = new PasswordReview(engine, "mhfe-new-password-review", [
      this.#password,
      this.#passwordRepeat,
    ]);
    new StrengthNote(engine, this.#password.input, "mhfe-new-strength", weakPasswordText);
    this.#newPassword = new NewPasswordChoice(
      engine,
      "new",
      { password: this.#password, repeat: this.#passwordRepeat },
      this.#status,
    );
    this.#passphraseStrength = new StrengthNote(
      engine,
      this.#passphrase.input,
      "mhfe-new-passphrase-strength",
      (bits) =>
        `This passphrase is weak: about ${Math.round(bits)} bits; the check is as strong as it.`,
    );
    this.#outlook = new MhfeDrawOutlook(required<HTMLElement>("#mhfe-new-outlook"), engine);
    this.#passphrase.input.addEventListener("input", () => this.#showCheckChoice());
    for (const radio of [...this.#checkRadios(), ...this.#wordRadios()])
      radio.addEventListener("change", () => this.#showCheckChoice());
    // The fields of the chosen word take MHFE's limit, known once its quick checks have passed.
    engine.whenPassed(() => void this.#buildWishFields());
    this.#showCheckChoice();
    this.#result = new NewContainerResult(
      required<HTMLElement>("#mhfe-new-result"),
      engine,
      context.writeClipboard,
    );
    const task = {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-new-stop"),
      failure: "The new wallet failed.",
      inputs: required<HTMLElement>("#mhfe-new-panel"),
      onEdit: () => this.#result.reset(),
    };
    this.#generation = new MhfeTask(context, engine, {
      ...task,
      name: "MHFE new wallet",
      stop: () => {
        this.#engine.cancelDraw();
        this.#engine.cancelCore();
      },
    });
    this.#encryption = new MhfeTask(context, engine, { ...task, name: "MHFE encryption" });
    const clear = (): void => {
      this.#drawn = undefined;
      this.#phraseResult.replaceChildren();
      this.#retrySubscription?.();
      this.#retrySubscription = undefined;
    };
    document.querySelector("#clear-all")?.addEventListener("click", clear);
    window.addEventListener("pagehide", clear);
    required<HTMLButtonElement>("#mhfe-new").addEventListener("click", () => this.#start());
  }

  #checkRadios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[name="mhfe-new-check"]')];
  }

  #wordRadios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[name="mhfe-new-words"]')];
  }

  async #buildWishFields(): Promise<void> {
    const { maxChosenWords, maxNeverUseWords } = await this.#engine.walletParameters();
    required<HTMLElement>("#mhfe-new-words-chosen-text").textContent =
      maxChosenWords === 1 ? "Choose one word" : `Choose up to ${maxChosenWords} words`;
    const fields = new ChosenWordFields(required<HTMLElement>("#mhfe-new-wishes"), {
      prefix: "mhfe-new-chosen",
      words: maxChosenWords,
      neverUse: maxNeverUseWords,
      toggle: true,
    });
    fields.onChange(() => this.#showOutlook());
    const hints = mhfeWordHints(this.#engine, "bip39");
    for (const input of fields.inputs()) WordHintField.attach(input, hints);
    this.#wishFields = fields;
    this.#showOutlook();
  }

  /** The wallet check is offered only with a passphrase, and never preselected. */
  #showCheckChoice(): void {
    const hasPassphrase = this.#passphrase.value !== "";
    required<HTMLElement>("#mhfe-new-passphrase-confirm-field").hidden = !hasPassphrase;
    required<HTMLElement>("#mhfe-new-check").hidden = !hasPassphrase;
    required<HTMLElement>("#mhfe-new-no-check-note").hidden = hasPassphrase;
    const checked = this.#walletCheck() === true;
    required<HTMLElement>("#mhfe-new-funds-note").hidden = !checked;
    required<HTMLElement>("#mhfe-new-wishes").hidden = !this.#wordsChosen();
    this.#passphraseStrength.enabled = checked;
    this.#showOutlook();
  }

  /** Whether the phrase gets the check: undefined while a passphrase is typed and none is chosen. */
  #walletCheck(): boolean | undefined {
    return this.#passphrase.value === "" ? false : this.#walletCheckChosen();
  }

  /** Whether the person chose to choose a word. */
  #wordsChosen(): boolean {
    return this.#wordRadios().some((radio) => radio.checked && radio.value === "chosen");
  }

  /** The chosen word and the words never to use, while the person chose to give them. */
  #wishes(): MhfeWishes {
    const fields = this.#wishFields;
    if (fields === undefined || !this.#wordsChosen()) return NO_WISHES;
    return { chosen: fields.chosen(MHFE_PHRASE_WORDS), neverUse: fields.neverUse() };
  }

  /** What the phrase keeps with the check and the wishes, once MHFE's quick checks have passed. */
  #showOutlook(): void {
    if (this.#wishFields === undefined) return;
    void this.#outlook.show(this.#wishes(), this.#walletCheck() === true);
  }

  /** The answer to the check question: undefined while none is chosen. */
  #walletCheckChosen(): boolean | undefined {
    const checked = this.#checkRadios().find((radio) => radio.checked);
    return checked === undefined ? undefined : checked.value === "wallet";
  }

  #start(): void {
    if (!this.#generation.available) return;
    this.#retrySubscription?.();
    this.#retrySubscription = undefined;
    this.#phraseResult.replaceChildren();
    this.#result.reset();
    this.#drawn = undefined;
    void this.#generation.run((run) => this.#generate(run), {
      failed: (cause) => this.#fail(cause),
    });
  }

  async #generate(run: MhfeRun): Promise<void> {
    const passphrase = this.#passphrase.value;
    const walletCheck = this.#walletCheck();
    if (walletCheck === undefined) throw new Error("Choose whether the new phrase gets a check.");
    // Every answer is taken before the phrase is drawn, so that a refusal comes before any work.
    selectedRepairCount("mhfe-new-repair-count");
    const typed = this.#newPassword.passwords();
    const choice = await this.#review.require(run, typed.password, typed.repeat);
    const drawn = await this.#draw(run, passphrase, walletCheck, this.#wishes());
    this.#showPhrase(drawn, passphrase);
    this.#drawn = { phrase: drawn, hasPassphrase: passphrase !== "" };
    // The password was reviewed before the phrase was drawn; typing meanwhile voids that answer.
    this.#review.assertCurrent(choice);
    await this.#encrypt(run, choice);
  }

  /** Encrypts the phrase shown again, after a failed or cancelled encryption. */
  #encryptAgain(): void {
    if (this.#drawn === undefined || !this.#encryption.available) return;
    this.#result.reset();
    void this.#encryption.run((run) => this.#encrypt(run), {
      failed: (cause) => this.#fail(cause),
    });
  }

  async #draw(
    run: MhfeRun,
    passphrase: string,
    walletCheck: boolean,
    wishes: MhfeWishes,
  ): Promise<MhfeNewPhrase> {
    const wallet = await run.step(() => this.#engine.wallet());
    const clock = new JobClock();
    const clearPassphrases = clearOnFirstProgress(
      this.#passphrase.input,
      this.#passphraseRepeat.input,
    );
    const wanted = { chosen: [...wishes.chosen], neverUse: [...wishes.neverUse] };
    const { expectedDraws } = await run.step(() => wallet.describeDraw({ ...wanted, walletCheck }));
    this.#status.textContent = drawStartLine(walletCheck, expectedDraws);
    const drawn = await run.step(() =>
      wallet.drawPhrase({
        ...wanted,
        ...(passphrase === ""
          ? {}
          : { passphrase, passphraseRepeat: this.#passphraseRepeat.value, walletCheck }),
        onProgress: ({ draws }) =>
          run.publish(() => {
            clearPassphrases();
            this.#status.textContent = drawLine(draws, clock, walletCheck);
          }),
      }),
    );
    clearPassphrases();
    this.#showCheckChoice();
    this.#status.textContent = `Drawn in ${formatDuration(clock.elapsed())}. Encrypting it now.`;
    return drawn;
  }

  /** The new phrase, shown for the wallet before it is encrypted. */
  #showPhrase(drawn: MhfeNewPhrase, passphrase: string): void {
    const heading = document.createElement("h3");
    heading.textContent = `New seed phrase, ${drawn.words} words`;
    this.#phraseResult.append(
      heading,
      paragraph(
        "Write it down for your wallet. It stays on this page until you leave; the browser cannot wipe it.",
        "warning-callout",
      ),
    );
    if (drawn.walletCheck)
      this.#phraseResult.append(
        paragraph(
          `Drawn so that it passes its wallet check with your passphrase, on ${drawn.workers} workers.`,
          "field-note",
        ),
      );
    renderPhrase(
      this.#phraseResult,
      drawn.phrase,
      drawn.fingerprintWithPassphrase,
      passphrase === "" ? "noPassphrase" : "withPassphrase",
      this.#context,
      { passphrase },
    );
  }

  /**
   * Encrypts the phrase drawn, with the container password and settings in the fields now;
   * `reviewed` is the answer of a review made before the phrase was drawn.
   */
  async #encrypt(run: MhfeRun, reviewed?: ReviewChoice): Promise<void> {
    const drawn = this.#drawn;
    if (drawn === undefined) return;
    const repairWordCount = selectedRepairCount("mhfe-new-repair-count");
    const typed = this.#newPassword.passwords();
    const choice = reviewed ?? (await this.#review.require(run, typed.password, typed.repeat));
    const client = await run.step(() => this.#engine.client());
    const progress = await run.step(() => this.#engine.progress(ENCRYPT_STAGES));
    this.#review.assertCurrent(choice);

    const sealed = await run.step(() =>
      client.encrypt({
        phrase: drawn.phrase.phrase,
        password: typed.password,
        passwordRepeat: typed.repeat,
        passwordRepair: choice.repair,
        pim: this.#pim.value(),
        repairWordCount,
        walletHasPassphrase: drawn.hasPassphrase,
        onProgress: progressCallback(run, progress, this.#status, ...this.#newPassword.inputs()),
        onUnverified: (result) => run.publish(() => this.#result.unverified(result)),
      }),
    );
    await this.#result.seal(
      sealed,
      {
        verified: "Verified: the container turns back into the new phrase.",
        next: REHEARSE,
        ...(typed.made === undefined ? {} : { password: typed.made }),
      },
      run,
    );
    this.#newPassword.forget();
    this.#drawn = undefined;
    this.#phraseResult.querySelector(".mhfe-encrypt-again")?.remove();
    this.#retrySubscription?.();
    this.#retrySubscription = undefined;
    const outcome = reviewSaid(choice);
    this.#status.textContent = `New wallet encrypted in ${progress.elapsed()}.${outcome}`;
  }

  #fail(cause: unknown): void {
    this.#result.failed(cause);
    if (this.#drawn === undefined) return;
    this.#status.textContent +=
      " The new phrase above is not encrypted yet: type the container password again and press " +
      "Encrypt this phrase again, or Generate wallet for a new phrase.";
    // Encrypting the same phrase here keeps the passphrase in what to keep, which Encode would not know.
    if (this.#phraseResult.querySelector(".mhfe-encrypt-again") === null) {
      const again = document.createElement("button");
      again.type = "button";
      again.className = "secondary compact mhfe-encrypt-again";
      again.textContent = "Encrypt this phrase again";
      again.dataset.heavyJob = "";
      const sync = (): void => {
        again.disabled = !this.#encryption.available;
      };
      this.#retrySubscription?.();
      this.#retrySubscription = this.#context.jobs.onChange(sync);
      sync();
      again.addEventListener("click", () => this.#encryptAgain());
      this.#phraseResult.append(again);
    }
  }
}
