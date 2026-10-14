// The shares the page shows last, made by "Split into Shamir shares" or written again by the repair
// of "A code of a Shamir share", for the card export, which can print them as cards, as MnemoCode's
// sskr-split and sskr-export do: feature modules, built separately, meet here without importing
// each other. The shares are recovery material: they are kept only while their result is shown.
import type { ShareFormat } from "../../../../packages/recovery-mnemocode/source/sskr/transport.js";

export interface HeldShares {
  /** The shares as SSKR UR records, in the order shown. */
  readonly records: readonly string[];
  /** The form they are written in. */
  readonly form: ShareFormat;
  /** A Seedshift split: they hold the masked phrase (decoy), which only the dates turn back. */
  readonly masked: boolean;
  /** Where they come from, which the card export names. */
  readonly origin: "split" | "repair";
}

class LatestShares {
  #shares: HeldShares | undefined;
  readonly #listeners = new Set<() => void>();

  get shares(): HeldShares | undefined {
    return this.#shares;
  }

  /** Keeps the shares of a new split or repair, or forgets them when its result is cleared. */
  set shares(shares: HeldShares | undefined) {
    this.#shares = shares === undefined ? undefined : { ...shares, records: [...shares.records] };
    for (const listener of this.#listeners) listener();
  }

  /** Forgets the shares from `origin` only: a cleared repair leaves a newer split's shares. */
  forget(origin: HeldShares["origin"]): void {
    if (this.#shares?.origin === origin) this.shares = undefined;
  }

  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }
}

export const latestShares = new LatestShares();
