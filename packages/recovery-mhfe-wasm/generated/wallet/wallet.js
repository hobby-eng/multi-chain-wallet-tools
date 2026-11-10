// The wallet module of the mhfe browser package: the wallet check of a recovered phrase
// (MHFE-WALLET-CHECK-SEED-1), master key fingerprints and what an address check searches. No
// Argon2, and nothing drawn at random. A page supplies the module's files as text and bytes:
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
// called. Each call runs in a worker of its own, terminated afterwards. The first call waits for
// the class's startup check (startupCheck()).

import {
  MhfeModuleClass,
  ModuleWorker,
  encodeSecret,
  requireSecret,
  requireText,
  secretOrEmpty,
  wipeSecrets,
  wordHintsOf,
} from "../runtime/runtime.js";

export { MhfeError } from "../runtime/runtime.js";

/** The name of this module's operations in the package's worker. */
const WALLET_MODULE = "wallet";
/** The build of this file, from `cargo xtask wasm stamp-build-id`; see BUILD_ID in the runtime. */
const WALLET_BUILD_ID = "19de50ce492d1e35";

export class MhfeWallet extends MhfeModuleClass {
  #module;

  constructor({ workerSource, wasm } = {}) {
    const module = new ModuleWorker({
      module: WALLET_MODULE,
      workerSource,
      wasm,
      classFile: "wallet/wallet.js",
      classBuildId: WALLET_BUILD_ID,
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
   * The hint below a line of BIP39 words being typed, such as a seed phrase, a container phrase or
   * repair words, by the rule of the command-line tool: `{ hint, count, words,
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
