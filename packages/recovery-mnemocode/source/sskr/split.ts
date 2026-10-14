// Splits a BIP39 seed phrase into the SSKR shares of one group, and checks that they give it back.
//
// Needs from the host: a SharePlatform (share-platform.ts) for its SSKR library, createShares and
// combineShares, and a function that fills a buffer with secure random bytes, for the seed of the
// split (crypto.getRandomValues in a browser, nodeFillRandom in Node.js).
// Does not: run the SSKR self-test (the Node.js wrapper in shares.ts does, before it splits), or
// write the shares in a form other than their UR (transport.ts writes them). A backup is masked
// first in its mode (splitBackup, through core/masking.ts), so that every host splits alike.

import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { englishWordlist as wordlist } from "../core/english-words.js";
import { validatedEnglishWords } from "../core/words.js";
import { Masking, type SplitMode } from "../core/masking.js";
import type { DateShiftDate } from "../core/types.js";
import { ONE_GROUP, SEED_BYTES, type SharePlatform } from "./share-platform.js";
import { Share } from "./transport.js";
import { isRecordedQuorum, MAX_GROUP_MEMBERS, MIN_DIGEST_THRESHOLD } from "./share-layout.js";
import { restoreCompleteShares } from "./complete-shares.js";

/** A split makes one group, of at most as many members as SSKR numbers (MAX_GROUP_MEMBERS). */
export const MAX_SHARES = MAX_GROUP_MEMBERS;
/** The least threshold of a split: one whose shares keep a digest (MIN_DIGEST_THRESHOLD). */
export const MIN_THRESHOLD = MIN_DIGEST_THRESHOLD;

/** A seed phrase to split into shares, with the mode that masks it first and that mode's dates. */
export interface BackupSplitRequest {
  readonly mnemonic: string;
  /** A mode in which shares are made (Masking.isSplitMode); another is refused. */
  readonly mode: SplitMode;
  /** The Seedshift dates; none without Seedshift. */
  readonly dates: readonly DateShiftDate[];
  readonly threshold: number;
  readonly count: number;
}

/** A backup split into shares: the shares, the seed phrase, and the phrase that they hold. */
export interface BackupSplit {
  /** The shares as UR records, in member order. */
  readonly records: string[];
  /** The seed phrase, every word in full. */
  readonly original: string;
  /** The phrase the shares hold: the seed phrase itself, or its Seedshift mask (Masking.held). */
  readonly held: string;
}

/**
 * A split of seed phrases into shares, bound once to the host's SSKR library and randomness. A
 * class, so that a page builds it once with its services and calls split for each phrase; it keeps
 * no secret between two splits: the entropy and the seed of each are wiped before it returns.
 */
export class ShareSplit {
  readonly #platform: SharePlatform;
  readonly #fillRandom: (bytes: Uint8Array) => void;

  constructor(platform: SharePlatform, fillRandom: (bytes: Uint8Array) => void) {
    this.#platform = platform;
    this.#fillRandom = fillRandom;
  }

  /**
   * Refuses a threshold and share count that SSKR cannot split into: a quorum that recorded shares
   * may have (isRecordedQuorum), with a split's own least threshold, MIN_THRESHOLD.
   */
  static validateThreshold(threshold: number, count: number): void {
    if (!isRecordedQuorum(threshold, count) || threshold < MIN_THRESHOLD)
      throw new Error(
        `A split needs a threshold from ${MIN_THRESHOLD} to the number of shares, and at most ${MAX_SHARES} shares: with a threshold of 1 no share would be checked.`,
      );
  }

  /**
   * The `count` shares of `mnemonic`, `threshold` of them needed, as UR records in member order.
   * The first `threshold` are restored before they are returned, and must give the phrase back.
   */
  async split(mnemonic: string, threshold: number, count: number): Promise<string[]> {
    ShareSplit.validateThreshold(threshold, count);
    const entropy = mnemonicToEntropy(validatedEnglishWords(mnemonic).join(" "), wordlist);
    const seed = new Uint8Array(SEED_BYTES);
    try {
      this.#fillRandom(seed);
      const records = await this.#platform.createShares(entropy, threshold, count, seed);
      if (records.length !== count)
        throw new Error("SSKR engine returned an unexpected share count.");
      const shares = Share.readSet(records);
      ShareSplit.#assertAsked(shares, threshold, entropy.length);
      const validated = shares.map((share) => share.ur);
      await this.#assertRestores(validated, entropy);
      return validated;
    } finally {
      entropy.fill(0);
      seed.fill(0);
    }
  }

  /**
   * The shares of a backup: the phrase that `mnemonic` makes in its mode with its dates
   * (Masking.held), split as `split` splits it. The command line and a page split a backup through
   * it, so that both put the same phrase into the shares.
   */
  async splitBackup(request: BackupSplitRequest): Promise<BackupSplit> {
    // Every field of the request is read once, before the split waits: a host's object may change
    // meanwhile or answer differently when read again, and a backup is made of one request alone
    // (AUD-015-API002, AUD-016).
    const { mnemonic, mode, dates, threshold, count } = request;
    Masking.assertSplitMode(mode);
    const original = validatedEnglishWords(mnemonic).join(" ");
    const held = Masking.of(mode).held(mnemonic, dates);
    const records = await this.split(held, threshold, count);
    return { records, original, held };
  }

  /**
   * Refuses shares that are not those asked for: the platform is trusted to split as asked, and
   * this binds what it returned to the request before a backup is handed out. Each must be of one
   * group (ONE_GROUP) of `threshold`, hold a secret of `secretBytes`, and be the member of its
   * place; Share.readSet has checked that all are of one set, none twice.
   */
  static #assertAsked(shares: readonly Share[], threshold: number, secretBytes: number): void {
    const asked = shares.every(({ info }, member) => {
      const oneGroup = info.groupThreshold === ONE_GROUP && info.groupCount === ONE_GROUP;
      return (
        oneGroup &&
        info.groupIndex === 0 &&
        info.memberThreshold === threshold &&
        info.memberIndex === member &&
        info.secretLength === secretBytes
      );
    });
    if (!asked) throw new Error("SSKR engine returned shares of another split than asked.");
  }

  /**
   * Refuses shares that do not give `entropy` back, every one of them checked: the restore of
   * complete shares (restoreCompleteShares) uses each surplus member once in place of one of the
   * first, so that a wrong surplus share is refused too, not only one of the first `threshold`.
   */
  async #assertRestores(records: readonly string[], entropy: Uint8Array): Promise<void> {
    // The restore's own refusal names a share as typed, which a split has not: it is told as this.
    const restored = await restoreCompleteShares(records, this.#platform).catch(() => undefined);
    // The phrase as words, compared with the phrase of `entropy`: the restore wipes its entropy.
    if (restored?.mnemonic !== entropyToMnemonic(entropy, wordlist))
      throw new Error("SSKR generated shares did not reconstruct the source entropy.");
  }
}
