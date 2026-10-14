// The passwords module of the mhfe browser package: the review of a typed password under its check
// word (MHFE-PASSWORD-CHECK-1), the strength estimate and the password generator. No Argon2. A page
// supplies the module's files as text and bytes:
//
//   const passwords = new MhfePasswords({
//     workerSource,   // text of runtime/worker.js
//     wasm,           // runtime/mhfe.wasm as a Uint8Array or a WebAssembly.Module
//   });
//
// A page that uses several module classes compiles runtime/mhfe.wasm once, with
// WebAssembly.compile, and passes the WebAssembly.Module to each.
//
// Every method returns a promise and reports every error by rejecting it; none throws when it is
// called. Each call runs in a worker of its own, which is terminated afterwards with every copy of
// the password in it. Results that hold a password or its words are JavaScript strings, which
// cannot be wiped: a page shows them only on request and drops them soon after. The first call
// waits for the class's startup check (startupCheck()).

import {
  MhfeModuleClass,
  ModuleWorker,
  describeChoice,
  encodeSecret,
  requireSecret,
  requireText,
  secretOrEmpty,
  wipeSecrets,
  wordHintsOf,
} from "../runtime/runtime.js";

export { MhfeError } from "../runtime/runtime.js";

/** The name of this module's operations in the package's worker. */
const PASSWORDS_MODULE = "passwords";
/** make()'s refusal of a count with the check word (makePassword in src/wasm_api/passwords.rs). */
const CHECK_WORD_TAKES_NO_COUNT =
  'count belongs only to the kinds "words" and "characters": "checkWord" always gives five ' +
  "words and their check word.";
/** The build of this file, which scripts/stamp-build-id.mjs writes; see BUILD_ID in the runtime. */
const PASSWORDS_BUILD_ID = "4f5000f4290fa5eb";

export class MhfePasswords extends MhfeModuleClass {
  #module;

  constructor({ workerSource, wasm } = {}) {
    const module = new ModuleWorker({
      module: PASSWORDS_MODULE,
      workerSource,
      wasm,
      classFile: "passwords/passwords.js",
      classBuildId: PASSWORDS_BUILD_ID,
      needs: ["random"],
      secrets: true,
    });
    super(module);
    this.#module = module;
  }

  /**
   * Reviews a typed password under the check word profile, before any long work. With
   * `passwordRepeat`, a new password typed twice, both must be the same, an empty repetition
   * included (PASSWORDS_DIFFER).
   * Resolves to `{ profile, reading, correction, correctionText, offersCorrection, repairsFirst,
   * repairs: [{ position, word, typed }] }`; `reading` is "notThisShape", "fits", "restorable" or
   * "mismatch". The answers a page offers come from it, and the one chosen goes to the long
   * operation as `passwordRepair`: "asTyped", "corrected" or `{ repair: position }`.
   */
  async review({ password, passwordRepeat } = {}) {
    // Both types are checked before they are compared or copied: a repetition left out is none.
    requireSecret(password, "password");
    const repeat = secretOrEmpty(passwordRepeat, "repeated password");
    await this.#module.ready();
    const message = {
      operation: "review",
      password: encodeSecret(password, "password"),
      // An empty repetition is a repetition that differs, not a missing one.
      repeated: passwordRepeat !== undefined,
    };
    try {
      message.passwordRepeat = encodeSecret(repeat, "repeated password");
    } catch (error) {
      // A refused repetition must not leave the password's copy behind.
      wipeSecrets(message);
      throw error;
    }
    return this.#module.run(message);
  }

  /**
   * The hint below a password being typed, from the EFF list, by the rule of the command-line
   * tool: `{ hint, count, words, completion: { letters, wordEnds } }`, as MhfeWallet.wordHints()
   * gives it for BIP39 words. A password may hold any text, so a page shows nothing for "noWord"
   * there, and Tab stays a character of the password. Each call starts a worker: a page may ask
   * once typing pauses.
   */
  async wordHints({ typed } = {}) {
    return wordHintsOf(this.#module, typed);
  }

  /**
   * The rough strength of a password or passphrase after the review choice `passwordRepair`, so
   * that it is of the text that will be used. Resolves to `{ bits, weak }`; a weak one deserves a
   * warning before it protects a phrase.
   */
  async strength({ password, passwordRepair } = {}) {
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    await this.#module.ready();
    const message = {
      operation: "strength",
      password: encodeSecret(password, "password"),
      choice,
      position,
    };
    return this.#module.run(message);
  }

  /**
   * Makes a password: `kind` "words" (`count` 1 to 32, by default 5), "checkWord" (five words
   * and their check word) or "characters" (`count` 1 to 64, by default 16). "checkWord" takes no
   * `count`, a TypeError, as `mhfe password` refuses `--check-word` with `--words`: a page never
   * gets fewer words than it asked for. With `dice`, five digits from 1 to 6 per word separated by
   * spaces, the words come from real dice; otherwise from the browser's random generator.
   * Resolves to `{ password, bits, weak, checkWord }`.
   */
  async make({ kind = "words", count, dice = "" } = {}) {
    requireText(kind, "kind");
    if (count !== undefined && !Number.isSafeInteger(count)) {
      throw new TypeError("count must be a whole number.");
    }
    if (kind === "checkWord" && count !== undefined) {
      throw new TypeError(CHECK_WORD_TAKES_NO_COUNT);
    }
    await this.#module.ready();
    const message = {
      operation: "make",
      kind,
      count,
      rolls: encodeSecret(dice, "dice digits"),
    };
    return this.#module.run(message);
  }
}
