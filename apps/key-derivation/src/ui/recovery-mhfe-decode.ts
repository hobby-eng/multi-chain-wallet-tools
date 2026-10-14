// The Decode tab of the MHFE panel: a container and its password back into the BIP39 phrase. Each
// recovered phrase comes with its status, its fingerprint and, for 24 words, the phrase and
// passphrase check; the page never calls a check by itself.
import type {
  MhfeCandidate,
  MhfeContainerFacts,
  MhfeRecovery,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import { InputRevision } from "./recovery-input-revision.js";
import { fingerprintLine, renderPhrase } from "./recovery-mhfe-cards.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { ContainerField, ContainerPassword, PhraseLengthChoice } from "./recovery-mhfe-fields.js";
import { MarkedContainer } from "./recovery-mhfe-marked-container.js";
import {
  RECOVER_STAGES,
  candidateSummary,
  progressCallback,
  describe,
  failsWalletCheck,
  otherLengthsPass,
  passesWalletCheck,
  statedLengthDiffers,
  WALLET_CHECK_EXPLANATION,
  readBackDiffers,
  walletCheckOdds,
} from "./recovery-mhfe-status.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
import {
  paragraph,
  renderReadBackWords,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/**
 * Shows what MHFE read from a container field: the words in full when they differ from the entry,
 * the suite, and the container's own fingerprint, so that a miscopied word shows before the work.
 */
export function showContainerFacts(
  target: HTMLElement,
  typed: string,
  facts: MhfeContainerFacts,
  copy: (value: string) => Promise<void>,
): void {
  if (readBackDiffers(typed, facts.container))
    renderReadBackWords(
      target,
      facts.container,
      "MHFE read the container as these words, written out in full.",
      copy,
    );
  const checked = facts.builtInCheckLengths.length > 0 ? "" : " (no built-in check)";
  target.append(
    paragraph(
      `Format ${facts.suiteId}${checked} · ${fingerprintLine(facts.containerFingerprint, "container")} If it ` +
        "differs from the one noted when the container was made, a word is miscopied: press Cancel and check " +
        "the words.",
      "field-note",
    ),
  );
}

/**
 * Reads the container in `field` whenever it changes, for the fields that adapt to it, such as
 * the lengths its phrase can have; a container that cannot be read is reported when the
 * operation starts.
 */
export function adaptToContainer(
  engine: MhfeEngine,
  field: ContainerField,
  adapt: (facts: MhfeContainerFacts) => void,
): void {
  const inputs = new InputRevision(field.textarea, () => undefined);
  field.textarea.addEventListener("change", () => {
    const current = inputs.capture();
    const container = field.value;
    void engine
      .client()
      .then((client) => client.readContainer(container))
      .then(
        (facts) => {
          if (current()) adapt(facts);
        },
        () => undefined,
      );
  });
}

export class MhfeDecodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-decrypt-status");
  readonly #result = required<HTMLElement>("#mhfe-decrypt-result");
  readonly #readBack = required<HTMLElement>("#mhfe-decrypt-read");
  readonly #container: ContainerField;
  readonly #length: PhraseLengthChoice;
  readonly #password: ContainerPassword;
  readonly #marked: MarkedContainer;
  readonly #task: MhfeTask;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#result.dataset.resultInteraction = "";
    this.#engine = engine;
    this.#container = new ContainerField("mhfe-container", this.#status);
    this.#length = new PhraseLengthChoice(
      engine,
      required<HTMLSelectElement>("#mhfe-decrypt-source-words"),
      { lengths: "all", detectFirst: true },
    );
    this.#password = new ContainerPassword(engine, "decrypt", "MHFE password");
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "decrypt",
      field: this.#container,
      status: this.#status,
      recovery: this.#password,
      resume: () => this.#start(),
    });
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-decrypt-stop"),
      name: "MHFE recovery",
      failure: "MHFE recovery failed.",
      inputs: required<HTMLElement>("#mhfe-restore-panel"),
      onEdit: () => {
        this.#result.replaceChildren();
        this.#readBack.replaceChildren();
      },
    });
    adaptToContainer(engine, this.#container, (facts) => this.#length.adapt(facts));
    required<HTMLButtonElement>("#mhfe-decrypt").addEventListener("click", () => this.#start());
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#result.replaceChildren();
    this.#readBack.replaceChildren();
    void this.#task.run((run) => this.#decrypt(run));
  }

  async #decrypt(run: MhfeRun): Promise<void> {
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    this.#length.adapt(facts);
    showContainerFacts(this.#readBack, this.#container.value, facts, this.#context.writeClipboard);
    const words = this.#length.value();
    const { settings, outcome } = await this.#password.reviewed(run);
    const { password } = this.#password;
    const progress = await run.step(() => this.#engine.progress(RECOVER_STAGES));

    const recovery = await run.step(() =>
      client.decrypt({
        container: facts.container,
        ...settings,
        words,
        onProgress: progressCallback(run, progress, this.#status, password.input),
      }),
    );
    const { walletCheckBits } = await run.step(() => this.#engine.walletParameters());
    this.#showRecovery(recovery, facts.offersWalletCheck, walletCheckBits);
    this.#status.textContent =
      recovery.kind === "ambiguous"
        ? "Several lengths passed their check, which happens by accident for about one container in four " +
          "billion. Every candidate is shown: compare each with your wallet, or select the known length."
        : `Recovery complete in ${progress.elapsed()}.${outcome}`;
    this.#status.classList.toggle("warning", recovery.kind === "ambiguous");
  }

  #showRecovery(recovery: MhfeRecovery, offersWalletCheck: boolean, checkBits: number): void {
    recovery.candidates.forEach((candidate, index) => {
      if (recovery.kind === "ambiguous") {
        const heading = document.createElement("h3");
        heading.textContent = `${candidate.words}-word candidate`;
        this.#result.append(heading);
      }
      const { text, verified } = candidateSummary(candidate);
      const summary = document.createElement("div");
      summary.className = verified ? "success-callout" : "warning-callout";
      summary.textContent = text;
      this.#result.append(summary);
      if (candidate.statedWords !== null)
        this.#result.append(
          paragraph(statedLengthDiffers(candidate.words, candidate.statedWords), "warning-callout"),
        );
      if (candidate.otherLengths.length > 0)
        this.#result.append(paragraph(otherLengthsPass(candidate.otherLengths), "field-note"));
      // Every 24-word reading is tested without a passphrase (decrypt's default).
      if (candidate.walletCheck === true)
        this.#result.append(paragraph(passesWalletCheck(checkBits), "success-callout"));
      else if (candidate.walletCheck === false)
        this.#result.append(paragraph(failsWalletCheck(checkBits), "field-note"));
      renderPhrase(
        this.#result,
        candidate.phrase,
        candidate.fingerprintWithoutPassphrase,
        "withoutPassphrase",
        this.#context,
      );
      if (offersWalletCheck && candidate.words === 24)
        this.#result.append(this.#walletCheck(candidate, index, checkBits));
    });
    this.#result.append(this.#doneButton());
  }

  /** The phrase and passphrase check of a recovered 24-word phrase, a quick call on request. */
  #walletCheck(candidate: MhfeCandidate, index: number, checkBits: number): HTMLElement {
    const block = document.createElement("div");
    block.className = "mhfe-wallet-check";
    const id = `mhfe-decrypt-wallet-check-passphrase-${index}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Is a BIP39 passphrase used with the original seed phrase? Type it to test";
    const why = paragraph(WALLET_CHECK_EXPLANATION, "field-note");
    const input = document.createElement("input");
    input.id = id;
    input.type = "password";
    input.autocomplete = "off";
    const run = document.createElement("button");
    run.type = "button";
    run.className = "secondary compact";
    run.textContent = "Test the check";
    const answer = paragraph("", "field-note");
    answer.setAttribute("role", "status");
    run.addEventListener("click", () => {
      run.disabled = true;
      void this.#engine
        .wallet()
        .then((wallet) => wallet.walletCheck({ phrase: candidate.phrase, passphrase: input.value }))
        .then(
          (passes) => {
            answer.textContent = passes
              ? `Passes the ${checkBits}-bit check with this passphrase: a wrong password or ` +
                `passphrase still passes about once in ${walletCheckOdds(checkBits)}. It does not prove the ` +
                "wallet; compare an address."
              : `Does not pass the ${checkBits}-bit check with this passphrase. This matters only if ` +
                "the wallet was made with the check: then the password, a setting or the passphrase is wrong.";
          },
          (cause: unknown) => {
            answer.textContent = describe(cause, "The check failed.");
          },
        )
        .finally(() => {
          input.value = "";
          run.disabled = false;
        });
    });
    block.append(why, label, input, run, answer);
    return block;
  }

  /** Removes the recovered phrases from the screen, as the command-line tool does at the end. */
  #doneButton(): HTMLElement {
    const done = document.createElement("button");
    done.type = "button";
    done.className = "secondary compact";
    done.textContent = "Done: remove the phrase from the screen";
    done.addEventListener("click", () => {
      this.#result.replaceChildren(
        paragraph(
          "Recovered. The seed phrase is no longer on the screen. When you are done, close this page: the " +
            "browser cannot wipe what it showed.",
          "field-note",
        ),
      );
      this.#readBack.replaceChildren();
    });
    return done;
  }
}
