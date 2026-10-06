// The Encode tab of the MHFE panel: a BIP39 phrase into a 24-word container, or on request into one
// as long as a 12- to 21-word phrase.
import { MhfeError, type MhfeClient } from "@ckd/recovery-mhfe-wasm/client.js";
import { ContainerCard } from "./recovery-mhfe-container-card.js";
import { MEMORY_LEVEL, type MhfeEngine } from "./recovery-mhfe-engine.js";
import { PasswordField, PimField } from "./recovery-mhfe-fields.js";
import {
  CONTAINER_WORDS,
  FULL_SUITE_ID,
  SAME_LENGTH_SUITE_ID,
  clearOnFirstProgress,
  describe,
  progressLine,
  readBackDiffers,
  rememberNote,
} from "./recovery-mhfe-status.js";
import { JobClock, formatDuration } from "./recovery-progress.js";
import {
  phraseFingerprint,
  renderReadBackWords,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The phrase with every word written out, and the lengths whose check it also passes. */
type PhraseReading = Awaited<ReturnType<MhfeClient["readPhrase"]>>;

/** The settings of one encryption, read from the form before it starts. */
interface EncryptionRequest {
  readonly phrase: string;
  readonly reading: PhraseReading;
  readonly sameLength: boolean;
  readonly pim: number;
  /** About one phrase in four billion also passes the check of another length; see `#lengthNote`. */
  readonly lengthMustBeChosen: boolean;
}

export class MhfeEncodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #action = required<HTMLButtonElement>("#mhfe-encrypt");
  readonly #cancel = required<HTMLButtonElement>("#mhfe-encrypt-stop");
  readonly #status = required<HTMLElement>("#mhfe-encrypt-status");
  readonly #result = required<HTMLElement>("#mhfe-encrypt-result");
  readonly #readBack = required<HTMLElement>("#mhfe-encrypt-read");
  readonly #sameLength = required<HTMLInputElement>("#mhfe-length-same");
  readonly #password = new PasswordField(
    "#mhfe-encrypt-password",
    "#toggle-mhfe-encrypt-password",
    "MHFE password",
  );
  readonly #repeat = new PasswordField(
    "#mhfe-encrypt-password-confirm",
    "#toggle-mhfe-encrypt-password-confirm",
    "password confirmation",
  );
  readonly #pim = new PimField("encrypt");
  /** The card of the running encryption, once its container exists. */
  #card: ContainerCard | undefined;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    this.#action.addEventListener("click", () => this.#start());
  }

  #start(): void {
    this.#result.replaceChildren();
    this.#readBack.replaceChildren();
    this.#status.classList.remove("warning");
    this.#card = undefined;
    void this.#context.jobs
      .runHeavy("MHFE encryption", () =>
        this.#engine.runCancellable(this.#cancel, () => this.#encrypt()),
      )
      .catch((cause: unknown) => this.#fail(cause));
  }

  async #encrypt(): Promise<void> {
    const pim = this.#pim.value();
    const sameLength = this.#sameLength.checked;
    const password = this.#password.value;
    const passwordRepeat = this.#repeat.value;
    if (password !== passwordRepeat) throw new Error("The two passwords differ. Type them again.");
    const phrase = this.#context.readMnemonic("mhfe", "#mhfe-source").trim();
    const reading = await this.#engine.client.readPhrase(phrase);
    if (readBackDiffers(phrase, reading.phrase)) {
      renderReadBackWords(
        this.#readBack,
        reading.phrase,
        "MHFE read your phrase as these words, written out in full. Check them against your backup.",
        this.#context.writeClipboard,
      );
    }
    // A same-length container needs no length note: its own length is the phrase's.
    const request: EncryptionRequest = {
      phrase,
      reading,
      sameLength,
      pim,
      lengthMustBeChosen: !sameLength && reading.otherLengths.length > 0,
    };
    const lengthNote = this.#lengthNote(request);
    const clock = new JobClock();
    this.#status.textContent = `Starting · ${reading.words}-word phrase accepted.${lengthNote}`;
    const clearPasswords = clearOnFirstProgress(this.#password.input, this.#repeat.input);
    const { container, suiteId } = await this.#engine.client.encrypt({
      phrase,
      password,
      passwordRepeat,
      pim,
      memoryLevel: MEMORY_LEVEL,
      sameLength,
      onProgress: (progress) => {
        clearPasswords();
        this.#status.textContent = progressLine(progress, clock, false) + lengthNote;
      },
      onUnverified: ({ container: unverified }) => {
        this.#showCard(request, unverified, sameLength ? SAME_LENGTH_SUITE_ID : FULL_SUITE_ID);
      },
    });
    const card = this.#card ?? this.#showCard(request, container, suiteId);
    card.keepNote = this.#keepNote(request, suiteId);
    card.markVerified();
    this.#status.textContent = `Encryption complete in ${formatDuration(clock.elapsed())}.${lengthNote}`;
    this.#status.classList.toggle("warning", lengthNote !== "");
  }

  #showCard(request: EncryptionRequest, container: string, suiteId: string): ContainerCard {
    const containerWords = request.sameLength ? request.reading.words : CONTAINER_WORDS;
    this.#card = new ContainerCard(
      this.#result,
      container,
      containerWords,
      phraseFingerprint(container, this.#context.mnemonicToSeed),
      this.#context.writeClipboard,
    );
    this.#card.keepNote = this.#keepNote(request, suiteId);
    return this.#card;
  }

  #keepNote(request: EncryptionRequest, suiteId: string): string {
    return rememberNote(
      request.reading.words,
      request.sameLength,
      request.lengthMustBeChosen,
      request.pim,
      suiteId,
    );
  }

  /**
   * Automatic detection in a 24-word container would not give back a phrase that also passes the
   * check of another length, so its word count must be written down and selected at recovery.
   */
  #lengthNote(request: EncryptionRequest): string {
    if (!request.lengthMustBeChosen) return "";
    return (
      ` Write down that your phrase has ${request.reading.words} words and select that length when you recover: ` +
      `by chance it also passes the check of ${request.reading.otherLengths.join(" and ")} words.`
    );
  }

  #fail(cause: unknown): void {
    this.#status.classList.add("warning");
    this.#status.textContent = describe(cause, "MHFE encryption failed.");
    if (cause instanceof MhfeError && cause.code === "VERIFICATION_FAILED") this.#card?.markWrong();
    else this.#card?.markUnfinished();
  }
}
