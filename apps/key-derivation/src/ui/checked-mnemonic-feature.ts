// "Generate with the MHFE wallet check" in Generate & Derive: the Generate 24 button draws a phrase
// that passes MHFE's wallet check (MHFE-WALLET-CHECK-SEED-1) with the BIP39 passphrase typed in the
// page, and holds the chosen word of the panel below if one is given. The Deriver draws it itself,
// on a few workers (wallet-check-draw.ts): from MHFE 0.8.0 it is the one generator of phrases. MHFE's
// wallet module checks the phrase once more (MhfeWallet.walletCheck) before it is shown.
import type { ChosenWordCount, ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { BIP39_WORD_COUNTS } from "@ckd/core/bip39-parameters.js";
import {
  runWalletCheckSelfTest,
  WALLET_CHECK_EXPECTED_DRAWS,
  WALLET_CHECK_WORDS,
  walletCheckOdds,
} from "@ckd/core/bip39-wallet-check.js";
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { CheckedGeneration } from "./chosen-words-feature.js";
import { MhfeEngine } from "./recovery-mhfe-engine.js";
import { MhfeRun, MhfeRunStopped } from "./recovery-mhfe-run.js";
import { MhfePanelCheck } from "./recovery-mhfe-self-check.js";
import {
  describe,
  drawLine,
  drawOutlook,
  drawStartLine,
  selfCheckFailure,
} from "./recovery-mhfe-status.js";
import { JobClock } from "./recovery-progress.js";
import { WalletCheckDraw } from "./wallet-check-draw.js";

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
  readonly #cancel: HTMLButtonElement;
  /** The note beside the passphrase label: optional, or required while this mode is chosen. */
  readonly #need: HTMLElement | null;
  readonly #buttons: ReadonlyMap<number, HTMLButtonElement>;
  /** What the wishes keep with the check, shown while the box is ticked. */
  readonly #outlook: HTMLElement;
  /** MHFE's quick check of its wallet module, run when the box is first ticked. */
  readonly #check: MhfePanelCheck;
  #enabled = false;
  #failed = false;
  /** The phrase being drawn, whose Cancel latches over every step (MhfeRun). */
  #run: MhfeRun | undefined;
  /** The workers drawing it. */
  #draw: WalletCheckDraw | undefined;
  #wishes: WishesFor | null = null;

  constructor(page: Document, onChange: () => void, engine: MhfeEngine = new MhfeEngine()) {
    const required = <T extends Element>(selector: string) =>
      requireQueryElement<T>(page, selector);
    this.#engine = engine;
    this.#box = required<HTMLInputElement>("#wallet-check-enabled");
    this.#panel = required<HTMLElement>("#wallet-check-options");
    this.#help = required<HTMLDetailsElement>("#wallet-check-help");
    this.#cancel = required<HTMLButtonElement>("#wallet-check-cancel");
    this.#need = page.querySelector<HTMLElement>("#passphrase-need");
    this.#buttons = new Map(
      BIP39_WORD_COUNTS.map((count) => [count, required<HTMLButtonElement>(`#generate-${count}`)]),
    );
    this.#outlook = required<HTMLElement>("#wallet-check-outlook");
    this.#check = new MhfePanelCheck(engine, this.#panel, required("#wallet-check-status"), [
      "Wallet",
    ]);
    const changed = (): void => {
      this.cancel();
      onChange();
      this.#sync();
    };
    this.#box.addEventListener("change", () => {
      changed();
      this.#showOutlook();
      if (this.#box.checked) void this.#open();
    });
    // A draw belongs to the passphrase it started with: editing the passphrase stops it.
    page.querySelector("#passphrase")?.addEventListener("input", changed);
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
    this.#showOutlook();
    this.#sync();
  }

  cancel(): void {
    this.#run?.cancel();
  }

  /**
   * A phrase that passes the wallet check with `passphrase` and meets `wishes`; `onStatus` gets
   * the status lines while it is drawn, with the average time at the speed so far. MHFE checks the
   * phrase once more before it is given. Cancelled, it rejects with an AbortError.
   */
  async generate(
    words: ChosenWordCount,
    passphrase: string,
    wishes: ChosenWordsRequest,
    onStatus: (line: string) => void,
  ): Promise<string> {
    this.cancel();
    if (!this.#enabled) throw new Error("The cryptographic self-test has not passed.");
    if (words !== WALLET_CHECK_WORDS)
      throw new Error(`The MHFE wallet check draws ${WALLET_CHECK_WORDS}-word phrases only.`);
    // As MHFE took it: the check needs the wallet's passphrase.
    if (passphrase === "")
      throw new Error("The MHFE wallet check needs a BIP39 passphrase: type it first.");
    // A copy: the panel's fields may change while the phrase is drawn.
    const wanted: ChosenWordsRequest = {
      wordCount: WALLET_CHECK_WORDS,
      chosen: wishes.chosen.map((word) => ({ ...word })),
      neverUse: [...wishes.neverUse],
    };
    const draw = new WalletCheckDraw();
    const run = new MhfeRun(() => draw.stop());
    this.#run = run;
    this.#draw = draw;
    this.#sync();
    try {
      if (!(await run.step(() => this.#check.ensure())))
        throw new Error(
          this.#check.failed ? selfCheckFailure() : "MHFE could not check itself. Try again.",
        );
      const wallet = await run.step(() => this.#engine.wallet());
      // The page's own digest against the profile's published vector, before minutes of drawing.
      runWalletCheckSelfTest();
      onStatus(drawStartLine(true, WALLET_CHECK_EXPECTED_DRAWS));
      const clock = new JobClock();
      const phrase = await run.step(() =>
        draw.run(wanted, passphrase, (draws) =>
          onStatus(drawLine(draws, clock, true, WALLET_CHECK_EXPECTED_DRAWS)),
        ),
      );
      if (phrase === undefined) throw new MhfeRunStopped();
      // MHFE's own check, in its worker, before the phrase is shown.
      if (!(await run.step(() => wallet.walletCheck({ phrase, passphrase }))))
        throw new Error("The generated phrase failed its MHFE wallet check.");
      return phrase;
    } catch (cause) {
      if (cause instanceof MhfeRunStopped)
        throw new DOMException("Checked phrase generation was stopped.", "AbortError");
      if (!(cause instanceof MhfeError)) throw cause;
      throw new Error(describe(cause, "the phrase could not be checked."), { cause });
    } finally {
      draw.stop();
      if (this.#draw === draw) this.#draw = undefined;
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

  /** What the panel's wishes keep of the phrase's randomness with the check, while it is ticked. */
  #showOutlook(): void {
    const text = this.#box.checked
      ? drawOutlook(
          walletCheckOdds({
            wordCount: WALLET_CHECK_WORDS,
            chosen: [],
            neverUse: [],
            ...this.#wishes?.(WALLET_CHECK_WORDS),
          }),
        )
      : null;
    this.#outlook.textContent = text ?? "";
    this.#outlook.hidden = text === null;
  }

  #sync(): void {
    const open = this.#enabled && !this.#failed;
    this.#box.disabled = !open;
    this.#panel.hidden = !this.#box.checked;
    // The "?" explains the option before it is chosen (owner, 2026-10-23).
    this.#help.hidden = false;
    this.#cancel.hidden = this.#run === undefined;
    if (this.#need !== null)
      this.#need.textContent = this.#box.checked
        ? "required for MHFE generation, case-sensitive"
        : "optional, case-sensitive";
    for (const [count, button] of this.#buttons)
      button.disabled = !this.#enabled || (this.#box.checked && count !== WALLET_CHECK_WORDS);
  }
}

export function installCheckedMnemonicFeature(
  page: Document,
  onChange: () => void,
): CheckedMnemonicFeature {
  return new CheckedMnemonicFeature(page, onChange);
}
