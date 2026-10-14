import { checkSskrKnownAnswers } from "../../recovery-mnemocode/source/sskr/known-answers.js";
import type { SharePlatform } from "../../recovery-mnemocode/source/sskr/share-platform.js";

/** A host's SSKR engine, checked on its first use with MnemoCode's public known answers. */
export class CheckedSskrPlatform implements SharePlatform {
  readonly #unchecked: SharePlatform;
  #checked: Promise<void> | undefined;

  constructor(unchecked: SharePlatform) {
    this.#unchecked = unchecked;
  }

  readonly hmacSha256: SharePlatform["hmacSha256"] = (key, message) =>
    this.#unchecked.hmacSha256(key, message);

  readonly combineShares: SharePlatform["combineShares"] = async (records) => {
    await this.#ensureReady();
    return this.#unchecked.combineShares(records);
  };

  readonly createShares: SharePlatform["createShares"] = async (secret, threshold, count, seed) => {
    await this.#ensureReady();
    return this.#unchecked.createShares(secret, threshold, count, seed);
  };

  #ensureReady(): Promise<void> {
    // Use the raw engine to avoid calling this gate recursively. A failed check stays closed.
    return (this.#checked ??= checkSskrKnownAnswers(this.#unchecked));
  }
}
