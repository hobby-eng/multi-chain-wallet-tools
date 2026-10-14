// The owner's check of a rekey ("Show me the phrase"): the recovered phrase, concealed, for the
// owner to compare with a written record, and the question whether it matches. Every way out (an
// answer, Cancel, a failure, a new run or leaving the page) goes through one close, which empties
// the phrase, removes the window listener and settles the question, so that neither the phrase nor
// a pending promise stays behind.
import type { MhfeConfirmation } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { fingerprintLine } from "./recovery-mhfe-cards.js";
import { statedLengthDiffers } from "./recovery-mhfe-status.js";
import { paragraph } from "./recovery-workspace-shared.js";

/** What the package hands the owner's check, from its own type. */
type OwnerCheck = Parameters<Extract<MhfeConfirmation, { owner: unknown }>["owner"]>[0];

export class OwnerPhraseCheck {
  readonly #host: HTMLElement;
  readonly #status: HTMLElement;
  /** Closes the open question with its answer; undefined while none is open. */
  #close: ((matches: boolean) => void) | undefined;
  /** The fingerprint of the last phrase the owner confirmed, for the rehearsal of a new container. */
  #confirmed: string | undefined;

  /** The question is shown in `host`; `status` says that it waits for the answer. */
  constructor(host: HTMLElement, status: HTMLElement) {
    this.#host = host;
    this.#status = status;
  }

  get open(): boolean {
    return this.#close !== undefined;
  }

  /** The fingerprint (without a passphrase) of the phrase last confirmed by "Yes", if any. */
  get confirmedFingerprint(): string | undefined {
    return this.#confirmed;
  }

  /**
   * Shows the phrase, concealed, and resolves with the owner's answer. The phrase is hidden again
   * when the window loses focus. A question still open is closed first, as a "No".
   */
  ask(check: OwnerCheck): Promise<boolean> {
    this.dispose();
    this.#confirmed = undefined;
    return new Promise((resolve) => {
      const heading = document.createElement("h3");
      heading.textContent = "Recovered seed phrase";
      const warning = paragraph(
        "Compare it word for word with an independent written record, such as your written original seed " +
          "phrase. From memory such a comparison confirms little.",
        "warning-callout",
      );
      const phrase = document.createElement("textarea");
      phrase.rows = 4;
      phrase.readOnly = true;
      phrase.className = "concealed";
      phrase.value = check.phrase;
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "danger-outline compact";
      reveal.textContent = "Show phrase";
      const conceal = (): void => {
        phrase.classList.add("concealed");
        reveal.textContent = "Show phrase";
      };
      reveal.addEventListener("click", () => {
        const visible = phrase.classList.toggle("concealed");
        reveal.textContent = visible ? "Show phrase" : "Hide phrase";
      });
      window.addEventListener("blur", conceal);
      let settled = false;
      const close = (matches: boolean): void => {
        if (settled) return;
        settled = true;
        if (this.#close === close) this.#close = undefined;
        window.removeEventListener("blur", conceal);
        phrase.value = "";
        this.#host.replaceChildren();
        if (matches) this.#confirmed = check.fingerprintWithoutPassphrase;
        // Only true is a yes (the package seals nothing before it).
        resolve(matches === true);
      };
      this.#close = close;
      const fingerprint = paragraph(
        fingerprintLine(check.fingerprintWithoutPassphrase, "withoutPassphrase"),
        "field-note",
      );
      const question = paragraph("Does it match your written record, word for word?", "field-note");
      // The buttons close their own question, never a newer one shown after it.
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "primary";
      yes.textContent = "Yes, every word";
      yes.addEventListener("click", () => close(true));
      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary";
      no.textContent = "No, stop";
      no.addEventListener("click", () => close(false));
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(reveal, yes, no);
      // Where the built-in check found another length than the one given, it is said first.
      const stated =
        check.statedWords === undefined
          ? []
          : [paragraph(statedLengthDiffers(check.words, check.statedWords), "warning-callout")];
      this.#host.replaceChildren(
        heading,
        ...stated,
        warning,
        phrase,
        fingerprint,
        question,
        actions,
      );
      this.#status.textContent = "Waiting for your answer below.";
    });
  }

  /**
   * Closes the open question, if any, as a "No": an answer that never confirms, and one that a job
   * which has already ended ignores.
   */
  dispose(): void {
    this.#close?.(false);
  }
}
