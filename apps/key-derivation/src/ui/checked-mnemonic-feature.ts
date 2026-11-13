// "Generate with the MHFE wallet check" in Generate & Derive: the Generate 24 button draws a phrase
// that passes MHFE's wallet check (MHFE-WALLET-CHECK-SEED-1) with the BIP39 passphrase typed in the
// page, holds the chosen word of the panel below if one is given, and with "Generate a phrase the
// Telegram wallet accepts" also passes TON's check. The Deriver draws it itself, on the workers the
// person chooses (wallet-check-draw.ts): from MHFE 0.8.0 it is the one generator of phrases.
// MHFE's wallet module checks the phrase once more (MhfeWallet.walletCheck), and the page checks
// TON's condition once more, before it is shown.
import type { ChosenWordCount, ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import {
  runWalletCheckSelfTest,
  WALLET_CHECK_BITS,
  WALLET_CHECK_WORDS,
} from "@ckd/core/bip39-wallet-check.js";
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { DrawSpeedState, GenerationCondition, WorkerPrecheck } from "./generation-plan.js";
import { MhfeEngine } from "./recovery-mhfe-engine.js";
import { MhfeRun, MhfeRunStopped } from "./recovery-mhfe-run.js";
import { MhfePanelCheck } from "./recovery-mhfe-self-check.js";
import { describe, selfCheckFailure } from "./recovery-mhfe-status.js";
import {
  GenerationOptionState,
  type GenerateButtons,
  type GenerationOption,
} from "./generation-option.js";
import { WalletCheckDraw } from "./wallet-check-draw.js";
import { WalletCheckDrawSpeed } from "./wallet-check-draw-speed.js";
import { DrawThreads } from "./wallet-check-draw-threads.js";

/** The wallet check as a condition of a drawn phrase, in the words of the page's lines. */
const CONDITION: GenerationCondition = Object.freeze({
  goal: "passes the MHFE wallet check with your BIP39 passphrase",
  name: "the MHFE wallet check",
  bits: WALLET_CHECK_BITS,
  words: WALLET_CHECK_WORDS,
});

/**
 * A generation option, not an assertion about a phrase imported or edited afterwards. Its engine is
 * its own, so that a draw of the MHFE panel and this one never stop each other.
 */
export class CheckedMnemonicFeature implements GenerationOption {
  readonly #engine: MhfeEngine;
  readonly #box: HTMLInputElement;
  readonly #state: GenerationOptionState;
  readonly #panel: HTMLElement;
  readonly #help: HTMLDetailsElement;
  /** The note beside the passphrase label: optional, or required while this mode is chosen. */
  readonly #need: HTMLElement | null;
  readonly #buttons: GenerateButtons;
  /** Starts the workers of one draw or measurement (CORE-09). */
  readonly #createDraw: () => WalletCheckDraw;
  readonly #threads: DrawThreads;
  readonly #speed: WalletCheckDrawSpeed;
  readonly #speedListeners: (() => void)[] = [];
  /** MHFE's quick check of its wallet module, run when the box is first ticked. */
  readonly #check: MhfePanelCheck;
  #failed = false;
  /** The phrase being drawn, whose Cancel latches over every step (MhfeRun). */
  #run: MhfeRun | undefined;

  constructor(
    page: Document,
    onChange: () => void,
    buttons: GenerateButtons,
    engine: MhfeEngine = new MhfeEngine(),
    createDraw: () => WalletCheckDraw = () => new WalletCheckDraw(),
  ) {
    const required = <T extends Element>(selector: string) =>
      requireQueryElement<T>(page, selector);
    this.#engine = engine;
    this.#box = required<HTMLInputElement>("#wallet-check-enabled");
    this.#state = new GenerationOptionState(
      this.#box,
      () => {
        this.cancel();
        this.#speed.stop();
      },
      () => this.#sync(),
    );
    this.#panel = required<HTMLElement>("#wallet-check-options");
    this.#help = required<HTMLDetailsElement>("#wallet-check-help");
    this.#need = page.querySelector<HTMLElement>("#passphrase-need-kind");
    this.#buttons = buttons;
    this.#createDraw = createDraw;
    this.#threads = new DrawThreads(
      required<HTMLSelectElement>("#draw-threads"),
      globalThis.navigator?.hardwareConcurrency,
    );
    this.#speed = new WalletCheckDrawSpeed(() => this.#speedChanged(), createDraw);
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
      if (this.#box.checked) void this.#open();
    });
    // A draw belongs to the passphrase it started with: editing the passphrase stops it.
    page.querySelector("#passphrase")?.addEventListener("input", changed);
    this.#threads.onChange(() => this.#speedChanged());
    this.#sync();
  }

  /** The wallet check as a condition of the phrase. */
  get condition(): GenerationCondition {
    return CONDITION;
  }

  // The same three methods as TonPhraseFeature's, both GenerationOption's (a deliberate copy).
  active(): boolean {
    return this.#box.checked;
  }

  setEnabled(enabled: boolean): void {
    this.#state.setEnabled(enabled);
  }

  clear(): void {
    this.#state.clear();
    this.#threads.reset();
  }

  cancel(): void {
    this.#run?.cancel();
  }

  /** Calls `listener` when a measurement of speed ends or the threads change. */
  onSpeed(listener: () => void): void {
    this.#speedListeners.push(listener);
  }

  /**
   * How fast a draw runs on the threads chosen, with TON's check when `ton`: the last measurement
   * of the same draw, or one about to run, which onSpeed reports. Null stops measuring. Nothing is
   * measured while a phrase is drawn.
   */
  speed(ton: boolean | null): DrawSpeedState | undefined {
    if (ton === null || !this.#state.enabled || !this.#box.checked) {
      this.#speed.stop();
      return undefined;
    }
    if (this.#run !== undefined) return undefined;
    return this.#speed.of({ ton, threads: this.#threads.count });
  }

  /**
   * A phrase that passes the wallet check with `passphrase`, meets `wishes` and passes `precheck`
   * if one is given, tried first; `onDraws` gets the phrases tried. MHFE checks the phrase once
   * more, and the page checks `precheck` once more, before it is given. Cancelled, it rejects with
   * an AbortError.
   */
  async generate(
    words: ChosenWordCount,
    passphrase: string,
    wishes: ChosenWordsRequest,
    precheck: WorkerPrecheck | undefined,
    onDraws: (draws: number) => void,
  ): Promise<string> {
    this.cancel();
    if (!this.#state.enabled) throw new Error("The cryptographic self-test has not passed.");
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
    const draw = this.#createDraw();
    const run = new MhfeRun(() => draw.stop());
    this.#run = run;
    // The workers are the draw's now; a measurement under way would only slow it.
    this.#speed.pause();
    this.#sync();
    try {
      if (!(await run.step(() => this.#check.ensure())))
        throw new Error(
          this.#check.failed ? selfCheckFailure() : "MHFE could not check itself. Try again.",
        );
      const wallet = await run.step(() => this.#engine.wallet());
      // The page's own digest against the profile's published vector, before minutes of drawing.
      runWalletCheckSelfTest();
      const phrase = await run.step(() =>
        draw.run(
          { wishes: wanted, ton: precheck !== undefined, threads: this.#threads.count },
          passphrase,
          onDraws,
        ),
      );
      if (phrase === undefined) throw new MhfeRunStopped();
      // MHFE's own check, in its worker, and the page's own check of TON's condition, by another
      // implementation than the workers', before the phrase is shown.
      if (!(await run.step(() => wallet.walletCheck({ phrase, passphrase }))))
        throw new Error("The generated phrase failed its MHFE wallet check.");
      if (precheck !== undefined && !precheck.passes(phrase))
        throw new Error(`The generated phrase failed ${precheck.name}.`);
      return phrase;
    } catch (cause) {
      if (cause instanceof MhfeRunStopped)
        throw new DOMException("Checked phrase generation was stopped.", "AbortError");
      if (!(cause instanceof MhfeError)) throw cause;
      throw new Error(describe(cause, "the phrase could not be checked."), { cause });
    } finally {
      draw.stop();
      if (this.#run === run) this.#run = undefined;
      this.#sync();
      // A measurement paused for the draw may run again.
      this.#speedChanged();
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

  #speedChanged(): void {
    for (const listener of this.#speedListeners) listener();
  }

  #sync(): void {
    const open = this.#state.enabled && !this.#failed;
    this.#box.disabled = !open;
    this.#panel.hidden = !this.#box.checked;
    // The "?" explains the option before it is chosen.
    this.#help.hidden = false;
    this.#threads.setEnabled(this.#run === undefined);
    // "case-sensitive" stays in the page's own span, which keeps the word whole on a phone.
    if (this.#need !== null)
      this.#need.textContent = this.#box.checked ? "required for MHFE generation" : "optional";
    this.#buttons.limit("mhfe-wallet-check", this.#box.checked ? WALLET_CHECK_WORDS : undefined);
  }
}

export function installCheckedMnemonicFeature(
  page: Document,
  onChange: () => void,
  buttons: GenerateButtons,
): CheckedMnemonicFeature {
  return new CheckedMnemonicFeature(page, onChange, buttons);
}
