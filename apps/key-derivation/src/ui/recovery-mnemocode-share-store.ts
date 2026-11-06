// The shares the page shows last, made by "Split into Shamir shares" or written again by the repair
// of "A code of a Shamir share", for the card export, which can print them as cards, as MnemoCode's
// sskr-split and sskr-export do: feature modules, built separately, meet here without importing
// each other. The shares are recovery material: they are kept only while their result is shown.
import type { ShareFormat } from "@ckd/recovery-backup/mnemocode-facts.js";
import { SecretValue } from "@ckd/core/secret-value.js";

/** A temporary view for the selected card export; copied native strings cannot be recalled. */
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

/** Owns retained share records in bytes, with only format/origin facts outside their owner. */
export class LatestShares implements Disposable {
  #records: SecretValue<readonly string[]> | undefined;
  // A stable current view preserves caller identity; its records getter retains only the byte owner.
  #view: HeldShares | undefined;
  readonly #listeners = new Set<() => void>();

  /** Current view identity; each records read is temporary and is refused after replacement/wipe. */
  get shares(): HeldShares | undefined {
    return this.#view;
  }

  /** Keeps the shares of a new split or repair, or forgets them when its result is cleared. */
  set shares(shares: HeldShares | undefined) {
    const metadata =
      shares === undefined
        ? undefined
        : { form: shares.form, masked: shares.masked, origin: shares.origin };
    const next = shares === undefined ? undefined : SecretValue.utf16Texts(shares.records);
    let view: HeldShares | undefined;
    if (next !== undefined && metadata !== undefined) {
      const records = next;
      view = Object.freeze({
        ...metadata,
        get records() {
          return records.value;
        },
      });
    }
    this.#records?.wipe();
    this.#records = next;
    this.#view = view;
    for (const listener of this.#listeners) listener();
  }

  /** Forgets the shares from `origin` only: a cleared repair leaves a newer split's shares. */
  forget(origin: HeldShares["origin"]): void {
    if (this.#view?.origin === origin) this.wipe();
  }

  /** Observe public availability/format changes; callbacks do not receive retained records. */
  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  /** Revoke the current set and wipe its owned bytes as far as the runtime permits. */
  wipe(): void {
    this.shares = undefined;
  }

  /** End the same share-set lifetime as explicit wipe. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Compatibility meeting point for the separately composed split/repair and card-export features. */
export const latestShares = new LatestShares();
