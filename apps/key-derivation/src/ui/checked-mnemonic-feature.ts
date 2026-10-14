// "Generate with the MHFE wallet check" in Generate & Derive: the Generate 24 button draws a phrase
// that passes MHFE's wallet check with the BIP39 passphrase typed in the page, and holds the chosen
// word of the panel below if one is given. MHFE's wallet module draws it (MhfeWallet.drawPhrase) and
// holds every rule: the check, the passphrase it needs, the word it takes and what that costs.
import type { ChosenWordCount, ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { BIP39_WORD_COUNTS } from "@ckd/core/bip39-parameters.js";
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { CheckedGeneration } from "./chosen-words-feature.js";
import { MhfeDrawOutlook, NO_WISHES, type MhfeWishes } from "./recovery-mhfe-draw-outlook.js";
import { MhfeEngine } from "./recovery-mhfe-engine.js";
import { MhfeRun } from "./recovery-mhfe-run.js";
import { MhfePanelCheck } from "./recovery-mhfe-self-check.js";
import {
  MHFE_PHRASE_WORDS,
  describe,
  drawLine,
  drawStartLine,
  selfCheckFailure,
} from "./recovery-mhfe-status.js";
import { JobClock } from "./recovery-progress.js";

/** The wishes of the chosen-word panel, for a phrase of a given length. */
type WishesFor = (wordCount: ChosenWordCount) => ChosenWordsRequest;

/**
 * A generation option, not an assertion about a phrase imported or edited afterwards. It plugs into
 * the chosen-word panel as its checked mode (CheckedGeneration). Its engine is its own, so that a
 * draw of the MHFE panel and this one never stop each other.
 */
export class CheckedMnemonicFeature implements CheckedGeneration {
  readonly #engine: MhfeEngine;
  readonly #box: HTMLInputElement;
  readonly #panel: HTMLElement;
  readonly #help: HTMLDetailsElement;
  readonly #repeat: HTMLInputElement;
  readonly #cancel: HTMLButtonElement;
  readonly #buttons: ReadonlyMap<number, HTMLButtonElement>;
  readonly #outlook: MhfeDrawOutlook;
  /** MHFE's quick check of its wallet module, run when the box is first ticked. */
  readonly #check: MhfePanelCheck;
  #enabled = false;
  #failed = false;
  /** The phrase being drawn, whose Cancel latches over every step (MhfeRun). */
  #run: MhfeRun | undefined;
  #wishes: WishesFor | null = null;

  constructor(page: Document, onChange: () => void, engine: MhfeEngine = new MhfeEngine()) {
    const required = <T extends Element>(selector: string) =>
      requireQueryElement<T>(page, selector);
    this.#engine = engine;
    this.#box = required<HTMLInputElement>("#wallet-check-enabled");
    this.#panel = required<HTMLElement>("#wallet-check-options");
    this.#help = required<HTMLDetailsElement>("#wallet-check-help");
    this.#repeat = required<HTMLInputElement>("#wallet-check-passphrase-repeat");
    this.#cancel = required<HTMLButtonElement>("#wallet-check-cancel");
    this.#buttons = new Map(
      BIP39_WORD_COUNTS.map((count) => [count, required<HTMLButtonElement>(`#generate-${count}`)]),
    );
    this.#outlook = new MhfeDrawOutlook(required<HTMLElement>("#wallet-check-outlook"), engine);
    this.#check = new MhfePanelCheck(engine, this.#panel, required("#wallet-check-status"), [
      "Wallet",
    ]);
    const changed = (): void => {
      this.cancel();
      onChange();
      this.#sync();
    };
    this.#box.addEventListener("change", () => {
      if (!this.#box.checked) this.#repeat.value = "";
      changed();
      this.#showOutlook();
      if (this.#box.checked) void this.#open();
    });
    page.querySelector("#passphrase")?.addEventListener("input", () => {
      this.#repeat.value = "";
      changed();
    });
    this.#repeat.addEventListener("input", changed);
    this.#cancel.addEventListener("click", changed);
    // A change of the wishes reaches this mode through the panel (showWishes).
    this.#sync();
  }

  active(): boolean {
    return this.#box.checked;
  }

  onChange(listener: () => void): void {
    this.#box.addEventListener("change", listener);
  }

  showWishes(request: WishesFor | null): void {
    this.#wishes = request;
    this.#showOutlook();
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.cancel();
    this.#sync();
  }

  clear(): void {
    this.cancel();
    this.#box.checked = false;
    this.#repeat.value = "";
    this.#outlook.clear();
    this.#sync();
  }

  cancel(): void {
    this.#run?.cancel();
  }

  /**
   * A phrase that passes the wallet check with `passphrase`, typed again in the confirmation
   * field, and meets `wishes`; `onStatus` gets the status lines while it is drawn. MHFE refuses a
   * missing passphrase, a different confirmation and wishes it does not take. Cancelled, it
   * rejects with an AbortError.
   */
  async generate(
    words: ChosenWordCount,
    passphrase: string,
    wishes: ChosenWordsRequest,
    onStatus: (line: string) => void,
  ): Promise<string> {
    this.cancel();
    if (!this.#enabled) throw new Error("The cryptographic self-test has not passed.");
    if (words !== MHFE_PHRASE_WORDS)
      throw new Error(`The MHFE wallet check draws ${MHFE_PHRASE_WORDS}-word phrases only.`);
    // A copy: the panel's fields may change while the phrase is drawn.
    const wanted = {
      chosen: wishes.chosen.map((word) => ({ ...word })),
      neverUse: [...wishes.neverUse],
    };
    const run = new MhfeRun(() => this.#engine.cancelDraw());
    this.#run = run;
    this.#sync();
    try {
      if (!(await run.step(() => this.#check.ensure())))
        throw new Error(
          this.#check.failed ? selfCheckFailure() : "MHFE could not check itself. Try again.",
        );
      const wallet = await run.step(() => this.#engine.wallet());
      const { expectedDraws } = await run.step(() =>
        wallet.describeDraw({ ...wanted, walletCheck: true }),
      );
      onStatus(drawStartLine(true, expectedDraws));
      const clock = new JobClock();
      const drawn = await run.step(() =>
        wallet.drawPhrase({
          ...wanted,
          passphrase,
          passphraseRepeat: this.#repeat.value,
          walletCheck: true,
          onProgress: ({ draws }) => onStatus(drawLine(draws, clock, true)),
        }),
      );
      // MHFE's own check once more, in a fresh worker, before the phrase is shown.
      if (!(await run.step(() => wallet.walletCheck({ phrase: drawn.phrase, passphrase }))))
        throw new Error("The generated phrase failed its MHFE wallet check.");
      return drawn.phrase;
    } catch (cause) {
      if (cause instanceof MhfeError && cause.code === "CANCELLED")
        throw new DOMException("Checked phrase generation was stopped.", "AbortError");
      if (!(cause instanceof MhfeError)) throw cause;
      throw new Error(describe(cause, "the phrase could not be drawn."), { cause });
    } finally {
      if (this.#run === run) this.#run = undefined;
      this.#sync();
    }
  }

  /** Runs MHFE's quick check when the box is ticked; a failure closes the mode for good. */
  async #open(): Promise<void> {
    if (await this.#check.ensure()) return;
    this.#failed = this.#check.failed;
    if (this.#box.checked) {
      this.#box.checked = false;
      this.#box.dispatchEvent(new Event("change"));
    }
    this.#sync();
  }

  /** What the panel's wishes keep with the check, as MHFE rates them, while the box is ticked. */
  #showOutlook(): void {
    if (!this.#box.checked) {
      this.#outlook.clear();
      return;
    }
    const wishes: MhfeWishes = this.#wishes?.(MHFE_PHRASE_WORDS) ?? NO_WISHES;
    void this.#check.ensure().then((passed) => {
      if (passed && this.#box.checked) void this.#outlook.show(wishes, true);
    });
  }

  #sync(): void {
    const open = this.#enabled && !this.#failed;
    this.#box.disabled = !open;
    this.#panel.hidden = !this.#box.checked;
    this.#help.hidden = !this.#box.checked;
    if (!this.#box.checked) this.#help.open = false;
    this.#repeat.disabled = !open;
    this.#cancel.hidden = this.#run === undefined;
    for (const [count, button] of this.#buttons)
      button.disabled = !this.#enabled || (this.#box.checked && count !== MHFE_PHRASE_WORDS);
  }
}

export function installCheckedMnemonicFeature(
  page: Document,
  onChange: () => void,
): CheckedMnemonicFeature {
  return new CheckedMnemonicFeature(page, onChange);
}
