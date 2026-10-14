// The Check tab of the MHFE panel: rehearses a recovery and compares it with the wallet without
// showing the phrase. It runs only when the user presses its button: a rehearsal takes as long as a
// recovery. Its verdict belongs to the fields it checked: an edit removes it, and a check whose
// fields changed while it ran shows no verdict.
import type { MhfeNoLengthAnswer, MhfeReference } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { InputRevision } from "./recovery-input-revision.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { adaptToContainer, showContainerFacts } from "./recovery-mhfe-decode.js";
import { ContainerField, ContainerPassword, PhraseLengthChoice } from "./recovery-mhfe-fields.js";
import { MarkedContainer } from "./recovery-mhfe-marked-container.js";
import { NoLengthQuestion } from "./recovery-mhfe-no-length.js";
import { WalletReferenceField, type ReferenceKind } from "./recovery-mhfe-reference.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { CHECK_STAGES, progressCallback } from "./recovery-mhfe-status.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
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
export interface CheckEvidence {
  readonly builtInCheck: number | null;
  readonly walletCheck: boolean | null;
}

function walletCheckLine(bits: number): string {
  return `the phrase + passphrase check: its first ${bits} bits are zero`;
}

function builtInLine(words: number): string {
  return `the built-in check of a ${words}-word original seed phrase`;
}

/**
 * Every check of a match, one a line, as `mhfe check` lists them (src/bin/mhfe/check.rs,
 * matched_lines): the container phrase's BIP39 checksum; the wallet a search for missing words
 * matched, `foundBy`; the reference compared with; and the original seed phrase's own checks beside
 * it, only where they pass, as a phrase drawn without the phrase + passphrase check fails it.
 */
export function matchedLines(
  kind: ReferenceKind,
  evidence: CheckEvidence,
  withPassphrase: boolean,
  foundBy: string | undefined,
  checkBits: number,
): string[] {
  const passphrase = withPassphrase ? "with this BIP39 passphrase" : "without a BIP39 passphrase";
  const lines = ["the container phrase passes its BIP39 checksum"];
  if (foundBy !== undefined) lines.push(foundBy);
  if (kind === "address") lines.push(`the receiving address of the wallet, ${passphrase}`);
  else if (kind === "fingerprint")
    lines.push(`the master key fingerprint of the wallet, ${passphrase}`);
  else if (kind === "walletCheck") lines.push(walletCheckLine(checkBits));
  // The built-in check says its length itself, the one detected too.
  if (evidence.builtInCheck !== null) lines.push(builtInLine(evidence.builtInCheck));
  if (evidence.walletCheck === true && kind !== "walletCheck")
    lines.push(walletCheckLine(checkBits));
  return lines;
}

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
  /** What a search for missing words matched the container's own wallet by, for the next result. */
  #foundBy: string | undefined;

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
    this.#marked = new MarkedContainer(context, engine, {
      prefix: "check",
      field: this.#container,
      status: this.#status,
      recovery: this.#password,
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
    adaptToContainer(engine, this.#container, (facts) => {
      this.#length.adapt(facts);
      this.#reference.offer("builtInCheck", facts.builtInCheckLengths.length > 0);
      this.#reference.offer("walletCheck", facts.offersWalletCheck);
    });
    // Detection takes the original seed phrase's passphrase, if it has one, as the wallet check does.
    this.#length.onChange(() => this.#reference.askPassphrase(this.#detects()));
    // A container phrase typed again was not found by that search.
    this.#container.textarea.addEventListener("input", () => {
      this.#foundBy = undefined;
    });
    required<HTMLButtonElement>("#mhfe-check").addEventListener("click", () => this.#start());
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

  async #check(run: MhfeRun, current: () => boolean): Promise<void> {
    const kind = this.#reference.kind;
    const reference = this.#compared();
    const read = await this.#marked.read(run);
    if (read === undefined) return;
    const { client, facts } = read;
    if (!this.#stillCurrent(current)) return;
    showContainerFacts(this.#readBack, this.#container.value, facts, this.#context.writeClipboard);
    const { settings } = await this.#password.reviewed(run);
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
    outcome: { matches: boolean; path: string | null; evidence: CheckEvidence },
    withPassphrase: boolean,
    foundBy: string | undefined,
    checkBits: number,
  ): void {
    if (!outcome.matches) {
      this.#result.append(
        paragraph("✗ Does not match.", "warning-callout"),
        paragraph(noMatchHint(kind), "field-note"),
      );
      return;
    }
    this.#result.append(paragraph("✓ Matches", "success-callout"));
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
    const limit = kind === undefined ? undefined : MATCH_LIMITS[kind];
    if (limit !== undefined) this.#result.append(paragraph(limit, "field-note"));
  }
}
