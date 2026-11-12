// The Deriver's wallet-check draw (MHFE-WALLET-CHECK-SEED-1) on the workers the person chooses:
// each draws fresh phrases independently; the phrase of the first worker that finds one is the
// answer, and the others are terminated. The first two workers compute on WebCrypto, which the
// browser runs on one or two threads of its own, and any further one in JavaScript on its own
// thread, which adds speed where the computer has power to spare
// (packages/crypto-core/src/pbkdf2-sha512.ts has the measurements). Every worker computes the same
// conditions, so which one finds first depends on how many draws each needed and on its speed,
// and on the phrase it found only through its byte length (the NFKD and UTF-8 work before PBKDF2
// takes time per byte), and negligibly (SECURITY.md, "The wallet check and its proof"). Stop
// terminates them all; nothing they held survives. The same workers measure the speed of a draw
// before one starts.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { RecoveryWorker } from "../workers/recovery-worker-client.js";
import { RecoveryWorkerWordlists } from "../workers/recovery-worker-wordlists.js";
import type {
  DrawEngine,
  DrawSpeedSample,
  WalletCheckDrawn,
  WalletCheckDrawProgress,
  WalletCheckDrawRequest,
} from "../workers/wallet-check-draw-job.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

declare const __WALLET_CHECK_DRAW_WORKER_SOURCE__: string;

/**
 * The public passphrase of a measurement: the speed of a draw depends on the passphrase barely,
 * through the salt's length, and the person's own never reaches a measurement.
 */
const SPEED_PASSPHRASE = "speed check";
/**
 * The workers that compute on WebCrypto: Chromium runs all of a page's WebCrypto work on one thread
 * and Firefox on about two, where it is about 6 times faster per call than JavaScript; a further
 * WebCrypto worker would only wait for them. Two were faster than one in both (Chromium by a tenth,
 * Firefox by three quarters).
 */
const WEBCRYPTO_WORKERS = 2;
const MILLISECONDS_PER_SECOND = 1000;

const ERRORS = new ErrorCatalog("wallet.wallet-check-speed", {
  measure: () => "A worker gave no measurement of the draw's speed.",
});

/** What a draw asks of its workers. */
export interface DrawWork {
  readonly wishes: ChosenWordsRequest;
  /** Whether the phrase must also pass TON's check, tried first. */
  readonly ton: boolean;
  /** How many workers draw at once. */
  readonly threads: number;
}

/** The phrases all the workers of a measurement tried per second together. */
export interface DrawSpeed {
  readonly drawsPerSecond: number;
}

type DrawWorker = RecoveryWorker<WalletCheckDrawRequest, WalletCheckDrawn, WalletCheckDrawProgress>;

function startWorker(): DrawWorker {
  return new RecoveryWorker<WalletCheckDrawRequest, WalletCheckDrawn, WalletCheckDrawProgress>(
    __WALLET_CHECK_DRAW_WORKER_SOURCE__,
    {
      publicPrelude: RecoveryWorkerWordlists.prelude("bip39", wordlist),
      label: "wallet check",
      errorPrefix: "wallet.wallet-check-worker",
    },
  );
}

/** One draw or one measurement: started once, stopped at any time. */
export class WalletCheckDraw {
  readonly #startWorker: () => DrawWorker;
  #workers: DrawWorker[] = [];
  /** Whether stop() was called: a measurement stopped gives no speed. */
  #stopped = false;

  /** `start` starts one worker; a test passes a fake of the worker boundary (CORE-09). */
  constructor(start: () => DrawWorker = startWorker) {
    this.#startWorker = start;
  }

  /**
   * A 24-word phrase that meets the wishes, passes TON's check when asked and passes the wallet
   * check with `passphrase`; undefined when it was stopped. `onDraws` is told the phrases tried by
   * all the workers together.
   */
  run(
    work: DrawWork,
    passphrase: string,
    onDraws: (draws: number) => void,
  ): Promise<string | undefined> {
    const tried = Array.from({ length: work.threads }, () => 0);
    return this.#each(work, { passphrase }, (index, draws) => {
      tried[index] = draws;
      onDraws(tried.reduce((sum, value) => sum + value, 0));
    });
  }

  /**
   * How fast the draw of `work` runs on this computer: every worker draws for `milliseconds` with
   * a public passphrase. Undefined when it was stopped; a worker's failure rejects.
   */
  async measure(work: DrawWork, milliseconds: number): Promise<DrawSpeed | undefined> {
    const samples: DrawSpeedSample[] = [];
    await this.#each(
      work,
      { passphrase: SPEED_PASSPHRASE, measureMilliseconds: milliseconds },
      () => undefined,
      samples,
    );
    if (this.#stopped) return undefined;
    if (samples.length < work.threads) throw ERRORS.create("measure", []);
    // Each worker's own rate, summed: the workers ran side by side.
    const perMillisecond = samples.reduce(
      (sum, sample) => sum + sample.draws / Math.max(1, sample.milliseconds),
      0,
    );
    return { drawsPerSecond: perMillisecond * MILLISECONDS_PER_SECOND };
  }

  /** Terminates every worker of the draw. */
  stop(): void {
    this.#stopped = true;
    this.#terminate();
  }

  #terminate(): void {
    const workers = this.#workers;
    this.#workers = [];
    for (const worker of workers) worker.terminate();
  }

  /**
   * Starts `work.threads` workers on one request. A phrase settles at once. A worker that stops or
   * fails leaves the others drawing; the last one to end settles the draw.
   */
  async #each(
    work: DrawWork,
    request: Pick<WalletCheckDrawRequest, "passphrase" | "measureMilliseconds">,
    onDraws: (index: number, draws: number) => void,
    samples?: DrawSpeedSample[],
  ): Promise<string | undefined> {
    this.#workers = Array.from({ length: work.threads }, () => this.#startWorker());
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        let open = work.threads;
        const ended = (settle: () => void): void => {
          open -= 1;
          if (open === 0) settle();
        };
        this.#workers.forEach((worker, index) => {
          const engine: DrawEngine = index < WEBCRYPTO_WORKERS ? "webcrypto" : "javascript";
          worker
            .run({ ...request, wishes: work.wishes, ton: work.ton, engine }, ({ draws }) =>
              onDraws(index, draws),
            )
            .then(
              (outcome) => {
                if ("phrase" in outcome) {
                  onDraws(index, outcome.draws);
                  resolve(outcome.phrase);
                  return;
                }
                if ("measured" in outcome) samples?.push(outcome.measured);
                ended(() => resolve(undefined));
              },
              (cause: unknown) => ended(() => reject(cause)),
            );
        });
      });
    } finally {
      this.#terminate();
    }
  }
}
