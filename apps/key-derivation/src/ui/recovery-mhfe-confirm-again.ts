// Confirming a password change again on the same recovery (the package's onConfirmAgain): after
// AMBIGUOUS_LENGTH or LENGTH_DIFFERS the package keeps what it recovered and asks the page for an
// address, the master key fingerprint or the owner's comparison, without the Argon2 pass again.
// The tab's own confirmation choice is shown as a question of the running job (data-job-question),
// so that answering it is not an edit that drops the job; Stop answers null, which ends the change
// with the original refusal. Every way out goes through one close.
import type { MhfeConfirmAgainAnswer, WordCount } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { OwnerPhraseCheck } from "./recovery-mhfe-owner-check.js";
import type { WalletReferenceField } from "./recovery-mhfe-reference.js";
import { describe } from "./recovery-mhfe-status.js";
import { paragraph } from "./recovery-workspace-shared.js";

export interface ConfirmAgainParts {
  /** Where the buttons are shown; the owner's comparison uses it afterwards. */
  readonly host: HTMLElement;
  readonly status: HTMLElement;
  readonly reference: WalletReferenceField;
  readonly ownerCheck: OwnerPhraseCheck;
  /** The blocks of the confirmation choice that the person fills in during the question. */
  readonly choice: readonly HTMLElement[];
  /** The answer of the first confirmation, which holds for every later one. */
  readonly walletHasPassphrase: () => boolean;
}

export class ConfirmAgainPrompt {
  readonly #parts: ConfirmAgainParts;
  /** Closes the open question with its answer; undefined while none is open. */
  #close: ((answer: MhfeConfirmAgainAnswer | null) => void) | undefined;

  constructor(parts: ConfirmAgainParts) {
    this.#parts = parts;
  }

  /**
   * Asks how to confirm after the refusal `error`; resolves with the answer, or null for Stop.
   * The owner is offered only for `ownerLengths`, and picks one when there are several.
   */
  ask(error: unknown, ownerLengths: readonly WordCount[]): Promise<MhfeConfirmAgainAnswer | null> {
    this.dispose();
    const { host, status, reference, choice } = this.#parts;
    reference.reset();
    reference.offer("owner", ownerLengths.length > 0);
    reference.askPassphrase(this.#parts.walletHasPassphrase());
    for (const block of choice) {
      block.dataset.jobQuestion = "";
      block.hidden = false;
    }
    const how =
      ownerLengths.length > 0
        ? "Choose a receiving address, the master key fingerprint or your own comparison above, then press Confirm."
        : "Choose a receiving address or the master key fingerprint above, then press Confirm.";
    status.textContent = `${describe(error, "The built-in check alone does not confirm this recovery.")} ${how}`;
    return new Promise((resolve) => {
      const lengths = this.#lengthChoice(ownerLengths);
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "primary";
      confirm.textContent = "Confirm";
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "secondary";
      stop.textContent = "Stop";
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(confirm, stop);
      let settled = false;
      const close = (answer: MhfeConfirmAgainAnswer | null): void => {
        if (settled) return;
        settled = true;
        if (this.#close === close) this.#close = undefined;
        for (const block of [...choice, host]) delete block.dataset.jobQuestion;
        reference.offer("owner", true);
        host.replaceChildren();
        resolve(answer);
      };
      this.#close = close;
      confirm.addEventListener("click", () => {
        try {
          close(this.#answer(ownerLengths, lengths));
        } catch (cause) {
          status.textContent = describe(cause, "Choose how to confirm the recovered seed phrase.");
        }
      });
      stop.addEventListener("click", () => close(null));
      host.dataset.jobQuestion = "";
      host.replaceChildren(
        ...(lengths === undefined ? [] : [lengths.label, lengths.select]),
        actions,
      );
    });
  }

  /** Closes the open question, if any, as Stop: an answer that never confirms. */
  dispose(): void {
    this.#close?.(null);
  }

  /** The length the owner compares, when several pass; nothing is preselected. */
  #lengthChoice(
    ownerLengths: readonly WordCount[],
  ): { label: HTMLElement; select: HTMLSelectElement } | undefined {
    if (ownerLengths.length < 2) return undefined;
    const select = document.createElement("select");
    select.id = "mhfe-rekey-again-words";
    const option = (text: string, value: string): HTMLOptionElement => {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = text;
      return item;
    };
    select.append(option("Choose the word count", ""));
    for (const words of ownerLengths) select.append(option(`${words} words`, String(words)));
    const label = paragraph(
      "For your own comparison: the word count of your written phrase",
      "field-note",
    );
    return { label, select };
  }

  #answer(
    ownerLengths: readonly WordCount[],
    lengths: { select: HTMLSelectElement } | undefined,
  ): MhfeConfirmAgainAnswer {
    const { reference, ownerCheck } = this.#parts;
    if (reference.kind === "owner") {
      const owner = (check: Parameters<OwnerPhraseCheck["ask"]>[0]) => ownerCheck.ask(check);
      if (lengths === undefined) return { owner };
      const words = Number(lengths.select.value) as WordCount;
      if (!ownerLengths.includes(words)) throw new Error("Choose the word count you compare.");
      return { owner, words };
    }
    const confirmation = reference.walletReference();
    if (!this.#parts.walletHasPassphrase()) return confirmation;
    const passphrase = reference.passphrase.value;
    // The first answer said the wallet has a passphrase: it is compared with it.
    if (passphrase === "") throw new Error("Type the wallet's BIP39 passphrase.");
    return { ...confirmation, passphrase };
  }
}
