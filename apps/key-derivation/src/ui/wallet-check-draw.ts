// The Deriver's wallet-check draw (MHFE-WALLET-CHECK-SEED-1) on a few workers at once: each draws
// fresh phrases independently; the phrase of the first worker that finds one is the answer, and the
// others are terminated. Which worker finds first depends on time alone, never on the phrases, so
// every passing phrase stays equally likely. Stop terminates them all; nothing they held survives.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { RecoveryWorker } from "../workers/recovery-worker-client.js";
import { RecoveryWorkerWordlists } from "../workers/recovery-worker-wordlists.js";
import type {
  WalletCheckDrawn,
  WalletCheckDrawProgress,
  WalletCheckDrawRequest,
} from "../workers/wallet-check-draw-worker.js";

declare const __WALLET_CHECK_DRAW_WORKER_SOURCE__: string;

/** At most this many workers draw at once; MHFE measured 4 against one (2026-11-04). */
const MOST_WORKERS = 4;

type DrawWorker = RecoveryWorker<WalletCheckDrawRequest, WalletCheckDrawn, WalletCheckDrawProgress>;

/** One draw: started once, stopped at any time. */
export class WalletCheckDraw {
  #workers: DrawWorker[] = [];

  /**
   * A 24-word phrase that meets `wishes` and passes the wallet check with `passphrase`; undefined
   * when it was stopped. `onDraws` is told the phrases tried by all the workers together.
   */
  async run(
    wishes: ChosenWordsRequest,
    passphrase: string,
    onDraws: (draws: number) => void,
  ): Promise<string | undefined> {
    const count = Math.max(1, Math.min(MOST_WORKERS, navigator.hardwareConcurrency || 1));
    const tried = Array.from({ length: count }, () => 0);
    this.#workers = Array.from(
      { length: count },
      () =>
        new RecoveryWorker<WalletCheckDrawRequest, WalletCheckDrawn, WalletCheckDrawProgress>(
          __WALLET_CHECK_DRAW_WORKER_SOURCE__,
          {
            publicPrelude: RecoveryWorkerWordlists.prelude("bip39", wordlist),
            label: "wallet check",
            errorPrefix: "wallet.wallet-check-worker",
          },
        ),
    );
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        let open = count;
        // A worker that stops or fails leaves the others drawing; the last one settles the draw.
        const ended = (settle: () => void): void => {
          open -= 1;
          if (open === 0) settle();
        };
        this.#workers.forEach((worker, index) => {
          worker
            .run({ wishes, passphrase }, ({ draws }) => {
              tried[index] = draws;
              onDraws(tried.reduce((sum, value) => sum + value, 0));
            })
            .then(
              (outcome) =>
                "phrase" in outcome ? resolve(outcome.phrase) : ended(() => resolve(undefined)),
              (cause: unknown) => ended(() => reject(cause)),
            );
        });
      });
    } finally {
      this.stop();
    }
  }

  /** Terminates every worker of the draw. */
  stop(): void {
    const workers = this.#workers;
    this.#workers = [];
    for (const worker of workers) worker.terminate();
  }
}
