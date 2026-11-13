import { MhfeCheckResult } from "@ckd/recovery-backup/mhfe-check-result.js";
// The Check tab of the MHFE panel: rehearses a recovery and compares it with the wallet without
// showing the phrase. It runs only when the user presses its button: a rehearsal takes as long as a
// recovery. Its verdict belongs to the fields it checked: an edit removes it, and a check whose
// fields changed while it ran shows no verdict.
import type { MhfeNoLengthAnswer, MhfeReference } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type {
  MhfeCheckEvidence,
  MhfeCheckOutcome,
} from "@ckd/recovery-backup/mhfe-check-result.js";
import { InputRevision } from "./recovery-input-revision.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { showContainerFacts } from "./recovery-mhfe-decode.js";
import { MhfeContainerPreview } from "./recovery-mhfe-container-preview.js";
import { assertRunsHere, MemoryLevelField, MhfeCommandView } from "./recovery-mhfe-command.js";
import { CheckCommandSource } from "./recovery-mhfe-command-sources.js";
import { ContainerField, ContainerPassword, PhraseLengthChoice } from "./recovery-mhfe-fields.js";
import { MarkedContainer } from "./recovery-mhfe-marked-container.js";
import { NoLengthQuestion } from "./recovery-mhfe-no-length.js";
import { WalletReferenceField, type ReferenceKind } from "./recovery-mhfe-reference.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { CHECK_STAGES, progressCallback } from "./recovery-mhfe-status.js";
import { MhfeTask, type MhfeTaskOutcome } from "./recovery-mhfe-task.js";
import { paragraph, required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/**
 * What detection may not find in a check, beside its answer, as `mhfe check` says it
 * (src/bin/mhfe/check.rs, DETECTION_MISSES): a 24-word phrase has no built-in check, and the
 * phrase + passphrase check finds only one drawn with it.
 */
const DETECTION_MISSES = "24 words only by the passphrase check";

/** What a match of each kind does not prove, said under its list, from the command-line tool. */
const MATCH_LIMITS: Partial<Record<ReferenceKind, string>> = {
  fingerprint: "A fingerprint is a quick 32-bit check; an address is stronger.",
  builtInCheck: "It does not prove the wallet or its passphrase; an address does.",
  walletCheck: "It does not prove the wallet; an address does.",
};

/** What the same recovery also showed: the original seed phrase's own checks (check().evidence). */
export type CheckEvidence = MhfeCheckEvidence;

/** Shared presentation of the package's ordered check evidence. */
export const matchedLines = MhfeCheckResult.lines;

/** The status line when the fields changed during a check: its verdict is not theirs. */
const INPUTS_CHANGED =
  "The fields changed while the check ran, so its result was dropped. Press Rehearse the recovery " +
  "to check them as they are now.";

/** Why it does not match, for each kind of reference. */
function noMatchHint(kind: ReferenceKind | undefined): string {
  if (kind === "builtInCheck")
    return "The password, a setting, the container or the word count is wrong.";
  if (kind === "walletCheck")
    return "If the phrase was drawn with this check, the password, a setting or the passphrase is wrong.";
  return "The password, a setting, the container, passphrase or reference is wrong.";
}

export class MhfeCheckTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #status = required<HTMLElement>("#mhfe-check-status");
  readonly #readBack = required<HTMLElement>("#mhfe-check-read");
  readonly #result = required<HTMLElement>("#mhfe-check-result");
  readonly #container: ContainerField;
  readonly #password: ContainerPassword;
  readonly #length: PhraseLengthChoice;
  readonly #reference: WalletReferenceField;
  readonly #noLength: NoLengthQuestion;
  readonly #inputs: InputRevision;
  readonly #marked: MarkedContainer;
  readonly #task: MhfeTask;
  readonly #preview: MhfeContainerPreview;
  /** What a search for missing words matched the container's own wallet by, for the next result. */
  #foundBy: string | undefined;
  /** Whether the container read last has the phrase + passphrase check: 24 words. */
  #offersWalletCheck = false;
  readonly #commandSource: CheckCommandSource;
  readonly #command: MhfeCommandView;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    this.#container = new ContainerField("mhfe-check-container", this.#status);
    this.#password = new ContainerPassword(engine, "check", "MHFE password");
    this.#length = new PhraseLengthChoice(
      engine,
      required<HTMLSelectElement>("#mhfe-check-words"),
      {
        lengths: "builtIn",
        misses: DETECTION_MISSES,
      },
    );
    this.#reference = new WalletReferenceField(engine, "check");
    this.#noLength = new NoLengthQuestion(engine, "check", this.#status);
    this.#commandSource = new CheckCommandSource(
      new MemoryLevelField("check"),
      this.#password.pim,
      this.#length,
      this.#reference,
    );
    this.#command = new MhfeCommandView(context, engine, this.#commandSource, {
      prefix: "check",
      panel: required<HTMLElement>("#mhfe-check-panel"),
      gated: [
        required<HTMLButtonElement>("#mhfe-check"),
        required<HTMLButtonElement>("#mhfe-check-missing-run"),
      ],
    });
    // The coin chosen once the list loads, Dash at once in the Dash edition, goes into --coin.
    this.#reference.onCoinsLoaded(() => this.#command.refresh());
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "check",
      field: this.#container,
      status: this.#status,
      recovery: this.#password,
      // Refused before the container is read: the package would work at level 0.
      guard: () => assertRunsHere(this.#commandSource),
      resume: (foundBy) => {
        this.#foundBy = foundBy;
        this.#start();
      },
    });
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-check-stop"),
      name: "MHFE check",
      failure: "The MHFE check failed.",
    });
    // A verdict and the words read back belong to the fields they came from; any edit removes them.
    this.#inputs = new InputRevision(required<HTMLElement>("#mhfe-check-panel"), () =>
      this.#clearOutcome(),
    );
    this.#inputs.bindPageLifetime();
    // The built-in check and the wallet check exist only in a 24-word container.
    this.#preview = new MhfeContainerPreview(engine, this.#container, this.#status, (facts) => {
      this.#length.adapt(facts);
      this.#reference.offer("builtInCheck", facts.builtInCheckLengths.length > 0);
      this.#offersWalletCheck = facts.offersWalletCheck;
      this.#offerWalletCheck();
      this.#command.refresh();
    });
    // As mhfe check offers it: the phrase + passphrase check only once a passphrase is typed.
    this.#reference.passphrase.input.addEventListener("input", () => this.#offerWalletCheck());
    this.#offerWalletCheck();
    // Detection takes the original seed phrase's passphrase, if it has one, as the wallet check does.
    this.#length.onChange(() => this.#reference.askPassphrase(this.#detects()));
    // A container phrase typed again was not found by that search.
    this.#container.textarea.addEventListener("input", () => {
      this.#foundBy = undefined;
    });
    required<HTMLButtonElement>("#mhfe-check").addEventListener("click", () => this.#start());
  }

  #offerWalletCheck(): void {
    this.#reference.offer(
      "walletCheck",
      this.#offersWalletCheck && this.#reference.passphrase.value !== "",
    );
  }

  #detects(): boolean {
    try {
      return this.#reference.kind === "builtInCheck" && this.#length.value() === 0;
    } catch {
      return false;
    }
  }

  #clearOutcome(): void {
    this.#result.replaceChildren();
    this.#readBack.replaceChildren();
  }

  #start(): void {
    if (!this.#task.available) return;
    this.#preview.retire();
    const current = this.#inputs.capture();
    this.#clearOutcome();
    void this.#task.run((run) => this.#check(run, current), {
      current: () => this.#stillCurrent(current),
    });
  }

  /** False, with the status line saying why, once the fields changed after the check started. */
  #stillCurrent(current: () => boolean): boolean {
    if (current()) return true;
    this.#status.textContent = INPUTS_CHANGED;
    return false;
  }

  /** The reference the package compares with; the built-in check takes the length chosen. */
  #compared(): MhfeReference {
    if (this.#reference.kind !== "builtInCheck") return this.#reference.reference();
    return { words: this.#length.value() as 0 | 12 | 15 | 18 | 21 };
  }

  async #check(run: MhfeRun, current: () => boolean): Promise<MhfeTaskOutcome> {
    // The level first, as the other tabs refuse it: the reference is refused before the read too.
    assertRunsHere(this.#commandSource);
    const kind = this.#reference.kind;
    const reference = this.#compared();
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    if (!this.#stillCurrent(current)) return;
    showContainerFacts(this.#readBack, this.#container.value, facts, this.#context.writeClipboard);
    const reviewed = await this.#password.reviewed(run);
    if ("wait" in reviewed) return reviewed;
    const { settings } = reviewed;
    // Minutes of work are not started for fields that have changed meanwhile.
    if (!this.#stillCurrent(current)) return;
    const passphraseField = this.#reference.passphrase;
    // The field is emptied once the work starts; whether one was given is said in the result.
    const passphrase = passphraseField.value;
    const detects = "words" in reference && reference.words === 0;
    const progress = await run.step(() => this.#engine.progress(CHECK_STAGES));
    const search = kind === "address" ? ` ${this.#reference.searchText}` : "";
    this.#status.textContent = `Starting.${search}`;

    // A detection that found no length compares a 24-word phrase with the wallet given then.
    let comparedBy = kind;
    const askLength = async (): Promise<MhfeNoLengthAnswer | null> => {
      const answer = await this.#noLength.ask(run, passphrase);
      if (answer !== null && !("words" in answer))
        comparedBy = "address" in answer ? "address" : "fingerprint";
      return answer;
    };
    const outcome = await run.step(() =>
      client.check({
        container: facts.container,
        ...settings,
        reference,
        ...(kind === "address" || kind === "fingerprint" || kind === "walletCheck" || detects
          ? { passphrase }
          : {}),
        ...(detects ? { onNoLength: askLength } : {}),
        onProgress: progressCallback(
          run,
          progress,
          this.#status,
          this.#password.password.input,
          passphraseField.input,
        ),
      }),
    );
    if (!this.#stillCurrent(current)) return;
    const foundBy = this.#foundBy;
    const { walletCheckBits } = await run.step(() => this.#engine.walletParameters());
    if (!this.#stillCurrent(current)) return;
    this.#status.textContent = `Check complete in ${progress.elapsed()}.`;
    this.#foundBy = undefined;
    this.#showOutcome(comparedBy, outcome, passphrase !== "", foundBy, walletCheckBits);
  }

  #showOutcome(
    kind: ReferenceKind | undefined,
    outcome: {
      readonly outcome: MhfeCheckOutcome;
      readonly evidence: MhfeCheckEvidence;
      readonly path: string | null;
      readonly withoutPassphrase: boolean;
    },
    passphraseTyped: boolean,
    foundBy: string | undefined,
    checkBits: number,
  ): void {
    // The wallet that matched, or else the one compared first, as mhfe check names it.
    const withPassphrase = passphraseTyped && !outcome.withoutPassphrase;
    const verdict = MhfeCheckResult.verdict(outcome.outcome);
    this.#result.append(
      paragraph(verdict.text, verdict.matched ? "success-callout" : "warning-callout"),
    );
    if (!verdict.matched) {
      if (outcome.outcome === "does not match")
        this.#result.append(paragraph(noMatchHint(kind), "field-note"));
      for (const line of matchedLines(
        kind ?? "builtInCheck",
        outcome.evidence,
        withPassphrase,
        foundBy,
        checkBits,
      ))
        this.#result.append(paragraph(line, "field-note"));
      return;
    }
    if (kind !== undefined) {
      const list = document.createElement("ul");
      list.className = "mhfe-check-evidence";
      for (const line of matchedLines(kind, outcome.evidence, withPassphrase, foundBy, checkBits)) {
        const item = document.createElement("li");
        item.textContent = `✓ ${line}`;
        list.append(item);
      }
      this.#result.append(list);
    }
    if (outcome.path !== null)
      this.#result.append(paragraph(`Found at ${outcome.path}.`, "field-note"));
    if (outcome.withoutPassphrase)
      this.#result.append(
        paragraph(
          MhfeCheckResult.passphraseNote(kind, outcome.evidence, checkBits),
          "warning-callout mhfe-passphrase-note",
        ),
      );
    const limit = kind === undefined ? undefined : MATCH_LIMITS[kind];
    if (limit !== undefined) this.#result.append(paragraph(limit, "field-note"));
  }
}
