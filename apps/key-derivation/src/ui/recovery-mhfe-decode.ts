// The Decode tab of the MHFE panel: a container and its password back into the BIP39 phrase. The
// page never calls the client's check(): it repeats the whole computation, and the owner wants no
// such long check. A recovered phrase is confirmed with the master key fingerprint shown under it
// or with a known address in the Deriver instead.
import type { MhfeRecovery, WordCount } from "@ckd/recovery-mhfe-wasm/client.js";
import { installQrImageImport } from "@ckd/ui/qr-image-import.js";
import { MEMORY_LEVEL, type MhfeEngine } from "./recovery-mhfe-engine.js";
import { PasswordField, PimField } from "./recovery-mhfe-fields.js";
import {
  clearOnFirstProgress,
  describe,
  progressLine,
  readBackDiffers,
  recoverySummary,
} from "./recovery-mhfe-status.js";
import { JobClock, formatDuration } from "./recovery-progress.js";
import {
  installSecretToggle,
  paragraph,
  phraseFingerprint,
  renderReadBackWords,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The client's value for "detect the length": every built-in check is tried. */
const AUTO_DETECT = 0;

export class MhfeDecodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #action = required<HTMLButtonElement>("#mhfe-decrypt");
  readonly #cancel = required<HTMLButtonElement>("#mhfe-decrypt-stop");
  readonly #status = required<HTMLElement>("#mhfe-decrypt-status");
  readonly #result = required<HTMLElement>("#mhfe-decrypt-result");
  readonly #readBack = required<HTMLElement>("#mhfe-decrypt-read");
  readonly #container = required<HTMLTextAreaElement>("#mhfe-container");
  readonly #sourceWords = required<HTMLSelectElement>("#mhfe-decrypt-source-words");
  readonly #password = new PasswordField(
    "#mhfe-decrypt-password",
    "#toggle-mhfe-decrypt-password",
    "MHFE password",
  );
  readonly #pim = new PimField("decrypt");

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    installSecretToggle("#toggle-mhfe-container", "#mhfe-container", "Show", "Hide", "container");
    installQrImageImport(document, this.#container, {
      label: "Import QR image",
      onDecoded: (decoded) => decoded.text.trim(),
      onError: (message) => {
        this.#status.textContent = message;
      },
    });
    this.#action.addEventListener("click", () => this.#start());
  }

  #start(): void {
    this.#result.replaceChildren();
    this.#readBack.replaceChildren();
    this.#status.classList.remove("warning");
    void this.#context.jobs
      .runHeavy("MHFE recovery", () =>
        this.#engine.runCancellable(this.#cancel, () => this.#decrypt()),
      )
      .catch((cause: unknown) => {
        this.#status.classList.add("warning");
        this.#status.textContent = describe(cause, "MHFE recovery failed.");
      });
  }

  async #decrypt(): Promise<void> {
    const pim = this.#pim.value();
    const words = this.#selectedWords();
    const { container } = await this.#engine.client.readContainer(this.#container.value);
    this.#showContainerCheck(container);
    const clock = new JobClock();
    const clearPassword = clearOnFirstProgress(this.#password.input);
    const recovery = await this.#engine.client.decrypt({
      container,
      password: this.#password.value,
      pim,
      memoryLevel: MEMORY_LEVEL,
      words,
      onProgress: (progress) => {
        clearPassword();
        this.#status.textContent = progressLine(progress, clock, true);
      },
    });
    this.#showRecovery(recovery, words);
    this.#status.textContent =
      recovery.kind === "ambiguous"
        ? "Several lengths passed their check, which happens by accident for about one container in four " +
          "billion. Every candidate is shown: compare each with your wallet, or select the known length."
        : `Recovery complete in ${formatDuration(clock.elapsed())}.`;
    this.#status.classList.toggle("warning", recovery.kind === "ambiguous");
  }

  #selectedWords(): WordCount | typeof AUTO_DETECT {
    const selected = this.#sourceWords.value;
    if (selected === "auto") return AUTO_DETECT;
    const words = Number(selected);
    if (words === 12 || words === 15 || words === 18 || words === 21 || words === 24) return words;
    throw new Error("Select a valid original phrase length.");
  }

  /** The words as MHFE read them, when they differ from the entry, and the container's fingerprint. */
  #showContainerCheck(container: string): void {
    if (readBackDiffers(this.#container.value, container)) {
      renderReadBackWords(
        this.#readBack,
        container,
        "MHFE read the container as these words, written out in full.",
        this.#context.writeClipboard,
      );
    }
    this.#readBack.append(
      paragraph(
        `Container fingerprint ${phraseFingerprint(container, this.#context.mnemonicToSeed)}. If it differs from ` +
          "the one noted when the container was made, a word is miscopied: press Cancel and check the words.",
        "field-note",
      ),
    );
  }

  #showRecovery(recovery: MhfeRecovery, selectedWords: number): void {
    for (const candidate of recovery.candidates) {
      const summary = document.createElement("div");
      summary.className = candidate.verified ? "success-callout" : "warning-callout";
      summary.textContent = recoverySummary(candidate, selectedWords);
      if (recovery.kind === "ambiguous") {
        const heading = document.createElement("h3");
        heading.textContent = `${candidate.words}-word candidate`;
        this.#result.append(heading);
      }
      this.#result.append(summary);
      renderRecoveredMnemonic(
        this.#result,
        candidate.phrase,
        this.#context.writeClipboard,
        this.#context.useMnemonicInDeriver,
        this.#context.mnemonicToSeed,
      );
    }
  }
}
