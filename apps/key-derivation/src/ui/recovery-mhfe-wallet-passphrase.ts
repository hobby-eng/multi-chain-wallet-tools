// "Does the wallet of this phrase have a BIP39 passphrase?", asked before a rekey as the
// command-line tool asks it, with why next to it. MHFE encrypts the phrase, not the passphrase, so
// the answer decides whether the list of what to keep names the passphrase. Neither answer is
// preselected: a hurried press must not leave the passphrase out of that list. Encode asks nothing
// (recovery-mhfe-encode.ts).
import { required } from "./recovery-workspace-shared.js";

/** The refusal of a long job started before the question was answered. */
const UNANSWERED = "Say whether the wallet of this phrase has a BIP39 passphrase.";

export class WalletPassphraseQuestion {
  readonly #fieldset: HTMLFieldSetElement;
  readonly #no: HTMLInputElement;
  readonly #yes: HTMLInputElement;

  /** `prefix` names the fields, as in `#mhfe-{prefix}-wallet-passphrase-yes`. */
  constructor(prefix: string) {
    this.#fieldset = required<HTMLFieldSetElement>(`#mhfe-${prefix}-wallet-passphrase`);
    this.#no = required<HTMLInputElement>(`#mhfe-${prefix}-wallet-passphrase-no`);
    this.#yes = required<HTMLInputElement>(`#mhfe-${prefix}-wallet-passphrase-yes`);
    this.reset();
  }

  /** True or false once answered; undefined while neither answer is chosen. */
  get answer(): boolean | undefined {
    if (this.#yes.checked) return true;
    return this.#no.checked ? false : undefined;
  }

  /** The answer, or an error that asks for it, before any long work starts. */
  required(): boolean {
    const answer = this.answer;
    if (answer === undefined) throw new Error(UNANSWERED);
    return answer;
  }

  set hidden(hidden: boolean) {
    this.#fieldset.hidden = hidden;
  }

  /** Calls `listener` when an answer is chosen. */
  onChange(listener: () => void): void {
    for (const radio of [this.#no, this.#yes]) radio.addEventListener("change", listener);
  }

  /** Clears the answer, which must be given again: the phrase or the page changed. */
  reset(): void {
    this.#no.checked = false;
    this.#yes.checked = false;
  }
}
