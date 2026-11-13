import { RenderedSecrets } from "./secrets.js";
// The Decode tab of the MHFE panel: a container and one or more passwords back into their BIP39
// phrases, as mhfe decrypt recovers them. Every question comes before the work: the passwords and
// the repair of each, and for a 24-word container the original seed phrase's BIP39 passphrase for
// the 16-bit check. Each password is then recovered in turn, and its phrases show under it at once
// while the next one runs. Each recovered phrase comes with its status, its fingerprint and, for
// 24 words, the outcome of the 16-bit check; the page never calls a check by itself.
import type {
  MhfeCandidate,
  MhfeContainerFacts,
  MhfeRecovery,
} from "@ckd/recovery-mhfe-wasm/core/client.js";
import { MhfeContainerPreview } from "./recovery-mhfe-container-preview.js";
import { assertRunsHere, MemoryLevelField, MhfeCommandView } from "./recovery-mhfe-command.js";
import { DecryptCommandSource } from "./recovery-mhfe-command-sources.js";
import { fingerprintLine, renderPhrase } from "./recovery-mhfe-cards.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { DecryptPasswords } from "./recovery-mhfe-decrypt-passwords.js";
import {
  ContainerField,
  ContainerPassword,
  PasswordField,
  PhraseLengthChoice,
} from "./recovery-mhfe-fields.js";
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
import { MhfeTask, type MhfeTaskOutcome } from "./recovery-mhfe-task.js";
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

export class MhfeDecodeTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-decrypt-status");
  readonly #result = required<HTMLElement>("#mhfe-decrypt-result");
  readonly #readBack = required<HTMLElement>("#mhfe-decrypt-read");
  readonly #container: ContainerField;
  readonly #length: PhraseLengthChoice;
  readonly #password: ContainerPassword;
  readonly #passwords: DecryptPasswords;
  /** The original seed phrase's BIP39 passphrase for the 16-bit check of a 24-word reading. */
  readonly #checkPassphrase = new PasswordField(
    "mhfe-decrypt-check-passphrase",
    "BIP39 passphrase",
  );
  readonly #checkPassphraseField = required<HTMLElement>("#mhfe-decrypt-check-passphrase-field");
  readonly #sourceWords = required<HTMLSelectElement>("#mhfe-decrypt-source-words");
  /** Whether the container read last is of 24 words, whose readings take the 16-bit check. */
  #offersWalletCheck = false;
  /** The lengths with a built-in check of the container read last. */
  #builtInCheckLengths: readonly number[] = [];
  readonly #marked: MarkedContainer;
  readonly #task: MhfeTask;
  readonly #preview: MhfeContainerPreview;
  readonly #commandSource: DecryptCommandSource;
  readonly #command: MhfeCommandView;

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
    this.#passwords = new DecryptPasswords(engine, this.#password);
    required<HTMLElement>("#mhfe-decrypt-check-passphrase-note").textContent =
      `${WALLET_CHECK_EXPLANATION} Leave it empty for none.`;
    this.#sourceWords.addEventListener("change", () => this.#adaptToLength());
    this.#commandSource = new DecryptCommandSource(
      "decrypt",
      new MemoryLevelField("decrypt"),
      () => this.#passwords.used.map(({ pim }) => pim),
      this.#length,
    );
    this.#command = new MhfeCommandView(context, engine, this.#commandSource, {
      prefix: "decrypt",
      panel: required<HTMLElement>("#mhfe-restore-panel"),
      gated: [
        required<HTMLButtonElement>("#mhfe-decrypt"),
        required<HTMLButtonElement>("#mhfe-decrypt-missing-run"),
      ],
    });
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "decrypt",
      field: this.#container,
      status: this.#status,
      recovery: this.#password,
      // Refused before the container is read: the package would work at level 0.
      guard: () => assertRunsHere(this.#commandSource),
      resume: () => this.#start(),
    });
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-decrypt-stop"),
      name: "MHFE recovery",
      failure: "MHFE recovery failed.",
      inputs: required<HTMLElement>("#mhfe-restore-panel"),
      onEdit: () => {
        RenderedSecrets.replace(this.#result);
        this.#readBack.replaceChildren();
      },
    });
    this.#preview = new MhfeContainerPreview(engine, this.#container, this.#status, (facts) => {
      this.#length.adapt(facts);
      this.#adaptToContainer(facts);
      this.#command.refresh();
    });
    required<HTMLButtonElement>("#mhfe-decrypt").addEventListener("click", () => this.#start());
  }

  #adaptToContainer(
    facts: Pick<MhfeContainerFacts, "offersWalletCheck" | "builtInCheckLengths">,
  ): void {
    this.#offersWalletCheck = facts.offersWalletCheck;
    this.#builtInCheckLengths = facts.builtInCheckLengths;
    this.#adaptToLength();
  }

  /**
   * As mhfe decrypt asks: a stated length with a built-in check takes one password, the
   * container's own, and gives no 24-word reading, so the 16-bit check's passphrase is not asked.
   */
  #adaptToLength(): void {
    const checked = this.#builtInCheckLengths.includes(Number(this.#sourceWords.value));
    this.#passwords.single = checked;
    this.#checkPassphraseField.hidden = !this.#offersWalletCheck || checked;
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#preview.retire();
    RenderedSecrets.replace(this.#result);
    this.#readBack.replaceChildren();
    void this.#task.run((run) => this.#decrypt(run));
  }

  async #decrypt(run: MhfeRun): Promise<MhfeTaskOutcome> {
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    this.#length.adapt(facts);
    this.#adaptToContainer(facts);
    showContainerFacts(this.#readBack, this.#container.value, facts, this.#context.writeClipboard);
    const words = this.#length.value();
    const used = this.#passwords.used;
    const whose = (index: number): string => (used.length > 1 ? `Password ${index + 1}: ` : "");
    // Every PIM is settled before any review, and every password with its repair before the first
    // recovery, as mhfe asks: a PIM that cannot be used is named before any password runs its work.
    for (const [index, password] of used.entries()) await password.settledPim(run, whose(index));
    const reviewed = [];
    for (const [index, password] of used.entries()) {
      const review = await password.reviewed(run, whose(index));
      if ("wait" in review) return review;
      reviewed.push({ fields: password, ...review });
    }
    const several = reviewed.length > 1;
    // The field is emptied once the work starts; each 24-word reading says how it was checked.
    const passphrase = this.#checkPassphraseField.hidden ? "" : this.#checkPassphrase.value;
    const { walletCheckBits } = await run.step(() => this.#engine.walletParameters());
    let ambiguous = false;
    for (const [index, { fields, settings, outcome }] of reviewed.entries()) {
      // With several passwords each has its heading and its own progress line, above its phrases.
      let progressLine = this.#status;
      if (several) {
        const heading = document.createElement("h3");
        heading.className = "mhfe-password-heading";
        heading.textContent = `Password ${index + 1}`;
        progressLine = paragraph("Starting.", "status");
        this.#result.append(heading, progressLine);
        if (outcome !== "") this.#result.append(paragraph(outcome.trim(), "field-note"));
        this.#status.textContent = `Recovering the seed phrase of password ${index + 1}.`;
      }
      const progress = await run.step(() => this.#engine.progress(RECOVER_STAGES));
      const recovery = await run.step(() =>
        client.decrypt({
          container: facts.container,
          ...settings,
          words,
          passphrase,
          onProgress: progressCallback(
            run,
            progress,
            progressLine,
            fields.password.input,
            this.#checkPassphrase.input,
          ),
        }),
      );
      const elapsed = `Recovered in ${progress.elapsed()}.`;
      if (several) progressLine.textContent = elapsed;
      else this.#status.textContent = `Recovery complete in ${progress.elapsed()}.${outcome}`;
      this.#showRecovery(recovery, facts.offersWalletCheck, walletCheckBits, {
        password: index,
        withPassphrase: passphrase !== "",
      });
      ambiguous ||= recovery.kind === "ambiguous";
    }
    this.#result.append(this.#doneButton());
    if (ambiguous)
      this.#status.textContent =
        "Several lengths passed their check, which happens by accident for about one container in four " +
        "billion. Every candidate is shown: compare each with your wallet, or select the known length.";
    else if (several)
      this.#status.textContent = "Recovery complete: the seed phrases of every password are below.";
    this.#status.classList.toggle("warning", ambiguous);
  }

  /**
   * The readings of one password; `checked` numbers it among the passwords and says whether its
   * 24-word readings were checked with a passphrase.
   */
  #showRecovery(
    recovery: MhfeRecovery,
    offersWalletCheck: boolean,
    checkBits: number,
    checked: { readonly password: number; readonly withPassphrase: boolean },
  ): void {
    recovery.candidates.forEach((candidate, index) => {
      if (recovery.kind === "ambiguous") {
        const heading = document.createElement("h3");
        heading.textContent = `${candidate.words}-word candidate`;
        this.#result.append(heading);
      }
      const { text, verified, hint } = candidateSummary(candidate);
      const summary = document.createElement("div");
      summary.className = verified ? "success-callout" : "warning-callout";
      summary.textContent = text;
      this.#result.append(summary);
      if (hint !== undefined) this.#result.append(paragraph(hint, "field-note"));
      if (candidate.statedWords !== null)
        this.#result.append(
          paragraph(statedLengthDiffers(candidate.words, candidate.statedWords), "warning-callout"),
        );
      if (candidate.otherLengths.length > 0)
        this.#result.append(paragraph(otherLengthsPass(candidate.otherLengths), "field-note"));
      // Every 24-word reading is tested, with the passphrase given or without one.
      if (candidate.walletCheck === true)
        this.#result.append(
          paragraph(passesWalletCheck(checkBits, checked.withPassphrase), "success-callout"),
        );
      else if (candidate.walletCheck === false)
        this.#result.append(
          paragraph(failsWalletCheck(checkBits, checked.withPassphrase), "field-note"),
        );
      renderPhrase(
        this.#result,
        candidate.phrase,
        candidate.fingerprintWithoutPassphrase,
        "withoutPassphrase",
        this.#context,
      );
      if (offersWalletCheck && candidate.words === 24)
        this.#result.append(
          this.#walletCheck(candidate, `${checked.password}-${index}`, checkBits),
        );
    });
  }

  /** The phrase and passphrase check of a recovered 24-word phrase, a quick call on request. */
  #walletCheck(candidate: MhfeCandidate, key: string, checkBits: number): HTMLElement {
    const block = document.createElement("div");
    block.className = "mhfe-wallet-check";
    const id = `mhfe-decrypt-wallet-check-passphrase-${key}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Test the check with another BIP39 passphrase of the original seed phrase";
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
    block.append(label, input, run, answer);
    return block;
  }

  /** Removes the recovered phrases from the screen, as the command-line tool does at the end. */
  #doneButton(): HTMLElement {
    const done = document.createElement("button");
    done.type = "button";
    done.className = "secondary compact";
    done.textContent = "Done: remove the phrase from the screen";
    done.addEventListener("click", () => {
      RenderedSecrets.replace(
        this.#result,
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
