// The repair module of the mhfe browser package: the repair words of a container and the repair of
// a damaged container phrase (MHFE-REPAIR-1). No Argon2 and no secret. A page supplies the module's
// files as text and bytes:
//
//   const repair = new MhfeRepair({
//     workerSource,   // text of runtime/worker.js
//     wasm,           // runtime/mhfe.wasm as a Uint8Array or a WebAssembly.Module
//   });
//
// A page that uses several module classes compiles runtime/mhfe.wasm once, with
// WebAssembly.compile, and passes the WebAssembly.Module to each.
//
// Every method returns a promise and reports every error by rejecting it; none throws when it is
// called. Each call runs in a worker of its own, so calls never wait for each other. The first call
// waits for the class's startup check (startupCheck()).

import { MhfeModuleClass, ModuleWorker, requireText } from "../runtime/runtime.js";

export { MhfeError } from "../runtime/runtime.js";

/** The name of this module's operations in the package's worker. */
const REPAIR_MODULE = "repair";
/** The build of this file, which scripts/stamp-build-id.mjs writes; see BUILD_ID in the runtime. */
const REPAIR_BUILD_ID = "4f5000f4290fa5eb";

export class MhfeRepair extends MhfeModuleClass {
  #module;

  constructor({ workerSource, wasm } = {}) {
    const module = new ModuleWorker({
      module: REPAIR_MODULE,
      workerSource,
      wasm,
      classFile: "repair/repair.js",
      classBuildId: REPAIR_BUILD_ID,
      secrets: false,
    });
    super(module);
    this.#module = module;
  }

  /**
   * The repair words of a container, which a person writes on a card kept apart from the
   * container phrase. Resolves to `{ profile, words, repairsUnreadable, repairsWrong }`. Make them
   * only from a container whose recovery was rehearsed; a container that does not open its wallet
   * gets a card that repairs the wrong words faithfully.
   */
  async repairWords({ container, count } = {}) {
    requireText(container, "container");
    // Which counts a card has is the library's rule (INVALID_REPAIR_WORDS); the page refuses only
    // what is no number at all.
    if (!Number.isSafeInteger(count)) throw new TypeError("count must be a whole number.");
    await this.#module.ready();
    return this.#module.run({ operation: "repairWords", container, count });
  }

  /**
   * Repairs a container from the words of its container phrase and card as read, "?" for a word
   * that cannot be read. Resolves to `{ container, containerFingerprint, unchanged, containerWords,
   * cardWords, changes: [{ onCard, position, read, word }] }`; a page shows every change. A repair
   * does not show that the card belongs to the container phrase: only a rehearsal against the
   * wallet does.
   */
  async repairContainer({ container, card } = {}) {
    requireText(container, "container");
    requireText(card, "card");
    await this.#module.ready();
    return this.#module.run({ operation: "repairContainer", container, card });
  }

  /**
   * What a container phrase as typed is, before it is decrypted, checked or repaired. Resolves to
   * `{ reading, wordCount, unreadable }`: "container" as it stands; "marked", words typed as "?",
   * `unreadable` listing every word that cannot be read, from 1: ask for the repair words at once;
   * "notAContainer", a container's length but not a container, from a typing mistake or a damaged
   * container phrase: offer to type it again or to repair it; "wrongLength", a length no container
   * has.
   */
  async inspectContainer({ container } = {}) {
    requireText(container, "container");
    await this.#module.ready();
    return this.#module.run({ operation: "inspectContainer", container });
  }
}
