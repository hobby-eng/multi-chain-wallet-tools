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

export { CANCELLED, MhfeError } from "../runtime/runtime.js";

/** The name of this module's operations in the package's worker. */
const WALLET_MODULE = "wallet";
/** The build of this file, from `cargo xtask wasm stamp-build-id`; see BUILD_ID in the runtime. */
const WALLET_BUILD_ID = "7da6a9c673903bea";

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
   * What an address check would search, to show before it runs: `{ coins, type, search,
   * addresses, onlyPath }`, where `coins` are the ids of the coins searched. `coin` is a coin id of
   * parameters().coins; without it the address is searched as every coin whose form it has. `path`
   * limits the search to one path. `scanGap`, 0 by default for the usual search, states instead
   * the first account's first `scanGap` receiving and change addresses, where
   * MhfeClient.searchDecoy() looks for two missing words.
   */
  async describeAddress({ address, coin = "", path = "", scanGap = 0 } = {}) {
    requireText(address, "address");
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
   * then, never preselected). A checked phrase takes about 65,536 BIP39 seeds, one after another
   * in one worker, as the specification's proof requires, which takes minutes. `chosen`, at most
   * parameters().maxChosenWords (1) `{ word, position }` with `position` from 1 to 24 or
   * "anywhere", which is not recommended, and `neverUse`, at most
   * parameters().maxNeverUseWords (1) word the phrase must not hold, are met the same way;
   * describeDraw() tells what they cost first. `onProgress({ stage: "draw", draws })` reports the
   * draws so far; cancel() stops them. Resolves to `{ phrase, words, walletCheck,
   * fingerprintWithPassphrase }`.
   */
  async drawPhrase({
    passphrase,
    passphraseRepeat,
    walletCheck,
    chosen = [],
    neverUse = [],
    onProgress,
  } = {}) {
    requireCallback(onProgress, "onProgress");
    const wishes = wishesOf(chosen, neverUse);
    this.#slot.requireIdle();
    // Left out, the passphrase and its repetition are empty; given, each must be a secret, so
    // that a wrong type is never taken as no passphrase.
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
    // A page that asked for the check must never get a phrase without it. The rule is the
    // library's (wallet_check::require_passphrase), asked here before any worker starts, with its
    // code and message; `cargo xtask package-check` keeps the two in step.
    if (!hasPassphrase && walletCheck === true) {
      throw new MhfeError(
        "WALLET_CHECK_NEEDS_PASSPHRASE",
        "The wallet check needs a BIP39 passphrase; without one it would let anyone who sees the " +
          "phrase test it",
      );
    }
    const checked = hasPassphrase && walletCheck;
    // The drawing takes over from the wait for the startup check with nothing in between.
    return this.#slot.after(this.#module.ready(), () =>
      this.#draw(given, repeat, checked, wishes, onProgress),
    );
  }

  /**
   * Draws in a worker of its own, holding the slot, once the class is ready; see drawPhrase(). The
   * secrets are copied into bytes only now, and until the job owns them, every failure wipes the
   * copies (AUD-012-SEC001).
   */
  #draw(passphrase, passphraseRepeat, checked, wishes, onProgress) {
    const message = {
      operation: "drawPhrase",
      walletCheck: checked,
      places: wishes.places,
      neverUse: wishes.neverUse,
      // Made before the first copy of the passphrase, so that nothing can fail between that copy
      // and the cleanup below (AUD-012-SEC001).
      passphraseRepeat: new Uint8Array(0),
      chosenWords: new Uint8Array(0),
    };
    try {
      message.passphrase = encodeSecret(passphrase, "passphrase");
      // The library's rule (wallet_check::require_same_passphrase), which the worker applies
      // again, is compared here first, so that a refused passphrase never reaches a worker; its
      // code and message are the library's, and `cargo xtask package-check` keeps them
      // in step.
      const first = message.passphrase;
      const repeat = encodeSecret(passphraseRepeat, "repeated passphrase");
      message.passphraseRepeat = repeat;
      const same = repeat.length === first.length && repeat.every((byte, i) => byte === first[i]);
      if (!same) {
        throw new MhfeError("PASSPHRASES_DIFFER", "The passphrase and its repetition differ");
      }
      message.chosenWords = encodeSecret(wishes.words, "chosen words");
      return this.#module.run(message, this.#slot, {
        // Returned, so that a rejected promise of the page stops the drawing too.
        draws: (draws) => onProgress?.({ stage: "draw", draws }),
      });
    } catch (error) {
      wipeSecrets(message);
      throw error;
    }
  }

  /** Stops a drawing, or its wait for the check; its promise resolves to CANCELLED. */
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
