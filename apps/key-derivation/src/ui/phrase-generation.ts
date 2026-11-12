// One press of a Generate button in Generate & Derive with any combination of its generation
// options (owner, 2026-11-11): a chosen word, a phrase the Telegram wallet accepts (TON's check)
// and the MHFE wallet check. It routes the draw, shows it under the buttons from the click to its
// end (generation-progress.ts), and keeps the outlook under the options: the bits a phrase keeps,
// how long it takes on this computer, and what a passphrase kept with it means
// (generation-outlook.ts).
//
// Every combination draws uniformly among the phrases that meet all its conditions: each draw comes
// fresh from the chosen-word sampler, uniform among the phrases that meet the wishes, and each
// condition only rejects. TON's check runs first, being the cheaper; with the wallet check both run
// on its workers (checked-mnemonic-feature.ts), otherwise on the page (ton-phrase-feature.ts).
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import type { Bip39WordCount } from "@ckd/core/bip39-word-counts.js";
import { isAbortError } from "@ckd/core/error-handling.js";
import type { ChosenWordsFeature } from "./chosen-words-feature.js";
import type { GenerationOption } from "./generation-option.js";
import type { GenerationOutlook } from "./generation-outlook.js";
import {
  bitsOutlook,
  DrawPace,
  drawCountLine,
  drawDoneLine,
  drawStartLine,
  drawStoppedLine,
  expectedDraws,
  timeOutlook,
  type DrawSpeedState,
  type GenerationCondition,
  type GenerationPlan,
  type PassphraseOutcome,
  type WorkerPrecheck,
} from "./generation-plan.js";
import type { GenerationProgress, GenerationRun } from "./generation-progress.js";
import { JobClock } from "./recovery-progress.js";

/** What generation asks of the MHFE wallet check (checked-mnemonic-feature.ts). */
export interface WalletCheckOption extends GenerationOption {
  readonly condition: GenerationCondition;
  generate(
    words: Bip39WordCount,
    passphrase: string,
    wishes: ChosenWordsRequest,
    precheck: WorkerPrecheck | undefined,
    onDraws: (draws: number) => void,
  ): Promise<string>;
  speed(ton: boolean | null): DrawSpeedState | undefined;
  onSpeed(listener: () => void): void;
}

/** What generation asks of TON's phrase (ton-phrase-feature.ts). */
export interface TonOption extends GenerationOption {
  readonly condition: WorkerPrecheck;
  generate(
    current: () => boolean,
    onDraws: (draws: number) => void,
    drawPhrase?: () => Promise<string> | string,
  ): Promise<string>;
}

/** The parts generation is composed of; a build without MHFE or TON lacks those options. */
export interface PhraseGenerationParts {
  readonly progress: GenerationProgress;
  readonly outlook: GenerationOutlook;
  readonly generateMnemonic: (words: Bip39WordCount) => string;
  readonly chosenWords: ChosenWordsFeature | undefined;
  readonly walletCheck: WalletCheckOption | undefined;
  readonly ton: TonOption | undefined;
}

/** A phrase drawn, before the page shows it. */
export interface DrawnPhrase {
  readonly phrase: string;
  /** Whether the page keeps the BIP39 passphrase: the wallet check drew the phrase for it. */
  readonly keepsPassphrase: boolean;
  /** Whether it was drawn for the Telegram wallet alone, whose tab may then open. */
  readonly forTelegram: boolean;
  /** Shows the done line once the phrase is in the field, with what became of the passphrase. */
  finish(passphrase: PassphraseOutcome): void;
}

/** A draw under way: its view, its clock, its speed and the phrases tried so far. */
interface Drawing {
  readonly run: GenerationRun;
  readonly clock: JobClock;
  readonly pace: DrawPace;
  draws: number;
}

/** The request of a draw without chosen words. */
function noWishes(wordCount: Bip39WordCount): ChosenWordsRequest {
  return { wordCount, chosen: [], neverUse: [] };
}

export class PhraseGeneration {
  readonly #parts: PhraseGenerationParts;
  #drawing: Drawing | undefined;

  constructor(parts: PhraseGenerationParts) {
    this.#parts = parts;
    parts.walletCheck?.onSpeed(() => this.#showOutlook());
  }

  /**
   * Draws a phrase of `words` words with the options ticked; undefined when it was refused, failed
   * or stopped, which the view under the buttons says. `passphrase` is the BIP39 passphrase that
   * the wallet check draws for; `pressed`, the Generate button, takes the focus back from Stop.
   */
  async draw(
    words: Bip39WordCount,
    passphrase: string,
    pressed?: HTMLElement,
  ): Promise<DrawnPhrase | undefined> {
    this.#stopDraws();
    const ton = this.#active(this.#parts.ton);
    const check = this.#active(this.#parts.walletCheck);
    const wishes = this.#wishes();
    const plan: GenerationPlan = {
      words,
      wishes: wishes !== undefined,
      // In the order they are tried: TON's check is the cheaper.
      conditions: [ton?.condition, check?.condition].filter(
        (condition): condition is GenerationCondition => condition !== undefined,
      ),
    };
    const expected = expectedDraws(plan.conditions);
    const drawing: Drawing = {
      run: this.#parts.progress.begin(
        drawStartLine(plan),
        plan.conditions.length === 0 ? undefined : () => this.cancel(),
        pressed,
      ),
      clock: new JobClock(),
      pace: new DrawPace(),
      draws: 0,
    };
    this.#drawing = drawing;
    const onDraws = (draws: number): void => {
      drawing.draws = draws;
      const elapsed = drawing.clock.elapsed();
      drawing.run.count(drawCountLine(draws, elapsed, expected, drawing.pace.add(elapsed, draws)));
    };
    try {
      let phrase: string;
      if (check !== undefined)
        phrase = await check.generate(
          words,
          passphrase,
          wishes?.request(words) ?? noWishes(words),
          ton?.condition,
          onDraws,
        );
      else if (ton !== undefined)
        phrase = await ton.generate(
          () => this.#drawing === drawing,
          onDraws,
          wishes === undefined ? undefined : () => wishes.generate(words),
        );
      else if (wishes !== undefined) phrase = await wishes.generate(words);
      else phrase = this.#parts.generateMnemonic(words);
      // A newer press, an edit of what is drawn or Clear won while the phrase was drawn.
      if (this.#drawing !== drawing) return undefined;
      return {
        phrase,
        keepsPassphrase: check !== undefined,
        forTelegram: ton !== undefined && check === undefined,
        finish: (outcome) =>
          drawing.run.done(drawDoneLine(plan, drawing.draws, drawing.clock.elapsed(), outcome)),
      };
    } catch (cause) {
      if (this.#drawing !== drawing) return undefined;
      // A wish that cannot be met is reported as an error; no ordinary phrase is put in its place.
      if (isAbortError(cause))
        drawing.run.stopped(drawStoppedLine(drawing.draws, drawing.clock.elapsed()));
      else
        drawing.run.fail(
          cause instanceof Error ? cause.message : "Secure phrase generation failed.",
        );
      return undefined;
    } finally {
      if (this.#drawing === drawing) this.#drawing = undefined;
    }
  }

  /** Shows a refusal before any draw, such as startup checks that have not passed. */
  refuse(text: string): void {
    this.#stopDraws();
    this.#parts.progress.refuse(text);
  }

  /** Stop: ends the draw under way and says so. */
  cancel(): void {
    const drawing = this.#drawing;
    this.#stopDraws();
    drawing?.run.stopped(drawStoppedLine(drawing.draws, drawing.clock.elapsed()));
  }

  /**
   * An option or a chosen word changed: the draw under way no longer fits and stops, a refusal of
   * the last press no longer applies, and the outlook follows the options.
   */
  optionsChanged(): void {
    this.cancel();
    this.#parts.progress.dismissError();
    this.#showOutlook();
  }

  /**
   * The phrase or the BIP39 passphrase was typed: a draw would replace the one or empty the other,
   * so it stops and says so; a done line no longer describes the fields.
   */
  sourceChanged(): void {
    if (this.#drawing === undefined) this.#parts.progress.dismissDone();
    else this.cancel();
  }

  /** Clear: any draw stops without a word, and nothing of the last stays. */
  reset(): void {
    this.#stopDraws();
    this.#parts.progress.reset();
    this.#showOutlook();
  }

  #stopDraws(): void {
    this.#drawing = undefined;
    this.#parts.walletCheck?.cancel();
    this.#parts.ton?.cancel();
  }

  #active<Option extends GenerationOption>(option: Option | undefined): Option | undefined {
    return option?.active() === true ? option : undefined;
  }

  /**
   * The chosen-words panel while it shapes the draw: ticked, with a chosen word or a word never to
   * use. MHFE's specification counts both as wishes that take a phrase outside its analysis.
   */
  #wishes(): ChosenWordsFeature | undefined {
    return this.#parts.chosenWords?.active() === true ? this.#parts.chosenWords : undefined;
  }

  /** The lines under the options while an option that checks the phrase is ticked. */
  #showOutlook(): void {
    const { chosenWords, outlook } = this.#parts;
    const ton = this.#active(this.#parts.ton);
    const check = this.#active(this.#parts.walletCheck);
    const conditions = [ton?.condition, check?.condition].filter(
      (condition): condition is GenerationCondition => condition !== undefined,
    );
    chosenWords?.setConditioned(conditions.length > 0);
    const first = conditions[0];
    if (first === undefined) {
      this.#parts.walletCheck?.speed(null);
      outlook.show(null);
      return;
    }
    const words = first.words;
    const wishes: ChosenWordsRequest = this.#wishes()?.request(words) ?? noWishes(words);
    let bits: { readonly text: string; readonly alert: boolean };
    try {
      bits = bitsOutlook(wishes, conditions);
    } catch (cause) {
      // Wishes the generator refuses: the outlook says why.
      bits = {
        text: cause instanceof Error ? cause.message : "These wishes cannot be met.",
        alert: true,
      };
    }
    // The speed does not depend on the chosen words, which never reach a measurement.
    const speed = check?.speed(ton !== undefined);
    outlook.show({
      bits,
      time: speed === undefined ? null : timeOutlook(speed, conditions),
      note: check === undefined ? null : (ton?.condition.passphraseNote ?? null),
    });
  }
}
