// The runtime the module classes of the mhfe browser package share: errors, the WebAssembly
// compiled once, the worker of one operation, the byte copies of secrets, and the self-check that
// a class runs before its first operation. Every module class (core/client.js, repair/repair.js,
// passwords/passwords.js, wallet/wallet.js) imports it from "../runtime/runtime.js" and uses it by
// composition.
//
// A page supplies every part as text or bytes, because a page under a strict
// Content-Security-Policy may not fetch anything. Each operation runs in a new Web Worker made from
// a Blob of the package's worker script, runtime/worker.js, so the page never blocks, cancel()
// ends an operation at once, and the worker's memory, secrets included, is freed when the worker
// is terminated, which waits until a worker still loading the WebAssembly has loaded it. Every module
// runs in the same WebAssembly, runtime/mhfe.wasm; a request names its module and operation.

/**
 * The build of the package these files come from, which scripts/stamp-build-id.mjs derives from
 * every file a page loads before it stamps any: runtime/mhfe.wasm, this file, runtime/worker.js,
 * each class file and both Argon2 builds. It writes it into each of these, the WebAssembly's
 * custom section "mhfe-build" included; the classes and the worker compare them, so that parts of
 * different builds, even ones that differ in a script alone, are never used together.
 * "development" before the build stamps it.
 */
export const BUILD_ID = "4f5000f4290fa5eb";

export class MhfeError extends Error {
  /**
   * `options.cause` keeps the original error, as for CALLBACK_FAILED; `options.report` the
   * self-check report of SELF_CHECK_FAILED.
   */
  constructor(code, message, options) {
    super(message, options);
    this.name = "MhfeError";
    this.code = code;
    if (options?.report !== undefined) this.report = options.report;
  }
}

export class MhfeCancelledError extends MhfeError {
  constructor() {
    super("CANCELLED", "The operation was cancelled.");
    this.name = "MhfeCancelledError";
  }
}

/** The package's WebAssembly, compiled the first time a worker needs it and then shared. */
export class CompiledModule {
  #wasm;
  #compiled = null;

  constructor(wasm, name) {
    // A browser without WebAssembly gets this far, so that the class's self-check can say what
    // is missing instead of the constructor failing with a ReferenceError.
    if (!(wasm instanceof Uint8Array) && !isCompiledModule(wasm)) {
      throw new TypeError(`${name} must be a Uint8Array or a WebAssembly.Module.`);
    }
    this.#wasm = wasm;
  }

  /**
   * The bytes or the module the page passed: the classes made with the same one share their
   * self-check results on the page.
   */
  get source() {
    return this.#wasm;
  }

  /** The compiled WebAssembly, which a worker receives as it is: no worker compiles it again. */
  get() {
    this.#compiled ??= isCompiledModule(this.#wasm)
      ? Promise.resolve(this.#wasm)
      : WebAssembly.compile(this.#wasm);
    return this.#compiled;
  }
}

function isCompiledModule(value) {
  return typeof WebAssembly === "object" && value instanceof WebAssembly.Module;
}

/**
 * How long a worker may take to start and load the WebAssembly, until it says it is ready. A
 * minute is ample even on a slow phone; without a limit, a browser that silently refuses to run a
 * worker would leave the operation waiting for ever. The operation itself has no time limit.
 */
const WORKER_START_TIMEOUT_MS = 60_000;

/**
 * One operation in one worker. `scripts` are joined into the worker's Blob; `handlers` receive the
 * worker's messages by type. A handler of the page that fails ends the operation: the worker
 * stops, which frees its secrets, and the promise rejects with CALLBACK_FAILED and the page's error
 * as the cause. An `ask` handler answers the worker; its promise is awaited.
 */
export class WorkerJob {
  #scripts;
  #handlers;
  #worker = null;
  #url = null;
  #ended = false;
  #settle = null;
  #onEnd;
  #startTimer = null;
  /** Whether the worker has loaded the WebAssembly (its "ready"). */
  #loaded = false;

  constructor(scripts, handlers = {}, onEnd = () => {}) {
    this.#scripts = scripts;
    this.#handlers = handlers;
    this.#onEnd = onEnd;
  }

  /**
   * Starts the worker with `message`, which names its module and operation; its `compiled` field
   * is filled from `wasm`, a CompiledModule, once that is compiled. Until the worker owns them,
   * the secrets of `message` belong to this job: every failure on the way wipes them.
   */
  run(message, transfer, wasm) {
    return new Promise((resolve, reject) => {
      this.#settle = { resolve, reject };
      const start = async () => {
        let compiled;
        try {
          compiled = await wasm.get();
        } catch (error) {
          this.stop(
            new MhfeError("WORKER_FAILED", `The WebAssembly did not compile: ${error.message}`),
          );
          return;
        }
        // cancel() during the compilation ends the job before any worker exists.
        if (this.#ended) return;
        // A browser may refuse the Blob, its URL or the worker; each ends the job the same way.
        try {
          this.#url = URL.createObjectURL(
            new Blob([this.#scripts.join("\n;\n")], { type: "text/javascript" }),
          );
          this.#worker = new Worker(this.#url, { name: "mhfe" });
        } catch (error) {
          this.stop(
            new MhfeError(
              "WORKER_FAILED",
              `The browser refused to start the worker: ${error.message}`,
            ),
          );
          return;
        }
        this.#worker.onmessage = (event) => this.#receive(event.data);
        this.#worker.onerror = (event) => {
          event.preventDefault();
          // A failed worker loads nothing more and may stop at once.
          this.#loaded = true;
          if (this.#ended) this.#terminate();
          this.stop(
            new MhfeError("WORKER_FAILED", event.message || "The worker stopped unexpectedly."),
          );
        };
        this.#startTimer = setTimeout(() => {
          this.stop(new MhfeError("WORKER_FAILED", "The worker did not start within a minute."));
          // A minute without loading: it is not waited for any longer.
          this.#terminate();
        }, WORKER_START_TIMEOUT_MS);
        this.send({ ...message, compiled }, transfer);
      };
      start()
        .catch((error) => {
          this.stop(new MhfeError("WORKER_FAILED", `The worker did not start: ${error.message}`));
        })
        .finally(() => {
          if (this.#ended) wipeSecrets(message);
        });
    });
  }

  /** Sends a later step to the worker, such as a session's next request. */
  send(message, transfer = []) {
    if (this.#ended || this.#worker === null) {
      wipeSecrets(message);
      return;
    }
    try {
      this.#worker.postMessage(message, transfer);
    } catch (error) {
      wipeSecrets(message);
      this.stop(new MhfeError("WORKER_FAILED", `The request could not be sent: ${error.message}`));
    }
  }

  /**
   * Ends the job once: `error` rejects its promise, null resolves nothing, and the worker stops.
   * A worker that is still loading the WebAssembly stops once it has loaded it, or when it fails,
   * or at the start's time limit: Firefox crashes the whole page when a worker is terminated while
   * it loads the WebAssembly, as when every worker of a draw fails within milliseconds. Its
   * request is answered by nobody: its messages are ignored from now on.
   */
  stop(error) {
    if (this.#ended) return;
    this.#ended = true;
    clearTimeout(this.#startTimer);
    if (this.#loaded || this.#worker === null) {
      this.#terminate();
    } else {
      this.#startTimer = setTimeout(() => this.#terminate(), WORKER_START_TIMEOUT_MS);
    }
    this.#onEnd(this);
    if (error !== null) this.#settle?.reject(error);
  }

  #terminate() {
    clearTimeout(this.#startTimer);
    this.#startTimer = null;
    this.#worker?.terminate();
    this.#worker = null;
    if (this.#url !== null) URL.revokeObjectURL(this.#url);
    this.#url = null;
  }

  get ended() {
    return this.#ended;
  }

  #receive(reply) {
    // A worker's first message, whatever it is, comes after it has loaded the WebAssembly.
    this.#loaded = true;
    // Messages that were already on their way when the job ended are ignored; a worker that was
    // left to finish loading stops now.
    if (this.#ended) {
      this.#terminate();
      return;
    }
    // A reply that this page cannot read ends the job as a fault of the package, as an unknown
    // type does: reading it as it is would throw inside the worker's event handler and leave the
    // job running, its slot taken and its worker alive (AUD-016-API002).
    if (!isReadableReply(reply)) {
      this.stop(unknownMessage(reply?.type ?? reply));
      return;
    }
    if (reply.type === "ready") {
      this.#started(reply.buildId);
    } else if (reply.type === "result") {
      this.stop(null);
      this.#settle.resolve(reply.result);
    } else if (reply.type === "error") {
      this.stop(new MhfeError(reply.error.code, sentence(reply.error.message)));
    } else if (reply.type === "ask") {
      this.#answer(reply.question, reply.value);
    } else if (WORKER_NEWS.includes(reply.type)) {
      // News the page did not ask for has no handler and is dropped.
      this.callPage(this.#ownHandler(reply.type), reply.value, reply.type);
    } else {
      this.stop(unknownMessage(reply.type));
    }
  }

  /**
   * The page's handler named `name`: an own property of the handlers only, so that a message named
   * after an Object.prototype member such as "constructor" or "toString" reaches no page code
   * (AUD-015-SEC007).
   */
  #ownHandler(name) {
    return Object.hasOwn(this.#handlers, name) ? this.#handlers[name] : undefined;
  }

  /**
   * The worker has loaded the WebAssembly, which matched the worker's own build. Its build must be
   * this runtime's too; a difference stops the job. The worker has the request already and starts
   * it at once, so the stop terminates it while it runs, and its result is never used.
   */
  #started(buildId) {
    clearTimeout(this.#startTimer);
    this.#startTimer = null;
    if (buildId !== BUILD_ID) {
      this.stop(
        packageMismatch(
          `The file runtime/worker.js is of build ${buildId} and runtime/runtime.js of build ` +
            BUILD_ID,
        ),
      );
    }
  }

  /** Calls a page callback whose result is not awaited; a throw or a rejection stops the job. */
  callPage(callback, value, name) {
    try {
      const returned = callback?.(value);
      if (typeof returned?.then === "function") {
        returned.then(undefined, (cause) => {
          // Once the job has ended there is nothing left to stop: the page's rejection stays
          // unhandled, as it would be without this client, instead of being swallowed.
          if (this.#ended) throw cause;
          this.stop(callbackFailed(name, cause));
        });
      }
    } catch (cause) {
      this.stop(callbackFailed(name, cause));
    }
  }

  /** Asks the page and sends its answer back to the worker. */
  async #answer(question, value) {
    // A question must be answered: one the page has no handler for is a fault of the package.
    const handler = typeof question === "string" ? this.#ownHandler(question) : undefined;
    if (typeof handler !== "function") {
      this.stop(unknownMessage(question));
      return;
    }
    try {
      const answer = await handler(value);
      this.send({ type: "answer", value: answer?.message ?? answer }, answer?.transfer ?? []);
    } catch (cause) {
      // A handler that wraps the page's callback may name the failure itself; anything else,
      // an MhfeError of another call included, becomes CALLBACK_FAILED with it as the cause.
      const named = cause instanceof MhfeError && cause.code === "CALLBACK_FAILED";
      this.stop(named ? cause : callbackFailed(question, cause));
    }
  }
}

/**
 * The one long operation a class runs at a time: a second one is refused with BUSY, and cancel()
 * stops the running one, including a session that waits for the page.
 */
export class OperationSlot {
  #running = null;

  requireIdle() {
    if (this.#running !== null) {
      throw new MhfeError("BUSY", "Another operation is still running.");
    }
  }

  /** A job that holds the slot until it ends. */
  job(scripts, handlers) {
    this.requireIdle();
    const job = new WorkerJob(scripts, handlers, (ended) => {
      if (this.#running === ended) this.#running = null;
    });
    this.#running = job;
    return job;
  }

  /**
   * Holds the slot while `ready`, the class's startup check, settles, then returns what `begin`
   * returns: `begin` starts the operation's job in the slot at once, with nothing in between. A
   * cancel() in the meantime rejects with MhfeCancelledError, and a rejected `ready` rejects with
   * its error; both free the slot.
   */
  async after(ready, begin) {
    this.requireIdle();
    let cancel;
    let stopped = null;
    const cancelled = new Promise((_, reject) => {
      cancel = reject;
    });
    const waiting = {
      stop: (error) => {
        stopped = error;
        cancel(error);
      },
    };
    this.#running = waiting;
    try {
      await Promise.race([ready, cancelled]);
      // A cancel() after the check settled, before this went on, stops the operation too.
      if (stopped !== null) throw stopped;
    } finally {
      if (this.#running === waiting) this.#running = null;
    }
    return begin();
  }

  /**
   * Holds the slot for work the class runs itself, such as a phrase drawn on several workers at
   * once: cancel() calls `stop(error)`. Returns the function that frees the slot when it ends.
   */
  hold(stop) {
    this.requireIdle();
    const running = { stop };
    this.#running = running;
    return () => {
      if (this.#running === running) this.#running = null;
    };
  }

  cancel() {
    this.#running?.stop(new MhfeCancelledError());
  }
}

/**
 * The highest word position the Rust core reads (a 32-bit number): of a password's repair, which
 * it refuses above the password's words (PASSWORD_REPAIR_NOT_OFFERED), and of a chosen word of a
 * new phrase, which it refuses above 24 (INVALID_WORD_WISH).
 */
export const HIGHEST_WORD_POSITION = 0xffff_ffff;

/**
 * Parts of the package that come from different builds (PACKAGE_MISMATCH): `what` says which, and
 * the advice follows. The worker says it in the same words (web/worker-runtime.js), as a worker
 * script imports nothing; the package checks compare both.
 */
export function packageMismatch(what) {
  return new MhfeError(
    "PACKAGE_MISMATCH",
    `${what}: take every file of the package from one build.`,
  );
}

/**
 * The news a worker posts besides its result, error and questions, which go to the page's
 * handlers of the same name: web/worker-runtime.js (progress and the self-check's parts),
 * web/core-worker.js (unverified) and web/wallet-worker.js (draws). scripts/verify-browser-package.mjs
 * keeps this list equal to the types the worker scripts post.
 */
const WORKER_NEWS = ["progress", "componentStart", "component", "draws", "unverified"];

/**
 * A message or question of a worker that this page does not know or cannot read, as from a worker
 * of another build. Only text is shown as it is: String() of an object a worker sent may throw, as
 * one whose own toString is not a function.
 */
function unknownMessage(name) {
  const shown = typeof name === "string" || name === null ? String(name) : typeof name;
  return packageMismatch(`The worker sent a message this page does not know (${shown})`);
}

/**
 * Whether `reply` is a message as the package's worker posts it (web/worker-runtime.js), so that
 * reading it cannot throw: an object with a type, a ready's build as text, and an error's code and
 * message as text. A result and the value of news or of a question go to the page as they are, and
 * a question is checked when it is answered.
 */
function isReadableReply(reply) {
  if (typeof reply !== "object" || reply === null || typeof reply.type !== "string") return false;
  if (reply.type === "ready") return typeof reply.buildId === "string";
  if (reply.type !== "error") return true;
  const { error } = reply;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

/**
 * The fields of a request that hold secrets; this client's own byte copies of them. The worker
 * lists the same fields (web/worker-runtime.js), as a worker script imports nothing.
 */
const SECRET_FIELDS = [
  "phrase",
  "password",
  "passwordRepeat",
  "passphrase",
  "passphraseRepeat",
  "chosenWords",
  "newPassword",
  "newPasswordRepeat",
  "mainPassphrase",
  "rolls",
  "typed",
];

/**
 * Overwrites this client's byte copies of the secrets in a request or in a session's answer
 * (`value`); they are its own arrays. A copy already transferred to the worker is empty, and
 * filling a transferred array would throw, so it is left alone.
 */
export function wipeSecrets(message) {
  for (const holder of [message, message?.value]) {
    for (const field of SECRET_FIELDS) {
      const bytes = holder?.[field];
      if (typeof bytes?.fill === "function" && bytes.byteLength > 0) bytes.fill(0);
    }
  }
}

/** The transfer list of a request's secrets, so that no copy stays in the page. */
export function secretBuffers(message) {
  return SECRET_FIELDS.map((field) => message[field]?.buffer).filter(Boolean);
}

/** A secret is given as text or as its UTF-8 bytes; anything else is a TypeError. */
export function requireSecret(value, name) {
  if (typeof value !== "string" && !(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a string or a Uint8Array.`);
  }
}

/**
 * A secret that a method lets the caller leave out, which is then empty, such as a repetition or
 * a BIP39 passphrase. Only a value left out (undefined) is: one given, null included, is checked
 * as every secret is, so that a wrong type is a TypeError instead of an empty secret that the
 * library refuses with another code (AUD-016-API003).
 */
export function secretOrEmpty(value, name) {
  if (value === undefined) return "";
  requireSecret(value, name);
  return value;
}

/**
 * UTF-8 bytes of a phrase, password, passphrase or dice digits, in a plain Uint8Array of their
 * own, which the transfer to the worker empties and a refusal wipes. A JavaScript string may hold
 * a lone surrogate, which TextEncoder would silently turn into U+FFFD, so such a string is refused
 * instead. Bytes are copied into a new array rather than with their own slice(): a subclass such
 * as Node's Buffer, or the Buffer that bundlers add to a page, slices into a view of the caller's
 * memory, which the transfer would empty and a refusal would wipe. An empty password is the
 * library's to refuse (EMPTY_PASSWORD), in the order of its rules, as the command-line tool does.
 */
export function encodeSecret(value, name) {
  requireSecret(value, name);
  let bytes;
  if (typeof value === "string") {
    if (!isWellFormed(value)) {
      throw new MhfeError(
        "INVALID_PASSWORD_TEXT",
        `The ${name} contains an unpaired surrogate, which is not valid text.`,
      );
    }
    bytes = new TextEncoder().encode(value);
  } else {
    bytes = new Uint8Array(value);
  }
  return bytes;
}

function isWellFormed(text) {
  if (typeof text.isWellFormed === "function") return text.isWellFormed();
  // With the u flag a valid pair is one code point, so only a lone surrogate matches.
  return !/[\uD800-\uDFFF]/u.test(text);
}

/**
 * A review choice of the password check word: undefined or "asTyped" keeps the password as typed,
 * "corrected" takes its written form, `{ repair: position }` the repair at that word.
 */
export function describeChoice(choice, name) {
  if (choice === undefined || choice === "asTyped") return ["", 0];
  if (choice === "corrected") return ["corrected", 0];
  if (
    choice !== null &&
    typeof choice === "object" &&
    Number.isSafeInteger(choice.repair) &&
    choice.repair >= 1 &&
    choice.repair <= HIGHEST_WORD_POSITION
  ) {
    return ["repair", choice.repair];
  }
  throw new TypeError(
    `${name} must be "asTyped", "corrected" or { repair: position }, a word number from 1.`,
  );
}

/**
 * The hint for `typed`, a line of words typed so far, from the word list of the class that `module`
 * serves: what MhfeWallet.wordHints() and MhfePasswords.wordHints() give. The line may be part of a
 * seed phrase or a password, so it reaches the worker as bytes that the worker wipes.
 */
export async function wordHintsOf(module, typed) {
  await module.ready();
  return module.run({ operation: "wordHints", typed: encodeSecret(typed, "typed") });
}

export function requireText(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string.`);
}

export function requireBoolean(value, name) {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean.`);
}

export function requireCallback(value, name) {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${name} must be a function.`);
  }
}

/** Counts as a message lists them, the last after "or": "12, 15, 18 or 21" (src/phrase.rs). */
export function countsText(counts) {
  return counts.length < 2
    ? counts.join("")
    : `${counts.slice(0, -1).join(", ")} or ${counts.at(-1)}`;
}

/**
 * A page shows an error message as it is, so it starts with a capital letter, as the messages of
 * the command-line tool do. The Rust core's messages start in lower case to fit inside a sentence.
 */
export function sentence(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function callbackFailed(name, cause) {
  return new MhfeError("CALLBACK_FAILED", `The page's ${name} callback failed.`, { cause });
}

// The self-check of a class: known answers of every part the class computes, compared before its
// first operation and again in the page's full self-test. The WebAssembly brings the checks of its
// parts (src/self_check.rs, `selfCheck*` in src/wasm_api/); the page adds what only the page can
// check, before any worker runs.

/**
 * What a part of a startup check gives when it could not run here ("notAvailable") or ran with a
 * limit ("warning"); at startup only an Argon2 build that did not start gives them
 * (web/core-worker.js), which the browser may well start at the next call.
 */
const TRANSIENT_OUTCOMES = ["notAvailable", "warning"];

/** The page's own parts, by identifier and the name a person reads. */
const PAGE_PARTS = {
  features: { id: "browser-features", label: "Browser features" },
  package: { id: "package-parts", label: "Package parts" },
  encoding: { id: "page-encoding", label: "Text encoding of the page" },
};

/**
 * The text whose UTF-8 bytes the page must give the worker: the password of the public vector
 * unicode-password (its inputs.password_utf8_hex), with a composed letter, a ligature, a
 * full-width letter, the Angstrom sign, a circled digit, a character outside the Basic
 * Multilingual Plane and a Cyrillic letter.
 */
const ENCODING_PROBE = "Caf\u00e9 \ufb01 \uff30\u212b\u2460 \u{1f510} \u0439";
const ENCODING_PROBE_UTF8 = "436166c3a920efac8120efbcb0e284abe291a020f09f949020d0b9";
/** A lone surrogate, which the page must refuse (validation-cases.json javascript_passwords). */
const LONE_SURROGATE = "a\uD800";

/**
 * The parts each page passed, per WebAssembly the page gave the classes: a part another class has
 * passed with the same WebAssembly is not run again at startup. Kept by the WebAssembly object, so
 * that it goes away with it.
 */
const passedOnPage = new WeakMap();

/**
 * What the module classes without Argon2 (repair, passwords, wallet) hold in common, used by
 * composition: the worker's text, the compiled WebAssembly and the class's self-check, with which
 * each runs its set of known answers and its operations, each in a worker of its own. The core's
 * MhfeClient has its own, with its slot and Argon2 builds.
 */
export class ModuleWorker {
  #module;
  #workerSource;
  #wasm;
  #check;

  /**
   * `module` names the module's operations in the worker; `workerSource` is the text of
   * runtime/worker.js and `wasm` runtime/mhfe.wasm; the rest goes to the class's PackageCheck.
   */
  constructor({ module, workerSource, wasm, classFile, classBuildId, needs, secrets }) {
    if (typeof workerSource !== "string" || workerSource.length === 0) {
      throw new TypeError("workerSource must be the text of runtime/worker.js.");
    }
    this.#module = module;
    this.#workerSource = workerSource;
    this.#wasm = new CompiledModule(wasm, "wasm");
    this.#check = new PackageCheck({
      wasm: this.#wasm,
      classFile,
      classBuildId,
      needs,
      secrets,
    });
  }

  /** The class's startup check, made once; see a class's startupCheck(). */
  startupCheck() {
    return this.#check.startup("startup", (skip, handlers) =>
      this.#selfCheck("startup", skip, handlers),
    );
  }

  /** The class's full self-check, run anew; see a class's fullCheck(). */
  fullCheck(onProgress) {
    requireCallback(onProgress, "onProgress");
    return this.#check.full(
      [{ run: (skip, handlers) => this.#selfCheck("full", skip, handlers) }],
      onProgress,
    );
  }

  /** Resolves once the startup check has passed; rejects with SELF_CHECK_FAILED otherwise. */
  ready() {
    return this.#check.require(() => this.startupCheck());
  }

  /** Runs an operation of the module in a worker of its own, its secret buffers transferred. */
  run(message) {
    return this.start(message).done;
  }

  /**
   * Starts an operation in a worker of its own, whose messages go to `handlers`, and gives the
   * job, which can be stopped, with the promise of its result.
   */
  start(message, handlers = {}) {
    const job = new WorkerJob([this.#workerSource], handlers);
    const request = { module: this.#module, ...message };
    return { job, done: job.run(request, secretBuffers(request), this.#wasm) };
  }

  /** Runs the module's set of known answers at `tier` in a worker of its own. */
  #selfCheck(tier, skip, handlers) {
    return new WorkerJob([this.#workerSource], handlers).run(
      { module: this.#module, operation: "selfCheck", tier, skip },
      [],
      this.#wasm,
    );
  }
}

/**
 * What the module classes MhfeRepair, MhfePasswords and MhfeWallet have in common: their
 * self-checks and their fixed values, through the ModuleWorker each runs its operations with. A
 * class extends it with its own operations and keeps the same ModuleWorker in a private field of
 * its own.
 */
export class MhfeModuleClass {
  #module;

  constructor(module) {
    this.#module = module;
  }

  /**
   * The quick self-check of the class, which every other method but parameters(), fullCheck() and
   * cancel() awaits before its first call: known answers of each part the class computes, each
   * with a case it must refuse, and what the page itself must do. Resolves to `{ passed, tier,
   * version, buildId, components: [{ id, label, outcome, detail? }] }`, made once per page: parts
   * that another class of the page passed with the same WebAssembly are not run again. When a part
   * has failed, every method of the class rejects with SELF_CHECK_FAILED from then on, the report
   * attached; a page keeps its controls closed and shows the report.
   */
  async startupCheck() {
    return this.#module.startupCheck();
  }

  /**
   * The full self-check, run anew each time: every part with its slower cases.
   * `onProgress({ id, label, running, outcome?, detail? })` hears of each part as it starts and
   * ends. Resolves to a report as startupCheck() does; a failed part closes the class as there.
   */
  async fullCheck({ onProgress } = {}) {
    return this.#module.fullCheck(onProgress);
  }

  /** The module's fixed values; see the class's declaration file. */
  async parameters() {
    return this.#module.run({ operation: "parameters" });
  }
}

/**
 * The self-check of one class on its page. `startup()` runs once, before the first operation:
 * the page's own parts, then the class's parts in a worker, leaving out those another class of the
 * page has passed. `require()` is what every operation awaits: it rejects with SELF_CHECK_FAILED,
 * the report attached, once any part has failed, and then for good. A worker that did not start
 * (WORKER_FAILED) or parts of different builds (PACKAGE_MISMATCH) give no report: the check is
 * tried again at the next call. So is a report with a part that could not run here or ran with a
 * limit, such as an Argon2 build that did not start, which the browser may give at the next call.
 * `full()` runs every part, the slower cases included, anew.
 */
export class PackageCheck {
  #wasm;
  #classFile;
  #classBuildId;
  #needs;
  #secrets;
  #identityOf;
  #startups = new Map();
  #failed = null;

  /**
   * `wasm` is the class's CompiledModule; `classFile` and `classBuildId` name the class file and
   * its stamped build. `needs` lists what the class needs beyond workers and WebAssembly:
   * "random" (crypto.getRandomValues) and "threads" (SharedArrayBuffer on an isolated page).
   * `secrets` says whether the class encodes secrets. `identityOf(id)` tells apart parts whose
   * outcome depends on more than the WebAssembly, such as Argon2's on the build that ran it.
   */
  constructor({
    wasm,
    classFile,
    classBuildId,
    needs = [],
    secrets,
    identityOf = () => undefined,
  }) {
    this.#wasm = wasm;
    this.#classFile = classFile;
    this.#classBuildId = classBuildId;
    this.#needs = needs;
    this.#secrets = secrets;
    this.#identityOf = identityOf;
  }

  /**
   * The startup report of `variant`, made once: `runSet(skip, handlers)` runs the class's set in
   * a worker without the parts `skip` and resolves to its report.
   */
  startup(variant, runSet) {
    let report = this.#startups.get(variant);
    if (report === undefined) {
      report = this.#check("startup", [{ run: runSet, skipPassed: true }]);
      this.#startups.set(variant, report);
      // No report, such as when the worker did not start, or one that depends on what the browser
      // gave this time: the next call tries again. A failed part stays in #failed regardless.
      const forget = () => {
        if (this.#startups.get(variant) === report) this.#startups.delete(variant);
      };
      report.then((made) => {
        if (made.components.some(({ outcome }) => TRANSIENT_OUTCOMES.includes(outcome))) forget();
      }, forget);
    }
    return report;
  }

  /**
   * Resolves once a startup report of this class has passed, running `startDefault()` when none
   * runs yet; rejects with SELF_CHECK_FAILED once a part has failed.
   */
  async require(startDefault) {
    if (this.#failed !== null) throw selfCheckFailed(this.#failed);
    const [running] = this.#startups.values();
    const report = await (running ?? startDefault());
    if (!report.passed) throw selfCheckFailed(report);
    // A full check that failed while this one ran closes the class too (AUD-014-SEC001): what
    // follows the await runs before any other message of a worker, so nothing slips through.
    if (this.#failed !== null) throw selfCheckFailed(this.#failed);
  }

  /**
   * Every part at the full tier, run anew. `steps` are run one after the other, never two at once:
   * `{ run(skip, handlers), rename? }` runs a set in a worker, `rename(component)` naming its parts
   * in this report, such as those of one Argon2 build; `{ components }` lists parts that are not
   * run here, with the reason. `onProgress` hears of each part as it starts and ends.
   */
  full(steps, onProgress) {
    return this.#check("full", steps, onProgress);
  }

  async #check(tier, steps, onProgress) {
    const components = [this.#features(), this.#packageParts()];
    if (this.#secrets) components.push(encodingPart());
    let version = null;
    if (components[0].outcome === "passed") {
      const compiled = await this.#compiles();
      if (compiled !== null) components[0] = compiled;
    }
    if (components.every((component) => component.outcome !== "failed")) {
      for (const step of steps) {
        if (step.components !== undefined) {
          components.push(...step.components);
          continue;
        }
        const rename = step.rename ?? ((component) => component);
        const ran = await step.run(step.skipPassed ? this.#passedIds() : [], {
          componentStart: (part) => onProgress?.({ ...rename(part), running: true }),
          component: (part) => onProgress?.({ ...rename(part), running: false }),
        });
        version ??= ran.version;
        components.push(...this.#placed(ran, step.skipPassed).map(rename));
      }
    }
    const report = {
      passed: components.every((component) => component.outcome !== "failed"),
      tier,
      version,
      buildId: BUILD_ID,
      components,
    };
    if (!report.passed) this.#failed ??= report;
    return report;
  }

  /** What the class needs of the browser, probed without running anything. */
  #features() {
    const missing = [];
    if (
      typeof WebAssembly !== "object" ||
      typeof WebAssembly.Module?.customSections !== "function"
    ) {
      missing.push("WebAssembly");
    }
    for (const [name, present] of [
      ["Worker", typeof Worker === "function"],
      ["Blob", typeof Blob === "function"],
      [
        "URL.createObjectURL",
        typeof URL === "function" && typeof URL.createObjectURL === "function",
      ],
      ["TextEncoder", typeof TextEncoder === "function"],
    ]) {
      if (!present) missing.push(name);
    }
    if (
      this.#needs.includes("random") &&
      typeof globalThis.crypto?.getRandomValues !== "function"
    ) {
      missing.push("crypto.getRandomValues");
    }
    // The threaded Argon2 build runs only on an isolated page, which must then share memory.
    const threads = this.#needs.includes("threads") && globalThis.crossOriginIsolated === true;
    if (threads && (typeof SharedArrayBuffer !== "function" || typeof Atomics !== "object")) {
      missing.push("SharedArrayBuffer and Atomics");
    }
    return missing.length === 0
      ? { ...PAGE_PARTS.features, outcome: "passed" }
      : {
          ...PAGE_PARTS.features,
          outcome: "failed",
          detail: `the browser lacks ${missing.join(", ")}`,
        };
  }

  /**
   * Whether the WebAssembly compiles here; null when it does. A page whose
   * Content-Security-Policy lacks 'wasm-unsafe-eval' cannot compile it.
   */
  async #compiles() {
    try {
      await this.#wasm.get();
      return null;
    } catch (error) {
      return {
        ...PAGE_PARTS.features,
        outcome: "failed",
        detail:
          "the WebAssembly does not compile here, as when the page's Content-Security-Policy " +
          `lacks 'wasm-unsafe-eval': ${error.message}`,
      };
    }
  }

  /**
   * The class file and this runtime must come from one build; the worker compares its build with
   * the WebAssembly's and with this runtime's when it starts (WorkerJob).
   */
  #packageParts() {
    if (this.#classBuildId !== BUILD_ID) {
      throw packageMismatch(
        `The file ${this.#classFile} is of build ${this.#classBuildId} and runtime/runtime.js of ` +
          `build ${BUILD_ID}`,
      );
    }
    return { ...PAGE_PARTS.package, outcome: "passed" };
  }

  /** The parts another class of the page has passed with this WebAssembly. */
  #passedIds() {
    const passed = this.#passed();
    return [...passed.keys()].filter((id) => passed.get(id).has(this.#identityOf(id)));
  }

  /**
   * The parts passed with this WebAssembly on the page: for each identifier, the outcome for each
   * identity of the part (see the constructor), undefined for most.
   */
  #passed() {
    let passed = passedOnPage.get(this.#wasm.source);
    if (passed === undefined) {
      passed = new Map();
      passedOnPage.set(this.#wasm.source, passed);
    }
    return passed;
  }

  /**
   * The parts of a worker's report in the set's order, those left out because another class
   * passed them included as that class found them. At startup the parts that passed are kept for
   * the other classes. A report of a WebAssembly that stopped has no order: its parts as they are.
   */
  #placed(ran, skipPassed) {
    if (!skipPassed) return ran.components;
    const passed = this.#passed();
    for (const component of ran.components) {
      if (component.outcome !== "passed") continue;
      if (!passed.has(component.id)) passed.set(component.id, new Map());
      passed.get(component.id).set(this.#identityOf(component.id), component);
    }
    if (ran.ids === undefined) return ran.components;
    return ran.ids
      .map(
        (id) =>
          ran.components.find((component) => component.id === id) ??
          passed.get(id)?.get(this.#identityOf(id)),
      )
      .filter((component) => component !== undefined);
  }
}

/** The page's encoding of secrets, compared with a published vector, and its refusal. */
function encodingPart() {
  let failure = null;
  try {
    const bytes = encodeSecret(ENCODING_PROBE, "probe");
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== ENCODING_PROBE_UTF8) failure = "the page encodes text into other UTF-8 bytes";
  } catch {
    failure = "the page cannot encode text";
  }
  if (failure === null) {
    try {
      encodeSecret(LONE_SURROGATE, "probe");
      failure = "a lone surrogate is accepted instead of refused";
    } catch (error) {
      if (error?.code !== "INVALID_PASSWORD_TEXT") {
        failure = "a lone surrogate is refused with another error";
      }
    }
  }
  return failure === null
    ? { ...PAGE_PARTS.encoding, outcome: "passed" }
    : { ...PAGE_PARTS.encoding, outcome: "failed", detail: failure };
}

/**
 * The error of every operation of a class whose self-check found a part that failed. Its text is
 * the library's `self_check::failure_message`, which a report of page parts cannot call; the
 * package checks compare both word for word.
 */
function selfCheckFailed(report) {
  const failed = report.components.find((component) => component.outcome === "failed");
  // A detail that ends a sentence of its own keeps one period, as in the library (AUD-015-UI005).
  const detail = String(failed.detail).replace(/\.+$/u, "");
  return new MhfeError(
    "SELF_CHECK_FAILED",
    sentence(
      `the self-test failed: ${failed.label}: ${detail}. ` +
        "Do not use this program on this computer",
    ),
    { report },
  );
}
