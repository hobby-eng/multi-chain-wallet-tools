// What a new phrase keeps of its randomness with the words chosen for it, as MHFE rates it before
// the draw (MhfeWallet.describeDraw), kept up to date as the person types: MHFE's New wallet tab and
// the MHFE wallet check of Generate & Derive show it the same way.
import type { MhfeChosenWord, MhfeDrawOdds } from "@ckd/recovery-mhfe-wasm/wallet/wallet.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { describe, drawOutlook } from "./recovery-mhfe-status.js";

/** The words a new phrase must hold and must not hold, as MhfeWallet takes them. */
export interface MhfeWishes {
  readonly chosen: readonly MhfeChosenWord[];
  readonly neverUse: readonly string[];
}

export const NO_WISHES: MhfeWishes = { chosen: [], neverUse: [] };

export class MhfeDrawOutlook {
  readonly #element: HTMLElement;
  readonly #engine: MhfeEngine;
  /** Counts the calls of show(), so that only the newest one's answer is shown. */
  #revision = 0;

  constructor(element: HTMLElement, engine: MhfeEngine) {
    this.#element = element;
    this.#engine = engine;
  }

  /**
   * Shows what `wishes` keep, with or without the wallet check, and resolves to MHFE's odds: or
   * to undefined when MHFE could not rate them or a newer call came first.
   */
  async show(wishes: MhfeWishes, walletCheck: boolean): Promise<MhfeDrawOdds | undefined> {
    const revision = ++this.#revision;
    let odds: MhfeDrawOdds | undefined;
    let text: string | null;
    try {
      const wallet = await this.#engine.wallet();
      odds = await wallet.describeDraw({
        chosen: [...wishes.chosen],
        neverUse: [...wishes.neverUse],
        walletCheck,
      });
      text = drawOutlook(odds, await this.#engine.walletParameters());
    } catch (cause) {
      odds = undefined;
      text = describe(cause, "MHFE could not rate these words.");
    }
    if (revision !== this.#revision) return undefined;
    this.#element.textContent = text ?? "";
    this.#element.hidden = text === null;
    return odds;
  }

  clear(): void {
    this.#revision += 1;
    this.#element.textContent = "";
    this.#element.hidden = true;
  }
}
