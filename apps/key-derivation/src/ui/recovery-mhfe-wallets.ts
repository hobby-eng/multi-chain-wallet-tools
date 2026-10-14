// The Hidden wallets tab of the MHFE panel (`mhfe wallets`): on a 24-word container every password
// other than the container's own opens another valid wallet. A session holds the Argon2 work area;
// each password typed shows the wallet it opens. Nothing is listed or counted, on screen or in a
// status line, and the session closes itself after a while without use.
import { MhfeError, type MhfeHiddenWallets } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { InputRevision } from "./recovery-input-revision.js";
import { weakPasswordText } from "./recovery-mhfe-encode.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { MarkedContainer } from "./recovery-mhfe-marked-container.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import {
  ContainerField,
  PasswordField,
  PasswordReview,
  PimField,
  StrengthNote,
} from "./recovery-mhfe-fields.js";
import {
  OPEN_STAGES,
  progressCallback,
  describe,
  type StageProgress,
} from "./recovery-mhfe-status.js";
import { AwaitingAnswer, MhfeTask } from "./recovery-mhfe-task.js";
import {
  paragraph,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The owner's choice (2026-10-06): a session closes itself after 10 minutes without an open. */
const IDLE_CLOSE_MS = 10 * 60 * 1000;

export class MhfeWalletsTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #task: MhfeTask;
  readonly #cancel = required<HTMLButtonElement>("#mhfe-wallets-stop");
  readonly #status = required<HTMLElement>("#mhfe-wallets-status");
  readonly #result = required<HTMLElement>("#mhfe-wallets-result");
  readonly #sessionBlock = required<HTMLElement>("#mhfe-wallets-session");
  readonly #sessionNote = required<HTMLElement>("#mhfe-wallets-session-note");
  readonly #openButton = required<HTMLButtonElement>("#mhfe-wallets-open");
  readonly #container: ContainerField;
  readonly #pim = new PimField("wallets");
  readonly #mainPassphrase = new PasswordField(
    "mhfe-wallets-main-passphrase",
    "BIP39 passphrase of the main wallet",
  );
  readonly #password = new PasswordField("mhfe-wallets-password", "hidden wallet password");
  readonly #repeat = new PasswordField(
    "mhfe-wallets-password-confirm",
    "hidden wallet password repetition",
  );
  readonly #review: PasswordReview;
  readonly #marked: MarkedContainer;
  readonly #inputs: InputRevision;
  #active: MhfeRun | undefined;
  #refusals = new Set<string>();
  #session: MhfeHiddenWallets | undefined;
  #endSession: (() => void) | undefined;
  #ended: Promise<void> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    this.#container = new ContainerField("mhfe-wallets-container", this.#status);
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: this.#cancel,
      name: "An MHFE hidden-wallet session",
      failure: "The session could not start.",
      inputs: required<HTMLElement>("#mhfe-wallets-panel"),
      onEdit: () => this.#result.replaceChildren(),
    });
    this.#review = new PasswordReview(engine, "mhfe-wallets-password-review", [
      this.#password,
      this.#repeat,
    ]);
    this.#inputs = new InputRevision(required<HTMLElement>("#mhfe-wallets-panel"), () => {
      this.#active?.cancel();
      this.#result.replaceChildren();
    });
    new StrengthNote(engine, this.#password.input, "mhfe-wallets-strength", weakPasswordText);
    // The session's passwords come only once it is open, so a search with the owner's wallet
    // takes the password of the block's own field.
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "wallets",
      field: this.#container,
      status: this.#status,
      recovery: { pim: this.#pim },
      resume: () => this.#start(),
    });
    required<HTMLButtonElement>("#mhfe-wallets-start").addEventListener("click", () =>
      this.#start(),
    );
    this.#openButton.addEventListener("click", () => void this.#open());
    required<HTMLButtonElement>("#mhfe-wallets-close").addEventListener(
      "click",
      () => void this.#close("Session closed. Its memory and the passwords used were discarded."),
    );
    window.addEventListener("pagehide", () => void this.#close(""));
    document.querySelector("#clear-all")?.addEventListener("click", () => void this.#close(""));
    const concealShown = (): void => {
      for (const button of this.#result.querySelectorAll<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      ))
        button.click();
    };
    window.addEventListener("blur", concealShown);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") concealShown();
    });
    this.#sessionBlock.hidden = true;
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#result.replaceChildren();
    void this.#task.run((run) => this.#openSession(run), { holds: () => this.#sessionEnds() });
  }

  /**
   * Opens the session; the job gate stays held until it ends (#sessionEnds). Only a 24-word
   * container has hidden wallets: the package refuses another with NO_HIDDEN_WALLETS before any
   * work.
   */
  async #openSession(run: MhfeRun): Promise<void> {
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    const { hiddenWalletRefusals } = await run.step(() => this.#engine.coreParameters());
    this.#refusals = new Set(hiddenWalletRefusals);
    this.#status.textContent = "Starting the session: MHFE reserves its 2 GiB of memory.";
    const session = await run.step(() =>
      client.openHiddenWallets({
        container: facts.container,
        pim: this.#pim.value(),
        mainPassphrase: this.#mainPassphrase.value,
      }),
    );
    // The session holds the passphrase now; the field is emptied and the inputs locked meanwhile.
    this.#mainPassphrase.clear();
    this.#session = session;
    this.#lockInputs(true);
    this.#sessionBlock.hidden = false;
    this.#status.textContent = "";
    this.#ended = new Promise<void>((resolve) => {
      this.#endSession = resolve;
    });
    this.#restartIdleTimer();
  }

  /** Settles once the open session ends, at once when none opened. */
  #sessionEnds(): Promise<void> {
    const ended = this.#ended ?? Promise.resolve();
    this.#ended = undefined;
    return ended;
  }

  async #open(): Promise<void> {
    const session = this.#session;
    if (session === undefined || this.#openButton.disabled) return;
    const captured = this.#inputs.capture();
    const current = (): boolean => captured() && this.#session === session;
    this.#openButton.disabled = true;
    this.#status.classList.remove("warning");
    try {
      // The review runs under Cancel too: a Cancel during it ends the session like one during
      // the open, since CANCELLED does not keep the session.
      const opened = await this.#engine.runCancellable(
        this.#cancel,
        () => this.#engine.cancelCore(),
        (run) => {
          this.#active = run;
          run.bindCurrent(current);
          return this.#openWallet(run, session);
        },
      );
      if (opened === undefined || !current()) return;
      this.#showWallet(opened.phrase);
      // No number and no count: the main screen must not tell how many wallets were opened.
      this.#status.textContent = `Opened in ${opened.progress.elapsed()}.`;
      this.#restartIdleTimer();
    } catch (cause) {
      // A close already owns cleanup and its status; a late open refusal cannot overwrite it.
      if (this.#session !== session) return;
      if (cause instanceof AwaitingAnswer) {
        this.#status.textContent = cause.message;
        return;
      }
      this.#status.classList.add("warning");
      this.#status.textContent = describe(cause, "The wallet could not be opened.");
      // The refusals after which the session stays open are the package's (parameters()).
      if (cause instanceof MhfeError && this.#refusals.has(cause.code) && current()) {
        this.#password.clear();
        this.#repeat.clear();
        this.#password.input.focus();
      } else {
        await this.#close(
          `${this.#status.textContent} The session was closed and its memory discarded.`,
        );
      }
    } finally {
      this.#active = undefined;
      this.#openButton.disabled = false;
    }
  }

  /**
   * The review of the typed password, then the wallet it opens; AwaitingAnswer while the review
   * waits for the user's answer.
   */
  async #openWallet(
    run: MhfeRun,
    session: MhfeHiddenWallets,
  ): Promise<{ phrase: string; progress: StageProgress }> {
    const password = this.#password.value;
    const passwordRepeat = this.#repeat.value;
    const choice = await this.#review.require(run, password, passwordRepeat);
    const progress = await run.step(() => this.#engine.progress(OPEN_STAGES));
    this.#review.assertCurrent(choice);

    const wallet = await run.step(() =>
      session.open({
        password,
        passwordRepeat,
        passwordRepair: choice.repair,
        onProgress: progressCallback(
          run,
          progress,
          this.#status,
          this.#password.input,
          this.#repeat.input,
        ),
      }),
    );
    for (const field of [this.#password.input, this.#repeat.input]) field.value = "";
    return { phrase: wallet.phrase, progress };
  }

  /** Only the wallet just opened is shown; the next open replaces it. */
  #showWallet(phrase: string): void {
    const heading = document.createElement("h3");
    heading.textContent = "Hidden wallet, 24 words";
    this.#result.replaceChildren(heading);
    // No Copy: clipboard history would keep a list of the hidden wallets opened. The fingerprint
    // appears only with the phrase, in the Seed Diagnostic under Show phrase.
    renderRecoveredMnemonic(
      this.#result,
      phrase,
      undefined,
      this.#context.useMnemonicInDeriver,
      this.#context.mnemonicToSeed,
    );
    this.#result.append(
      paragraph(
        "No need to write it down: the container and this password give it again.",
        "field-note",
      ),
    );
  }

  /** Ends the session: the package overwrites the passwords and the passphrase it holds. */
  async #close(message: string): Promise<void> {
    const session = this.#session;
    if (session === undefined) return;
    this.#session = undefined;
    this.#active?.cancel();
    clearTimeout(this.#idleTimer);
    this.#result.replaceChildren();
    this.#status.textContent = "";
    this.#password.clear();
    this.#repeat.clear();
    this.#review.reset();
    this.#sessionBlock.hidden = true;
    this.#lockInputs(false);
    try {
      await session.close();
    } catch (cause) {
      message += ` Session cleanup reported: ${describe(cause, "The session worker stopped.")}`;
    } finally {
      // Even a failed close reply cannot retain the worker's Argon2 arena.
      this.#engine.cancelCore();
      if (message !== "")
        this.#status.textContent =
          `${message} Fund hidden wallets only from sources linked neither to you nor to the main ` +
          "wallet; Change password changes them.";
      this.#endSession?.();
      this.#endSession = undefined;
    }
  }

  #restartIdleTimer(): void {
    clearTimeout(this.#idleTimer);
    this.#sessionNote.textContent =
      "Session open. The 2 GiB of Argon2 memory and the passwords used stay inside it until you close it; " +
      "it closes itself after 10 minutes without an open.";
    this.#idleTimer = setTimeout(
      () => void this.#close("The session closed itself after 10 minutes without use."),
      IDLE_CLOSE_MS,
    );
  }

  #lockInputs(locked: boolean): void {
    this.#container.textarea.disabled = locked;
    this.#pim.disabled = locked;
    this.#mainPassphrase.input.disabled = locked;
  }
}
