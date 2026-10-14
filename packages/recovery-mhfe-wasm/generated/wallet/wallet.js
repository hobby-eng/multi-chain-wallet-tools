// The wallet module of the mhfe browser package: the wallet check of a recovered phrase
// (MHFE-WALLET-CHECK-SEED-1), master key fingerprints, what an address check searches, and new
// 24-word phrases. No Argon2. A page supplies the module's files as text and bytes:
//
//   const wallet = new MhfeWallet({
//     workerSource,   // text of runtime/worker.js
//     wasm,           // runtime/mhfe.wasm as a Uint8Array or a WebAssembly.Module
//   });
//
// A page that uses several module classes compiles runtime/mhfe.wasm once, with
// WebAssembly.compile, and passes the WebAssembly.Module to each.
//
// Every method returns a promise and reports every error by rejecting it; none throws when it is
// called. Each call runs in a worker of its own, terminated afterwards. A new phrase is a
// JavaScript string, which cannot be wiped: a page shows it only on request and drops it soon
// after. The first call waits for the class's startup check (startupCheck()).

import {
  MhfeError,
  HIGHEST_WORD_POSITION,
  MhfeModuleClass,
  ModuleWorker,
  OperationSlot,
  encodeSecret,
  requireCallback,
  requireSecret,
  requireText,
  secretOrEmpty,
  wipeSecrets,
  wordHintsOf,
} from "../runtime/runtime.js";

export { MhfeCancelledError, MhfeError } from "../runtime/runtime.js";

/** Workers that draw a checked phrase at once by default; each takes a processor core. */
const MOST_DRAW_WORKERS = 8;
/**
 * The most workers a page may ask for, far above the cores of any processor a page runs on: a
 * bound, so that a mistaken count is refused before any passphrase is copied (AUD-012-SEC001).
 */
const HIGHEST_DRAW_WORKERS = 256;

/** The name of this module's operations in the package's worker. */
const WALLET_MODULE = "wallet";
/** The build of this file, which scripts/stamp-build-id.mjs writes; see BUILD_ID in the runtime. */
const WALLET_BUILD_ID = "4f5000f4290fa5eb";

export class MhfeWallet extends MhfeModuleClass {
  #module;
  /** The drawing of a phrase, the class's one long operation, held as MhfeClient holds its own. */
  #slot = new OperationSlot();

  constructor({ workerSource, wasm } = {}) {
    const module = new ModuleWorker({
      module: WALLET_MODULE,
      workerSource,
      wasm,
      classFile: "wallet/wallet.js",
      classBuildId: WALLET_BUILD_ID,
      needs: ["random"],
      secrets: true,
    });
    super(module);
    this.#module = module;
  }

  /**
   * Whether a recovered 24-word phrase passes the wallet check with the owner's BIP39 passphrase.
   * The check is offered with a passphrase only: an empty one is refused
   * (WALLET_CHECK_NEEDS_PASSPHRASE), and so is a phrase of another length (INVALID_WORD_COUNT).
   * A pass is evidence, not proof, and never says which wallet it is.
   */
  async walletCheck({ phrase, passphrase } = {}) {
    requireText(phrase, "phrase");
    const given = secretOrEmpty(passphrase, "passphrase");
    await this.#module.ready();
    return this.#module.run(phraseRequest("walletCheck", phrase, given));
  }

  /**
   * The hint below a line of BIP39 words being typed, such as a seed phrase, a container phrase,
   * repair words or a chosen word, by the rule of the command-line tool: `{ hint, count, words,
   * completion: { letters, wordEnds } }`, `hint` being "count" after one letter of the last word,
   * with how many words begin with it, "words" from two letters, with those words, "noWord" when
   * none does, and "nothing" otherwise; `completion` is what Tab adds. Each call starts a worker:
   * a page may ask once typing pauses.
   */
  async wordHints({ typed } = {}) {
    return wordHintsOf(this.#module, typed);
  }

  /** The master key fingerprint of a phrase with a BIP39 passphrase, which may be empty. */
  async fingerprint({ phrase, passphrase } = {}) {
    requireText(phrase, "phrase");
    const given = secretOrEmpty(passphrase, "passphrase");
    await this.#module.ready();
    return this.#module.run(phraseRequest("fingerprint", phrase, given));
  }

  /**
   * What an address check would search, to show before it runs: `{ type, search, addresses,
   * onlyPath }`. `coin`, required, is a coin id of parameters().coins; `path` limits the search
   * to one path. No coin is the default, so that a page for one coin names no other. `scanGap`, 0
   * by default for the usual search, states instead the first account's first `scanGap`
   * receiving and change addresses, where MhfeClient.searchDecoy() looks for two missing words.
   */
  async describeAddress({ address, coin, path = "", scanGap = 0 } = {}) {
    requireText(address, "address");
    if (coin === undefined) {
      throw new TypeError("coin must name the coin of the address, an id of parameters().coins.");
    }
    requireText(coin, "coin");
    requireText(path, "path");
    if (!Number.isSafeInteger(scanGap) || scanGap < 0) {
      throw new TypeError("scanGap must be 0 or a whole number of addresses.");
    }
    await this.#module.ready();
    return this.#module.run({ operation: "describeAddress", address, coin, path, scanGap });
  }

  /**
   * What a new phrase drawn with these wishes keeps of its randomness, before it is drawn:
   * `{ randomBits, randomness, expectedDraws, recognisable, fixedPosition }`. `randomness` is
   * "full" for all 256 bits, "ample" from parameters().recommendedRandomBits (240: still far more
   * than enough, as with the wallet check alone) and "notRecommended" below it, rated without a
   * word never to use, whose 0.016 bits do not matter. The limits of one chosen word and one word
   * never to use keep at least 228.98 bits with the check and 244.98 without. A page shows a
   * warning for anything but "full", and another when `recognisable`: someone who learns or
   * guesses the chosen word can rule out almost every wrong MHFE password with it and tell the
   * wallet from a decoy. `fixedPosition` says the chosen word has a position, where "anywhere"
   * would keep more. `chosen` and `neverUse` as for drawPhrase(); `walletCheck` whether the phrase
   * will get the check.
   */
  async describeDraw({ chosen = [], neverUse = [], walletCheck = false } = {}) {
    const wishes = wishesOf(chosen, neverUse);
    if (typeof walletCheck !== "boolean") throw new TypeError("walletCheck must be true or false.");
    await this.#module.ready();
    const message = {
      operation: "describeDraw",
      chosenWords: encodeSecret(wishes.words, "chosen words"),
      places: wishes.places,
      neverUse: wishes.neverUse,
      walletCheck,
    };
    return this.#module.run(message);
  }

  /**
   * Draws a new 24-word phrase from the browser's random generator. With a passphrase, typed twice,
   * the page must say whether the phrase gets the wallet check (`walletCheck`, a required boolean
   * then, never preselected). A checked phrase takes about 65,536 BIP39 seeds: it is drawn on
   * `workers` workers at once, by default as many as the processor's cores up to eight, and the
   * first phrase found is taken, every passing phrase being equally likely. `chosen`, at most
   * parameters().maxChosenWords (1) `{ word, position }` with `position` from 1 to 24 or
   * "anywhere", which is not recommended, and `neverUse`, at most
   * parameters().maxNeverUseWords (1) word the phrase must not hold, are met the same way;
   * describeDraw() tells what they cost first. `onProgress({ stage: "draw", draws })` reports the
   * draws of all workers; cancel() stops them. Resolves to `{ phrase, words, walletCheck,
   * fingerprintWithPassphrase, workers }`.
   */
  async drawPhrase({
    passphrase,
    passphraseRepeat,
    walletCheck,
    workers,
    chosen = [],
    neverUse = [],
    onProgress,
  } = {}) {
    requireCallback(onProgress, "onProgress");
    const wishes = wishesOf(chosen, neverUse);
    this.#slot.requireIdle();
    // Left out, the passphrase and its repetition are empty; given, each must be a secret, even
    // where it is not compared, so that a wrong type is never taken as no passphrase.
    const given = secretOrEmpty(passphrase, "passphrase");
    const repeat = secretOrEmpty(passphraseRepeat, "repeated passphrase");
    const hasPassphrase = given.length !== 0;
    // Required with a passphrase, never preselected; a value given without one is still checked
    // (AUD-015-API001).
    if (hasPassphrase && typeof walletCheck !== "boolean") {
      throw new TypeError("walletCheck must be true or false when a passphrase is given.");
    }
    if (walletCheck !== undefined && typeof walletCheck !== "boolean") {
      throw new TypeError("walletCheck must be true or false.");
    }
    if (workers !== undefined) requireWorkers(workers);
    // A page that asked for the check must never get a phrase without it. The rule is the
    // library's (wallet_check::require_passphrase), asked here before any worker starts, with its
    // code and message; scripts/verify-browser-package.mjs keeps the two in step.
    if (!hasPassphrase && walletCheck === true) {
      throw new MhfeError(
        "WALLET_CHECK_NEEDS_PASSPHRASE",
        "The wallet check needs a BIP39 passphrase; without one it would let anyone who sees the " +
          "phrase test it",
      );
    }
    const checked = hasPassphrase && walletCheck;
    const count = checked ? (workers ?? defaultWorkers()) : 1;
    // The drawing takes over from the wait for the startup check with nothing in between.
    return this.#slot.after(this.#module.ready(), () =>
      this.#draw(given, repeat, hasPassphrase, checked, count, wishes, onProgress),
    );
  }

  /**
   * Draws on `count` workers at once once the class is ready; see drawPhrase(). This class's own
   * copies of the passphrase are wiped when the setup ends, however it ends: each worker has
   * copies of its own, which its job wipes (AUD-012-SEC001).
   */
  #draw(passphrase, passphraseRepeat, hasPassphrase, checked, count, wishes, onProgress) {
    // Made before the first copy of the passphrase, so that nothing can fail between that copy
    // and the cleanup below (AUD-012-SEC001).
    let repeat = new Uint8Array(0);
    let chosenWords = new Uint8Array(0);
    const first = encodeSecret(passphrase, "passphrase");
    try {
      if (hasPassphrase) {
        // The library's rule (wallet_check::require_same_passphrase), which every worker applies
        // again, is compared here first, so that a refused passphrase never reaches a worker; its
        // code and message are the library's, and scripts/verify-browser-package.mjs keeps them
        // in step.
        repeat = encodeSecret(passphraseRepeat, "repeated passphrase");
        const same = repeat.length === first.length && repeat.every((byte, i) => byte === first[i]);
        if (!same) {
          throw new MhfeError("PASSPHRASES_DIFFER", "The passphrase and its repetition differ");
        }
      }
      chosenWords = encodeSecret(wishes.words, "chosen words");
      const secrets = { passphrase: first, passphraseRepeat: repeat, chosenWords };
      return this.#startDraws(secrets, wishes, checked, count, onProgress);
    } finally {
      first.fill(0);
      repeat.fill(0);
      chosenWords.fill(0);
    }
  }

  /**
   * Starts `count` workers, each with copies of the `secrets` (the passphrase, its repetition and
   * the chosen words) and the `wishes`, and settles with the first phrase found or the first
   * failure. A failure while the workers are started stops those started, wipes the copies not
   * yet handed to a job and frees the slot.
   */
  #startDraws(secrets, wishes, checked, count, onProgress) {
    return new Promise((resolve, reject) => {
      const jobs = [];
      let finished = false;
      let release = () => {};
      // The first result or failure ends the drawing, stops every worker and frees the slot.
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        release();
        for (const job of jobs) job.stop(null);
        if (error === null) resolve({ ...result, workers: count });
        else reject(error);
      };
      try {
        const draws = new Array(count).fill(0);
        release = this.#slot.hold((error) => finish(error));
        for (let index = 0; index < count && !finished; index += 1) {
          const message = {
            operation: "drawPhrase",
            walletCheck: checked,
            places: wishes.places,
            neverUse: wishes.neverUse,
          };
          let started;
          try {
            for (const [field, bytes] of Object.entries(secrets)) message[field] = bytes.slice();
            started = this.#module.start(message, {
              // Returned, so that a rejected promise of the page stops the drawing too.
              draws: (drawn) => {
                draws[index] = drawn;
                const total = draws.reduce((sum, value) => sum + value, 0);
                return onProgress?.({ stage: "draw", draws: total });
              },
            });
          } catch (error) {
            // Not yet a job's: these copies are this class's to wipe.
            wipeSecrets(message);
            throw error;
          }
          jobs.push(started.job);
          started.done.then(
            (result) => finish(null, result),
            (error) => finish(error),
          );
        }
      } catch (error) {
        finish(error);
      }
    });
  }

  /** Stops a drawing, or its wait for the check; its promise rejects with MhfeCancelledError. */
  cancel() {
    this.#slot.cancel();
  }
}

/**
 * The wishes of a new phrase as the WebAssembly takes them: the chosen words one space apart, a
 * secret; the place of each, 0 for anywhere and otherwise its position; and the words never to
 * use, one space apart. Only their types are checked here: the library judges the words, their
 * places and how many (INVALID_WORD_WISH).
 */
function wishesOf(chosen, neverUse) {
  if (!Array.isArray(chosen)) throw new TypeError("chosen must be an array of { word, position }.");
  if (!Array.isArray(neverUse) || !neverUse.every((word) => typeof word === "string")) {
    throw new TypeError("neverUse must be an array of words.");
  }
  const words = [];
  const places = [];
  for (const wish of chosen) {
    requireText(wish?.word, "a chosen word");
    const { position } = wish;
    const whole = Number.isSafeInteger(position) && position >= 1;
    if (position !== "anywhere" && !(whole && position <= HIGHEST_WORD_POSITION)) {
      throw new TypeError('A chosen word\'s position is a whole number from 1, or "anywhere".');
    }
    words.push(wish.word);
    places.push(position === "anywhere" ? 0 : position);
  }
  return { words: words.join(" "), places, neverUse: neverUse.join(" ") };
}

/** Refuses a number of drawing workers outside 1 to HIGHEST_DRAW_WORKERS. */
function requireWorkers(workers) {
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > HIGHEST_DRAW_WORKERS) {
    throw new TypeError(`workers must be a whole number from 1 to ${HIGHEST_DRAW_WORKERS}.`);
  }
}

function defaultWorkers() {
  return Math.min(globalThis.navigator?.hardwareConcurrency || 1, MOST_DRAW_WORKERS);
}

/**
 * The request of `operation` on a phrase with a BIP39 passphrase, both as byte copies that the
 * worker and the WebAssembly wipe. A refused passphrase leaves no copy of the phrase behind.
 */
function phraseRequest(operation, phrase, passphrase) {
  requireSecret(passphrase, "passphrase");
  const message = { operation, phrase: encodeSecret(phrase, "phrase") };
  try {
    message.passphrase = encodeSecret(passphrase, "passphrase");
  } catch (error) {
    wipeSecrets(message);
    throw error;
  }
  return message;
}
