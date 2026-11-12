// One worker's part of the Deriver's wallet-check draw (MHFE-WALLET-CHECK-SEED-1): fresh phrases
// from crypto.getRandomValues(), TON's check first when asked (ton-draw-precheck.ts), then the
// seed's PBKDF2 and the check, all by the worker's engine (pbkdf2-sha512.ts). The page gives its
// first two workers WebCrypto, which the browser runs on one or two threads of its own, and any
// further one JavaScript, which runs on the worker's own thread (wallet-check-draw.ts). A
// measurement of speed draws for a while with a public passphrase and reports how many phrases it
// tried after a warm-up, never a phrase. wallet-check-draw-worker.ts runs this in its worker.
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { drawWalletCheckPhrase } from "@ckd/core/bip39-wallet-check.js";
import {
  javascriptPbkdf2Sha512,
  webCryptoPbkdf2Sha512,
  type Pbkdf2Sha512,
} from "@ckd/core/pbkdf2-sha512.js";
import type { RandomBytes } from "@ckd/core/random-byte-source.js";
import { tonDrawPrecheck } from "./ton-draw-precheck.js";

/** Where a worker's PBKDF2 runs: the browser's WebCrypto, or JavaScript on the worker's thread. */
export type DrawEngine = "webcrypto" | "javascript";

/** What a draw is given: the wishes for the phrase, the wallet's passphrase and its conditions. */
export interface WalletCheckDrawRequest {
  readonly wishes: ChosenWordsRequest;
  readonly passphrase: string;
  /** Whether the phrase must also pass TON's check, tried before the wallet check. */
  readonly ton: boolean;
  readonly engine: DrawEngine;
  /** Set for a measurement of speed: the draws are counted for this many milliseconds. */
  readonly measureMilliseconds?: number;
}

/** How many phrases a worker tried in how long. */
export interface DrawSpeedSample {
  readonly draws: number;
  readonly milliseconds: number;
}

/** A draw's answer: its phrase and the phrases this worker tried, or a measurement's sample. */
export type WalletCheckDrawn =
  { readonly phrase: string; readonly draws: number } | { readonly measured: DrawSpeedSample };

/** A draw's progress: the phrases this worker has tried. */
export interface WalletCheckDrawProgress {
  readonly draws: number;
}

/** The least time between two progress messages: the page shows a few lines a second. */
const PROGRESS_INTERVAL_MS = 200;
/**
 * The first draws of a measurement are not counted: they start the engine and compile the code,
 * and counted they would make the speed look lower than it is.
 */
const MEASURE_WARMUP_MS = 300;

/** The reason a measurement's draw stops: its time is over. */
const MEASURED = new Error("The measurement's time is over.");

const ENGINES: Readonly<Record<DrawEngine, Pbkdf2Sha512>> = Object.freeze({
  webcrypto: webCryptoPbkdf2Sha512,
  javascript: javascriptPbkdf2Sha512,
});

/** What a test passes instead of the browser's (CORE-09, CORE-46). */
export interface DrawJobEdges {
  readonly randomBytes?: RandomBytes;
  readonly now?: () => number;
}

/**
 * Runs `request`: a phrase that passes its conditions, or for a measurement the phrases tried per
 * time after the warm-up. `onProgress` is told the phrases tried, a few times a second.
 */
export async function runDrawJob(
  request: WalletCheckDrawRequest,
  onProgress: (progress: WalletCheckDrawProgress) => void,
  { randomBytes, now = () => performance.now() }: DrawJobEdges = {},
): Promise<WalletCheckDrawn> {
  const derive = ENGINES[request.engine];
  const precheck = request.ton ? await tonDrawPrecheck(derive) : undefined;
  const counted = request.measureMilliseconds;
  // A measurement ends by the clock read after each draw, not by a timer: a worker that computes
  // in JavaScript never returns to its event loop while it draws, so a timer would never fire.
  const end = counted === undefined ? undefined : new AbortController();
  const signal = end?.signal;
  const started = now();
  let tried = 0;
  let reported = started;
  // The measurement's count starts after its warm-up, at the first draw that ends after it.
  let base: { readonly draws: number; readonly at: number } | undefined;
  const sample = (): WalletCheckDrawn => {
    const from = base ?? { draws: 0, at: started };
    return { measured: { draws: tried - from.draws, milliseconds: now() - from.at } };
  };
  try {
    const phrase = await drawWalletCheckPhrase(request.wishes, request.passphrase, {
      ...(signal === undefined ? {} : { signal }),
      ...(precheck === undefined ? {} : { precheck }),
      ...(randomBytes === undefined ? {} : { randomBytes }),
      derive,
      onDraws: (draws) => {
        tried = draws;
        const at = now();
        if (end !== undefined && counted !== undefined) {
          if (base === undefined && at - started >= MEASURE_WARMUP_MS) base = { draws, at };
          if (at - started >= MEASURE_WARMUP_MS + counted) end.abort(MEASURED);
          return;
        }
        if (at - reported < PROGRESS_INTERVAL_MS) return;
        reported = at;
        onProgress({ draws });
      },
    });
    // A measurement keeps no phrase, even one that passed with its public passphrase.
    return signal === undefined ? { phrase, draws: tried } : sample();
  } catch (cause) {
    if (cause === MEASURED) return sample();
    throw cause;
  }
}
