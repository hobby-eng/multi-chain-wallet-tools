// Input fields that the MHFE operation tabs share: the PIM with its checkbox, a password with its
// Show button, the check word review of a password, its strength warning, a container field, the
// password and PIM of a container to recover, the length of its original seed phrase and the
// repair word choice. Each owns its elements; the rules come from the package's classes.
import type { MhfeContainerFacts, WordCount } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfePasswordReview } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import type { MhfePasswordRepair } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { AwaitingAnswer } from "./recovery-mhfe-task.js";
import {
  reviewAnswers,
  reviewExplanation,
  reviewNeedsChoice,
  reviewOutcome,
  type ReviewAnswer,
} from "./recovery-mhfe-status.js";
import { installFieldImports, installSecretToggle, required } from "./recovery-workspace-shared.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";

/** The status line of a review dropped because the password changed while it ran. */
const REVIEW_DROPPED = "The password changed while it was reviewed. Press the button again.";
/** The error of an answer used after the password changed, between the review and the long work. */
const REVIEW_OUTDATED = "The password changed after it was reviewed. Press the button again.";

/** A PIM field shown only while its "Use a custom PIM" checkbox is ticked; unticked means PIM 0. */
export class PimField {
  readonly #checkbox: HTMLInputElement;
  readonly #input: HTMLInputElement;

  /** `prefix` names the field, as in `#mhfe-{prefix}-pim`. */
  constructor(prefix: string) {
    this.#checkbox = required<HTMLInputElement>(`#mhfe-${prefix}-use-pim`);
    this.#input = required<HTMLInputElement>(`#mhfe-${prefix}-pim`);
    const field = required<HTMLElement>(`#mhfe-${prefix}-pim-field`);
    const synchronize = (): void => {
      field.hidden = !this.#checkbox.checked;
    };
    this.#checkbox.addEventListener("change", synchronize);
    synchronize();
  }

  /** The PIM to send; the package refuses one out of range with its own message. */
  value(): number {
    return this.#checkbox.checked ? Number(this.#input.value) : 0;
  }

  set disabled(disabled: boolean) {
    this.#checkbox.disabled = disabled;
    this.#input.disabled = disabled;
  }
}

/** A password or passphrase input with a Show/Hide button; `label` names it for screen readers. */
export class PasswordField {
  readonly input: HTMLInputElement;
  readonly #toggle: HTMLButtonElement;
  readonly #label: string;

  constructor(id: string, label: string) {
    this.input = required<HTMLInputElement>(`#${id}`);
    this.#toggle = required<HTMLButtonElement>(`#toggle-${id}`);
    this.#label = label;
    this.#toggle.addEventListener("click", () => {
      this.input.type = this.input.type === "password" ? "text" : "password";
      this.#render();
    });
    RecoverySecretLifecycle.register(this.#toggle, () => {
      this.input.type = "password";
      this.#render();
    });
    this.#render();
  }

  get value(): string {
    return this.input.value;
  }

  clear(): void {
    this.input.value = "";
  }

  #render(): void {
    const revealed = this.input.type === "text";
    this.#toggle.textContent = revealed ? "Hide" : "Show";
    this.#toggle.setAttribute("aria-pressed", String(revealed));
    this.#toggle.setAttribute("aria-label", `${revealed ? "Hide" : "Show"} ${this.#label}`);
  }
}

/** The choice of a review, or why the operation must wait. */
export type ReviewResult = ReviewChoice | { readonly wait: string };

/** The repair chosen for the password in the fields, and the line that says what it did. */
export interface ReviewChoice {
  readonly repair: MhfePasswordRepair;
  readonly outcome: string;
}

/** What a review did, as the end of a status line: " Password: …", or nothing. */
export function reviewSaid(choice: ReviewChoice): string {
  return choice.outcome === "" ? "" : ` ${choice.outcome}`;
}

/**
 * The check word review of one password (MHFE-PASSWORD-CHECK-1), asked before any long work. A
 * password whose review needs no answer goes on at once. Otherwise the answers are shown, in the
 * package's order, and the user presses the action button again; typing in a password field drops
 * the answers, so that a choice never applies to another text. Typing, or a reset, also drops a
 * review that is still running: its answers would belong to a text no longer in the fields.
 */
export class PasswordReview {
  readonly #engine: MhfeEngine;
  readonly #box: HTMLFieldSetElement;
  readonly #explanation: HTMLElement;
  readonly #answers: HTMLElement;
  readonly #toggle: HTMLButtonElement;
  readonly #fields: readonly PasswordField[];
  readonly #name: string;
  #pending: { text: string; review: MhfePasswordReview; answers: ReviewAnswer[] } | undefined;
  /** Counts resets; a review that sees it move was for a text no longer in the fields. */
  #revision = 0;
  /** The answers given since the last reset; a reset starts a new set, so older ones do not hold. */
  #given = new WeakSet<ReviewChoice>();

  /** `id` is the fieldset's id; `fields` are the entries whose change voids the review. */
  constructor(engine: MhfeEngine, id: string, fields: readonly PasswordField[]) {
    this.#engine = engine;
    this.#box = required<HTMLFieldSetElement>(`#${id}`);
    this.#explanation = required<HTMLElement>(`#${id} .mhfe-review-explanation`);
    this.#answers = required<HTMLElement>(`#${id} .mhfe-review-answers`);
    this.#fields = fields;
    this.#name = `${id}-answer`;
    this.#toggle = required<HTMLButtonElement>(`#toggle-${id}`);
    this.#toggle.addEventListener("click", () =>
      this.#reveal(this.#answers.classList.contains("concealed")),
    );
    RecoverySecretLifecycle.register(this.#toggle, () => this.#reveal(false));
    for (const field of fields) field.input.addEventListener("input", () => this.reset());
    this.reset();
  }

  /** The answers show words of the password, so they stay concealed until the user shows them. */
  #reveal(revealed: boolean): void {
    this.#answers.classList.toggle("concealed", !revealed);
    this.#toggle.textContent = revealed ? "Hide words" : "Show words";
    this.#toggle.setAttribute("aria-pressed", String(revealed));
  }

  /**
   * The repair to pass on, or what the user must do first. `repeat` is a new password's second
   * entry; `run` is the operation's, whose Cancel also stops the review.
   */
  async choose(run: MhfeRun, password: string, repeat?: string): Promise<ReviewResult> {
    const pending = this.#pending;
    if (pending !== undefined && pending.text === password) return this.#chosen(pending);
    // A new review voids the answers of an earlier one, and one still running is dropped.
    this.reset();
    const revision = this.#revision;
    const passwords = await run.step(() => this.#engine.passwords());
    const review = await run.step(() =>
      passwords.review(repeat === undefined ? { password } : { password, passwordRepeat: repeat }),
    );
    if (revision !== this.#revision) return { wait: REVIEW_DROPPED };
    if (!reviewNeedsChoice(review))
      return this.#give({ repair: "asTyped", outcome: reviewOutcome(review, "asTyped") });
    this.#show(password, review);
    return { wait: "Choose how to use the password, then press the button again." };
  }

  /**
   * The repair to pass on; an AwaitingAnswer, which ends the operation quietly, while the person
   * must answer first.
   */
  async require(run: MhfeRun, password: string, repeat?: string): Promise<ReviewChoice> {
    const result = await this.choose(run, password, repeat);
    if ("wait" in result) throw new AwaitingAnswer(result.wait);
    return result;
  }

  /**
   * Throws unless the fields still hold the password that `choice` was given for. A tab calls it
   * right before the long work when an await lies between the review and that work, since typing
   * meanwhile would pair the choice with a text that was never reviewed.
   */
  assertCurrent(choice: ReviewChoice): void {
    if (!this.#given.has(choice)) throw new Error(REVIEW_OUTDATED);
  }

  reset(): void {
    this.#revision += 1;
    this.#given = new WeakSet();
    this.#pending = undefined;
    this.#box.hidden = true;
    this.#answers.replaceChildren();
    this.#reveal(false);
    this.#explanation.textContent = "";
  }

  #chosen(pending: { review: MhfePasswordReview; answers: ReviewAnswer[] }): ReviewResult {
    const selected = this.#answers.querySelector<HTMLInputElement>(
      `input[name="${this.#name}"]:checked`,
    );
    const answer = pending.answers[Number(selected?.value)];
    if (answer === undefined) return { wait: "Choose how to use the password." };
    if (answer.repair === "typeAgain") {
      for (const field of this.#fields) field.clear();
      this.reset();
      this.#fields[0]?.input.focus();
      return { wait: "Type the password again." };
    }
    this.reset();
    return this.#give({
      repair: answer.repair,
      outcome: reviewOutcome(pending.review, answer.repair),
    });
  }

  /** Hands out a choice for the text in the fields now; the next reset withdraws it. */
  #give(choice: ReviewChoice): ReviewChoice {
    this.#given.add(choice);
    return choice;
  }

  #show(text: string, review: MhfePasswordReview): void {
    const answers = reviewAnswers(review);
    this.#explanation.textContent = reviewExplanation(review);
    this.#answers.replaceChildren(
      ...answers.map((answer, index) => {
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = this.#name;
        radio.value = String(index);
        // The first answer is preselected, as the command-line tool's list cursor is.
        radio.checked = index === 0;
        const label = document.createElement("label");
        label.className = "checkbox-row";
        const note = document.createElement("span");
        note.className = "answer-note";
        note.textContent = answer.note;
        label.append(radio, ` ${answer.label} `, note);
        return label;
      }),
    );
    this.#pending = { text, review, answers };
    this.#box.hidden = false;
  }
}

/**
 * A warning under a new password, or under a passphrase that a wallet check depends on, shown only
 * when the package calls it weak. It never blocks the operation, as in the command-line tool.
 */
export class StrengthNote {
  /** Pause after the last key before the estimate runs. */
  static readonly #DELAY_MS = 400;
  readonly #engine: MhfeEngine;
  readonly #input: HTMLInputElement;
  readonly #note: HTMLElement;
  readonly #weakText: (bits: number) => string;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Answers to older text are dropped. */
  #request = 0;
  #enabled = true;

  constructor(
    engine: MhfeEngine,
    input: HTMLInputElement,
    noteId: string,
    weakText: (bits: number) => string,
  ) {
    this.#engine = engine;
    this.#input = input;
    this.#note = required<HTMLElement>(`#${noteId}`);
    this.#weakText = weakText;
    input.addEventListener("input", () => this.#schedule());
    this.#note.hidden = true;
  }

  /** Turns the warning on or off, for a passphrase that matters only with the wallet check. */
  set enabled(enabled: boolean) {
    this.#enabled = enabled;
    this.#schedule();
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#request += 1;
    if (!this.#enabled || this.#input.value === "") {
      this.#note.hidden = true;
      return;
    }
    this.#timer = setTimeout(() => void this.#estimate(this.#request), StrengthNote.#DELAY_MS);
  }

  async #estimate(request: number): Promise<void> {
    try {
      const passwords = await this.#engine.passwords();
      const { bits, weak } = await passwords.strength({ password: this.#input.value });
      if (request !== this.#request) return;
      this.#note.textContent = weak ? this.#weakText(bits) : "";
      this.#note.hidden = !weak;
    } catch {
      // A text the package refuses is reported when the operation starts; the warning stays away.
      if (request === this.#request) this.#note.hidden = true;
    }
  }
}

/** A concealed container field with its Show button and QR image import. */
export class ContainerField {
  readonly textarea: HTMLTextAreaElement;

  /** `id` is the textarea's id; QR import errors go to `status`. */
  constructor(id: string, status: HTMLElement) {
    this.textarea = required<HTMLTextAreaElement>(`#${id}`);
    installSecretToggle(`#toggle-${id}`, `#${id}`, "Show", "Hide", "container");
    installFieldImports(this.textarea, (message) => (status.textContent = message), { qr: {} });
  }

  get value(): string {
    return this.textarea.value;
  }
}

/**
 * Shows or hides the answer of the radio button `selector` with its row; a hidden answer is no
 * longer chosen. True when that took a choice away.
 */
export function offerAnswer(selector: string, offered: boolean): boolean {
  const radio = document.querySelector<HTMLInputElement>(selector);
  const row = radio?.closest<HTMLElement>("label");
  if (radio === null || row === null || row === undefined) return false;
  row.hidden = !offered;
  if (offered || !radio.checked) return false;
  radio.checked = false;
  return true;
}

/** The password and settings with which a container's phrase is recovered. */
export interface RecoverySettings {
  readonly password: string;
  readonly passwordRepair: MhfePasswordRepair;
  readonly pim: number;
}

/**
 * The password of a container to recover, with its check word review and its PIM: the fields of
 * Decode, Check and the old container of Change password, named `#mhfe-{prefix}-password`,
 * `#mhfe-{prefix}-password-review` and the PIM of `prefix`.
 */
export class ContainerPassword {
  readonly password: PasswordField;
  readonly pim: PimField;
  readonly review: PasswordReview;

  constructor(engine: MhfeEngine, prefix: string, label: string) {
    this.password = new PasswordField(`mhfe-${prefix}-password`, label);
    this.pim = new PimField(prefix);
    this.review = new PasswordReview(engine, `mhfe-${prefix}-password-review`, [this.password]);
  }

  /**
   * The password as reviewed and the PIM, with the line that says what the review did;
   * AwaitingAnswer while the review needs an answer.
   */
  async reviewed(
    run: MhfeRun,
  ): Promise<{ settings: RecoverySettings; outcome: string; choice: ReviewChoice }> {
    const choice = await this.review.require(run, this.password.value);
    const settings = {
      password: this.password.value,
      passwordRepair: choice.repair,
      pim: this.pim.value(),
    };
    return { settings, outcome: reviewSaid(choice), choice };
  }

  /** The password as reviewed and the PIM, for a search with the owner's wallet. */
  async settings(run: MhfeRun): Promise<RecoverySettings> {
    return (await this.reviewed(run)).settings;
  }
}

/**
 * "How many words does your original seed phrase have?", as `mhfe` asks it
 * (src/bin/mhfe/phrase_length.rs): the lengths a container's phrase can have, as readContainer()
 * gives them, and "Detect automatically" where the package detects the length
 * (`confirmationFor["0"]`). Until a container is read, the lengths of the package's parameters.
 */
export class PhraseLengthChoice {
  /** The value of the answer that detects the length, the package's `words: 0`. */
  static readonly DETECT = "0";
  readonly #select: HTMLSelectElement;
  readonly #lengths: (lengths: {
    all: readonly number[];
    builtIn: readonly number[];
  }) => readonly number[];
  readonly #misses: string;
  readonly #detectFirst: boolean;

  /**
   * `lengths` picks the lengths offered: every length, or those with a built-in check;
   * `misses` says what detection may not find, beside its answer ("" says nothing); with
   * `detectFirst`, detection is chosen until the person chooses a length, as `mhfe decrypt` does.
   */
  constructor(
    engine: MhfeEngine,
    select: HTMLSelectElement,
    options: { lengths: "all" | "builtIn"; misses?: string; detectFirst?: boolean },
  ) {
    this.#select = select;
    this.#lengths = (offered) => (options.lengths === "all" ? offered.all : offered.builtIn);
    this.#misses = options.misses ?? "";
    this.#detectFirst = options.detectFirst === true;
    engine.whenPassed(() => {
      void engine.coreParameters().then(({ wordCounts, builtInCheckWordCounts }) => {
        // A container read meanwhile has offered its own lengths already.
        if (this.#select.dataset["read"] === undefined)
          this.#offer(this.#lengths({ all: wordCounts, builtIn: builtInCheckWordCounts }), true);
      });
    });
  }

  /** Offers the lengths a container's phrase can have; a length chosen before stays if it fits. */
  adapt(facts: MhfeContainerFacts): void {
    this.#select.dataset["read"] = "";
    this.#offer(
      this.#lengths({ all: facts.phraseLengths, builtIn: facts.builtInCheckLengths }),
      facts.confirmationFor[PhraseLengthChoice.DETECT] !== undefined,
    );
  }

  /** Takes the choice away, so that the person chooses a length again. */
  reset(): void {
    this.#select.value = "";
  }

  /** The length chosen, 0 to detect it; throws while none is chosen. */
  value(): 0 | WordCount {
    const value = this.#select.value;
    if (value === "") throw new Error("Choose how many words your original seed phrase has.");
    return Number(value) as 0 | WordCount;
  }

  /** Calls `listener` when another answer is chosen. */
  onChange(listener: () => void): void {
    this.#select.addEventListener("change", listener);
  }

  #offer(lengths: readonly number[], detects: boolean): void {
    const previous = this.#select.value;
    const options = lengths.map((words) => this.#option(String(words), `${words} words`));
    if (detects) options.push(this.#option(PhraseLengthChoice.DETECT, this.#detectLabel()));
    const chooser = this.#option("", "Choose…");
    const detectFirst = this.#detectFirst && detects;
    this.#select.replaceChildren(
      ...(options.length > 1 && !detectFirst ? [chooser] : []),
      ...options,
    );
    if (options.some((option) => option.value === previous && previous !== ""))
      this.#select.value = previous;
    else if (detectFirst) this.#select.value = PhraseLengthChoice.DETECT;
    this.#select.disabled = options.length === 1;
  }

  #detectLabel(): string {
    return this.#misses === "" ? "Detect automatically" : `Detect automatically (${this.#misses})`;
  }

  #option(value: string, text: string): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    return option;
  }
}

/**
 * The repair word count chosen in the radio group `name`; 0 means none. The package refuses a
 * count it does not make, with its own message.
 */
export function selectedRepairCount(name: string): 0 | 2 | 4 | 6 | 8 {
  const selected = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  if (selected === null) throw new Error("Choose whether the container phrase gets repair words.");
  return Number(selected.value) as 0 | 2 | 4 | 6 | 8;
}
