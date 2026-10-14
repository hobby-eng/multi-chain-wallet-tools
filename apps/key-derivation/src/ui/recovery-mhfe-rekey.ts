// The Change password tab of the MHFE panel (`mhfe rekey`): recovers the old container, confirms
// the phrase and encrypts it into a new container under a new password or settings. The new
// password and settings are taken before the recovery, so that a refusal comes before any work.
import {
  MhfeError,
  type MhfeContainerFacts,
  type MhfeRekeyConfirmation,
  type WordCount,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import { NewContainerResult } from "./recovery-mhfe-cards.js";
import { adaptToContainer, showContainerFacts } from "./recovery-mhfe-decode.js";
import { weakPasswordText } from "./recovery-mhfe-encode.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import {
  ContainerField,
  ContainerPassword,
  PasswordField,
  PasswordReview,
  PhraseLengthChoice,
  PimField,
  StrengthNote,
  selectedRepairCount,
} from "./recovery-mhfe-fields.js";
import { MarkedContainer } from "./recovery-mhfe-marked-container.js";
import { ConfirmAgainPrompt } from "./recovery-mhfe-confirm-again.js";
import { OwnerPhraseCheck } from "./recovery-mhfe-owner-check.js";
import { WalletReferenceField } from "./recovery-mhfe-reference.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { WalletPassphraseQuestion } from "./recovery-mhfe-wallet-passphrase.js";
import { REKEY_STAGES, progressCallback } from "./recovery-mhfe-status.js";
import { NewPasswordChoice } from "./recovery-mhfe-new-password.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/**
 * What detection asks for in a rekey, beside its answer, as `mhfe rekey` says it
 * (src/bin/mhfe/rekey.rs, DETECTION_MISSES): a 24-word phrase has no built-in check, so an
 * address, the fingerprint or the phrase shown confirms it.
 */
const DETECTION_MISSES = "then an address or the phrase confirms";

/**
 * The warning about the wallets other passwords open on the old container, as mhfe words it
 * (src/bin/mhfe/rekey.rs, the owner's final wording of 2026-10-08): one sentence, with a PIM that
 * is not 0 named in its list. Every user is warned and asked nothing; a browser has memory level 0
 * only, which is never named.
 */
/** The owner's wording: what the old container still opens, and that nothing of it goes yet. */
export const KEEP_FOR_OTHER_WALLETS =
  "Wallets that other passwords open on the old container do not move to the new one: keep the old " +
  "container, its passwords and its settings until you have moved their funds.";

/** The refusals after which a rekey needs an address, the fingerprint or the owner. */
const REFERENCE_CODES: ReadonlySet<MhfeError["code"]> = new Set([
  "AMBIGUOUS_LENGTH",
  "LENGTH_DIFFERS",
  "REFERENCE_REQUIRED",
]);

export class MhfeRekeyTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-rekey-status");
  readonly #readBack = required<HTMLElement>("#mhfe-rekey-read");
  readonly #ownerCheck = new OwnerPhraseCheck(
    required<HTMLElement>("#mhfe-rekey-owner"),
    this.#status,
  );
  readonly #length: PhraseLengthChoice;
  readonly #container: ContainerField;
  readonly #old: ContainerPassword;
  readonly #newPassword = new PasswordField("mhfe-rekey-new-password", "new container password");
  readonly #newRepeat = new PasswordField(
    "mhfe-rekey-new-password-confirm",
    "new container password repetition",
  );
  readonly #newPim = new PimField("rekey-new");
  readonly #newReview: PasswordReview;
  readonly #walletPassphrase = new WalletPassphraseQuestion("rekey");
  readonly #reference: WalletReferenceField;
  readonly #marked: MarkedContainer;
  readonly #newPasswordChoice: NewPasswordChoice;
  readonly #result: NewContainerResult;
  readonly #task: MhfeTask;
  #facts: MhfeContainerFacts | undefined;
  /**
   * Set when the package refused to confirm by the built-in check alone (several lengths pass, or
   * the check contradicts the length): the page then asks for an address, the fingerprint or the
   * owner until another container is read.
   */
  #referenceRequired = false;
  /** The answer about the wallet's passphrase given with the first confirmation. */
  #walletHasPassphrase = false;
  readonly #confirmAgain: ConfirmAgainPrompt;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    this.#container = new ContainerField("mhfe-rekey-container", this.#status);
    this.#length = new PhraseLengthChoice(
      engine,
      required<HTMLSelectElement>("#mhfe-rekey-words"),
      {
        lengths: "all",
        misses: DETECTION_MISSES,
      },
    );
    this.#old = new ContainerPassword(engine, "rekey", "old container password");
    this.#newReview = new PasswordReview(engine, "mhfe-rekey-new-password-review", [
      this.#newPassword,
      this.#newRepeat,
    ]);
    new StrengthNote(engine, this.#newPassword.input, "mhfe-rekey-new-strength", weakPasswordText);
    this.#newPasswordChoice = new NewPasswordChoice(
      engine,
      "rekey-new",
      { password: this.#newPassword, repeat: this.#newRepeat },
      this.#status,
    );
    this.#reference = new WalletReferenceField(engine, "rekey", this.#walletPassphrase);
    this.#confirmAgain = new ConfirmAgainPrompt({
      host: required<HTMLElement>("#mhfe-rekey-owner"),
      status: this.#status,
      reference: this.#reference,
      ownerCheck: this.#ownerCheck,
      choice: [
        required<HTMLElement>("#mhfe-rekey-reference"),
        required<HTMLElement>("#mhfe-rekey-reference-fields"),
      ],
      walletHasPassphrase: () => this.#walletHasPassphrase,
    });
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "rekey",
      field: this.#container,
      status: this.#status,
      recovery: this.#old,
      resume: () => this.#start(),
    });
    this.#result = new NewContainerResult(
      required<HTMLElement>("#mhfe-rekey-result"),
      engine,
      context.writeClipboard,
      "New MHFE container",
    );
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-rekey-stop"),
      name: "MHFE password change",
      failure: "The password change failed.",
      inputs: required<HTMLElement>("#mhfe-rekey-panel"),
      onEdit: () => {
        this.#readBack.replaceChildren();
        this.#result.reset();
        this.#ownerCheck.dispose();
      },
    });
    adaptToContainer(engine, this.#container, (facts) => {
      this.#facts = facts;
      this.#referenceRequired = false;
      this.#length.adapt(facts);
      this.#showConfirmation();
    });
    this.#length.onChange(() => this.#showConfirmation());
    for (const radio of document.querySelectorAll('input[name="mhfe-rekey-reference"]'))
      radio.addEventListener("change", () => this.#showConfirmation());
    required<HTMLElement>("#mhfe-rekey-keep-old").textContent = KEEP_FOR_OTHER_WALLETS;
    // The answers that must be given every time are cleared when the page comes back, too.
    window.addEventListener("pageshow", () => this.#clearAnswers(true));
    // A phrase shown to its owner never stays in a page kept in the back-forward cache. The job is
    // cancelled first, so that it ends as stopped rather than as a phrase the owner refused.
    window.addEventListener("pagehide", () => {
      if (this.#ownerCheck.open) this.#engine.cancelCore();
      this.#confirmAgain.dispose();
      this.#ownerCheck.dispose();
    });
    this.#clearAnswers(true);
    required<HTMLButtonElement>("#mhfe-rekey").addEventListener("click", () => this.#start());
  }

  /** The confirmation is asked again on a new page. */
  #clearAnswers(withConfirmation: boolean): void {
    if (withConfirmation) this.#reference.reset();
    this.#showConfirmation();
  }

  /**
   * What confirms the recovery at the chosen length, as the container's facts say: its built-in
   * check, or the wallet or its owner, also where the length is detected. After the package refused
   * the built-in check alone, the wallet or its owner.
   */
  #confirmationKind(): "builtInCheck" | "walletOrOwner" | undefined {
    const words = this.#chosenLength();
    if (words === undefined) return undefined;
    if (this.#referenceRequired) return "walletOrOwner";
    return this.#facts?.confirmationFor[`${words}`];
  }

  #chosenLength(): 0 | WordCount | undefined {
    try {
      return this.#length.value();
    } catch {
      return undefined;
    }
  }

  #showConfirmation(): void {
    const kind = this.#confirmationKind();
    const builtIn = kind === "builtInCheck";
    required<HTMLElement>("#mhfe-rekey-builtin-note").hidden = kind !== "builtInCheck";
    // A reference chosen before the container showed a built-in check is not asked for then.
    for (const block of ["#mhfe-rekey-reference", "#mhfe-rekey-reference-fields"])
      required<HTMLElement>(block).hidden = builtIn;
    // The question about the passphrase follows the choice of how to confirm, as in the
    // command-line tool; the built-in check needs no choice before it.
    this.#walletPassphrase.hidden = !builtIn && this.#reference.kind === undefined;
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#readBack.replaceChildren();
    this.#result.reset();
    this.#ownerCheck.dispose();
    void this.#task
      .run((run) => this.#rekey(run), { failed: (cause) => this.#fail(cause) })
      .finally(() => {
        // Success, failure, Cancel and a refused start all close the owner's questions.
        this.#confirmAgain.dispose();
        this.#ownerCheck.dispose();
        this.#clearAnswers(false);
      });
  }

  async #rekey(run: MhfeRun): Promise<void> {
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    this.#facts = facts;
    this.#length.adapt(facts);
    showContainerFacts(this.#readBack, this.#container.value, facts, this.#context.writeClipboard);
    const words = this.#length.value();
    const terms = this.#confirmationTerms();
    const repairWordCount = selectedRepairCount("mhfe-rekey-repair-count");
    const old = await this.#old.reviewed(run);
    const typed = this.#newPasswordChoice.passwords();
    const fresh = await this.#newReview.require(run, typed.password, typed.repeat);
    // The new password's review came after the old one's.
    this.#old.review.assertCurrent(old.choice);
    const progress = await run.step(() => this.#engine.progress(REKEY_STAGES));
    this.#old.review.assertCurrent(old.choice);
    this.#newReview.assertCurrent(fresh);

    const sealed = await run.step(() =>
      client.rekey({
        container: facts.container,
        words,
        ...old.settings,
        newPassword: typed.password,
        newPasswordRepeat: typed.repeat,
        newPasswordRepair: fresh.repair,
        newPim: this.#newPim.value(),
        repairWordCount,
        ...terms,
        onProgress: progressCallback(
          run,
          progress,
          this.#status,
          this.#old.password.input,
          ...this.#newPasswordChoice.inputs(),
          this.#reference.passphrase.input,
        ),
        onUnverified: (result) => run.publish(() => this.#result.unverified(result)),
        // After AMBIGUOUS_LENGTH or LENGTH_DIFFERS: confirm again on the same recovery.
        onConfirmAgain: ({ error, ownerLengths }) => this.#confirmAgain.ask(error, ownerLengths),
      }),
    );
    await this.#result.seal(
      sealed,
      {
        verified: "Checked: the new container turns back into the recovered phrase.",
        oldBackup: "the old container phrase still opens the wallet with the old password",
        next: "rehearse the new container phrase in Decode or Check, best on another day",
        ...(typed.made === undefined ? {} : { password: typed.made }),
      },
      run,
    );
    this.#newPasswordChoice.forget();
    // Without a built-in check, the rehearsal compares the new container with the phrase the owner
    // confirmed: its fingerprint, kept from the comparison.
    const confirmed = sealed.builtInCheck ? undefined : this.#ownerCheck.confirmedFingerprint;
    this.#status.textContent =
      `Password changed in ${progress.elapsed()}.` +
      (confirmed === undefined
        ? ""
        : ` Rehearse the new container phrase: its recovery must show fingerprint ${confirmed}.`);
  }

  /**
   * The built-in check where the container has one at this length, otherwise the user's choice,
   * with the answer about the wallet's BIP39 passphrase. Only an address or a fingerprint takes
   * the passphrase itself, and only from a wallet said to have one: the package's
   * MhfeRekeyConfirmation.
   */
  #confirmationTerms(): MhfeRekeyConfirmation {
    const walletHasPassphrase = this.#walletPassphrase.required();
    this.#walletHasPassphrase = walletHasPassphrase;
    if (this.#confirmationKind() === "builtInCheck")
      return { confirmation: { builtInCheck: true }, walletHasPassphrase };
    if (this.#reference.kind === "owner")
      return {
        confirmation: { owner: (check) => this.#ownerCheck.ask(check) },
        walletHasPassphrase,
      };
    const confirmation = this.#reference.walletReference();
    if (!walletHasPassphrase) return { confirmation, walletHasPassphrase };
    const passphrase = this.#reference.passphrase.value;
    // An empty one would compare the wallet without a passphrase, which the answer rules out.
    if (passphrase === "")
      throw new Error("Type the wallet's BIP39 passphrase, or answer that it has none.");
    return { confirmation, passphrase, walletHasPassphrase };
  }

  #fail(cause: unknown): void {
    this.#result.failed(cause);
    // The built-in check alone does not confirm this recovery: several lengths pass, the check
    // contradicts the length given, or the length is detected. The page asks for an address, the
    // fingerprint or the owner, and the person presses again.
    if (cause instanceof MhfeError && REFERENCE_CODES.has(cause.code)) {
      this.#referenceRequired = true;
      this.#reference.reset();
      this.#showConfirmation();
    }
  }
}
