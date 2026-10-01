// Browser client for MHFE suite 3. Every operation runs in a new Web Worker, so a long Argon2
// computation never blocks the page, cancel() can stop it at once, and the worker's memory is
// freed when it ends.
//
// The page supplies the parts of the package as text and bytes, because a page under a strict
// Content-Security-Policy may not fetch anything:
//
//   const client = new MhfeClient({
//     workerSource,          // text of mhfe-worker.js
//     argon2Threaded,        // text of argon2-mt.js
//     argon2SingleThreaded,  // text of argon2-st.js
//     coreWasm,              // mhfe_core_bg.wasm as a Uint8Array or a WebAssembly.Module
//   });
//
// The five operations (encrypt, decrypt, check, readPhrase, readContainer) return a promise and
// report every error by rejecting it, the checks of their arguments included; none throws when it
// is called. A callback of the page that throws, or whose promise rejects, stops the operation and
// rejects it with CALLBACK_FAILED. mode(), maxSupportedMemLevel() and cancel() are synchronous.
// Only the constructor throws, for missing package parts.

/** Four Argon2 lanes in parallel; needs a cross-origin isolated page, such as `mhfe serve` gives. */
export const FAST_MODE = "fast";
/** One lane after another; works everywhere, including a page opened as a file. */
export const STANDARD_MODE = "standard";

/** The reference Argon2 code allows 2 GiB when pointers are 32 bits wide, as in WebAssembly: memory level 0 only. */
const HIGHEST_BROWSER_MEMORY_LEVEL = 0;
const MAX_PIM = 1023;
const MAX_MEMORY_LEVEL = 21;
const WORD_COUNTS = [12, 15, 18, 21, 24];
const REFERENCE_KINDS = ["address", "fingerprint", "words"];

export class MhfeError extends Error {
  /** `options.cause` keeps the original error, as for CALLBACK_FAILED. */
  constructor(code, message, options) {
    super(message, options);
    this.name = "MhfeError";
    this.code = code;
  }
}

export class MhfeCancelledError extends MhfeError {
  constructor() {
    super("CANCELLED", "The operation was cancelled.");
    this.name = "MhfeCancelledError";
  }
}

export class MhfeClient {
  #sources;
  #running = null;

  constructor({ workerSource, argon2Threaded, argon2SingleThreaded, coreWasm }) {
    for (const [name, value] of Object.entries({
      workerSource,
      argon2Threaded,
      argon2SingleThreaded,
    })) {
      if (typeof value !== "string" || value.length === 0)
        throw new TypeError(`${name} must be the text of the file.`);
    }
    if (!(coreWasm instanceof Uint8Array) && !(coreWasm instanceof WebAssembly.Module)) {
      throw new TypeError("coreWasm must be a Uint8Array or a WebAssembly.Module.");
    }
    this.#sources = { workerSource, argon2Threaded, argon2SingleThreaded, coreWasm };
  }

  /** "fast" on a cross-origin isolated page, otherwise "standard" (about three times slower). */
  mode() {
    return globalThis.crossOriginIsolated === true ? FAST_MODE : STANDARD_MODE;
  }

  /** The highest memory level this browser build can use: 0 (2 GiB). */
  maxSupportedMemLevel() {
    return HIGHEST_BROWSER_MEMORY_LEVEL;
  }

  /**
   * Encrypts an original phrase. `passwordRepeat` is the password typed a second time: a typing
   * mistake in the password would lock the phrase away for good. The encryption then decrypts
   * the container's words again and compares the result with the phrase, so it runs 24 rounds.
   * Resolves to `{ container }` only after that check has passed; a failed check rejects with
   * the code VERIFICATION_FAILED.
   *
   * `onUnverified({ container })` is called after the first 12 rounds, so that the page can show
   * the container while the check runs. The page must then mark it as not yet verified and later
   * say how the check ended: verified, wrong (VERIFICATION_FAILED), or not verified (cancelled or
   * any other error).
   */
  async encrypt({
    phrase,
    password,
    passwordRepeat,
    pim = 0,
    memoryLevel = 0,
    onProgress,
    onUnverified,
  } = {}) {
    requireText(phrase, "phrase");
    requireSamePassword(password, passwordRepeat);
    requireCallback(onUnverified, "onUnverified");
    const request = { operation: "encrypt", phrase };
    return this.#start(request, { password, pim, memoryLevel, onProgress, onUnverified });
  }

  /**
   * Recovers the original phrase. `words` is 0 for automatic detection or the known length.
   * Resolves to `{ kind: 'phrase' | 'ambiguous', candidates: [{ words, verified, phrase }] }`.
   */
  async decrypt({ container, password, pim = 0, memoryLevel = 0, words = 0, onProgress } = {}) {
    requireText(container, "container");
    if (words !== 0 && !WORD_COUNTS.includes(words)) {
      throw new MhfeError(
        "INVALID_WORD_COUNT",
        "words must be 0 (detect) or 12, 15, 18, 21 or 24.",
      );
    }
    return this.#start(
      { operation: "decrypt", container, words },
      { password, pim, memoryLevel, onProgress },
    );
  }

  /**
   * The rehearsal check. `reference` is `{ address, path? }` (strong), `{ fingerprint }` (quick,
   * weaker) or `{ words }` (built-in check of a 12- to 21-word original). Resolves to
   * `{ matches }` and never to any part of the phrase.
   */
  async check({
    container,
    password,
    pim = 0,
    memoryLevel = 0,
    reference,
    passphrase = "",
    onProgress,
  } = {}) {
    requireText(container, "container");
    const [referenceKind, referenceValue, path] = describeReference(reference);
    // Everything that is not secret is checked before the passphrase is copied into bytes.
    this.#requireIdle();
    requireSettings(pim, memoryLevel);
    requireCallback(onProgress, "onProgress");
    const passphraseBytes = encodeSecret(passphrase, "passphrase", true);
    const request = {
      operation: "check",
      container,
      referenceKind,
      reference: referenceValue,
      path,
      passphrase: passphraseBytes,
    };
    return this.#start(request, { password, pim, memoryLevel, onProgress }, [
      passphraseBytes.buffer,
    ]);
  }

  /**
   * Reads an original phrase the way a person may have typed it (any case and spacing, words cut
   * to four letters) and resolves to `{ phrase, words, otherLengths }` with every word written out,
   * for showing back to the user. `otherLengths` is almost always empty; when it is not, automatic
   * detection would not give this phrase on its own after recovery, so the page should tell the
   * user to note the word count and choose it then. Rejects an invalid phrase.
   */
  async readPhrase(phrase) {
    requireText(phrase, "phrase");
    return this.#read({ operation: "readPhrase", phrase });
  }

  /** Like readPhrase for a container: resolves to `{ container }` with every word written out. */
  async readContainer(container) {
    requireText(container, "container");
    return this.#read({ operation: "readContainer", container });
  }

  /** Stops the running operation at once; its promise rejects with MhfeCancelledError. */
  cancel() {
    this.#running?.stop(new MhfeCancelledError());
  }

  #start(request, { password, pim, memoryLevel, onProgress, onUnverified }, transfer = []) {
    // Until the worker owns them, the byte copies of the secrets belong to this client: every
    // failure on the way wipes them. A caller's own Uint8Array is never touched, because
    // encodeSecret copies it.
    let message = request;
    try {
      this.#requireIdle();
      requireSettings(pim, memoryLevel);
      requireCallback(onProgress, "onProgress");
      message = { ...request, password: encodeSecret(password, "password", false) };
      const fast = this.mode() === FAST_MODE;
      const argon2Source = fast ? this.#sources.argon2Threaded : this.#sources.argon2SingleThreaded;
      message.pim = pim;
      message.memoryLevel = memoryLevel;
      message.coreWasm = this.#sources.coreWasm;
      // The threaded build's lane workers run this same script and may only come from a Blob.
      message.argon2Script = fast
        ? new Blob([this.#sources.argon2Threaded], { type: "text/javascript" })
        : null;
      return this.#run(argon2Source, message, [message.password.buffer, ...transfer], {
        onProgress,
        onUnverified,
      });
    } catch (error) {
      wipeSecrets(message);
      throw error;
    }
  }

  #requireIdle() {
    if (this.#running !== null) {
      throw new MhfeError("BUSY", "Another operation is still running.");
    }
  }

  /** Reading words needs only the Rust core, so the worker gets no Argon2 build. */
  #read(request) {
    this.#requireIdle();
    return this.#run("", { ...request, coreWasm: this.#sources.coreWasm }, [], {});
  }

  #run(argon2Source, message, transfer, { onProgress, onUnverified }) {
    const url = URL.createObjectURL(
      new Blob([argon2Source, "\n;\n", this.#sources.workerSource], { type: "text/javascript" }),
    );
    return new Promise((resolve, reject) => {
      let worker;
      const running = {
        // Stops this operation once; a late event of its worker cannot end a later operation.
        stop: (error) => {
          if (this.#running !== running) return;
          worker?.terminate();
          URL.revokeObjectURL(url);
          this.#running = null;
          if (error !== null) reject(error);
        },
      };
      this.#running = running;
      try {
        worker = new Worker(url, { name: "mhfe" });
      } catch (error) {
        wipeSecrets(message);
        running.stop(
          new MhfeError(
            "WORKER_FAILED",
            `The browser refused to start the worker: ${error.message}`,
          ),
        );
        return;
      }
      // A callback of the page that fails ends the operation: the worker stops, which frees its
      // secrets, and the promise rejects with the page's error as the cause, so the page learns of
      // it where it learns of every other error. An async callback fails by rejecting the promise
      // it returns; the operation does not wait for that promise.
      const callPage = (callback, value, name) => {
        const callbackFailed = (cause) =>
          new MhfeError("CALLBACK_FAILED", `The page's ${name} callback failed.`, { cause });
        try {
          const returned = callback?.(value);
          if (typeof returned?.then === "function") {
            returned.then(undefined, (cause) => {
              // Once the operation has ended there is nothing left to stop: the page's rejection
              // stays unhandled, as it would be without this client, instead of being swallowed.
              if (this.#running !== running) throw cause;
              running.stop(callbackFailed(cause));
            });
          }
        } catch (cause) {
          running.stop(callbackFailed(cause));
        }
      };
      worker.onmessage = (event) => {
        // Messages that were already on their way when the operation ended are ignored.
        if (this.#running !== running) return;
        const reply = event.data;
        if (reply.type === "progress") {
          callPage(onProgress, { round: reply.round, rounds: reply.rounds }, "onProgress");
        } else if (reply.type === "unverified") {
          callPage(onUnverified, { container: reply.container }, "onUnverified");
        } else if (reply.type === "result") {
          running.stop(null);
          resolve(reply.result);
        } else if (reply.type === "error") {
          running.stop(new MhfeError(reply.error.code, sentence(reply.error.message)));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        running.stop(
          new MhfeError("WORKER_FAILED", event.message || "The worker stopped unexpectedly."),
        );
      };
      try {
        worker.postMessage(message, transfer);
      } catch (error) {
        wipeSecrets(message);
        running.stop(
          new MhfeError("WORKER_FAILED", `The request could not be sent: ${error.message}`),
        );
      }
    });
  }
}

/**
 * A page shows an error message as it is, so it starts with a capital letter, as the messages of
 * the command-line tool do. The Rust core's messages start in lower case to fit inside a sentence.
 */
function sentence(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function requireText(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string.`);
}

/** The repeated password must be the same string, or the same bytes. */
function requireSamePassword(password, passwordRepeat) {
  const same =
    password instanceof Uint8Array && passwordRepeat instanceof Uint8Array
      ? password.length === passwordRepeat.length &&
        password.every((byte, index) => byte === passwordRepeat[index])
      : typeof password === "string" && password === passwordRepeat;
  if (!same) {
    throw new MhfeError("PASSWORDS_DIFFER", "The password and its repetition differ.");
  }
}

function requireCallback(value, name) {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${name} must be a function.`);
  }
}

/** The PIM and memory level, including the browser's memory limit. */
function requireSettings(pim, memoryLevel) {
  requireSetting(pim, MAX_PIM, "INVALID_PIM", "pim");
  requireSetting(memoryLevel, MAX_MEMORY_LEVEL, "INVALID_MEMORY_LEVEL", "memoryLevel");
  if (memoryLevel > HIGHEST_BROWSER_MEMORY_LEVEL) {
    throw new MhfeError(
      "MEMORY_LEVEL_NOT_SUPPORTED_HERE",
      `Memory level ${memoryLevel} needs more memory than a browser can give; use the mhfe command-line tool.`,
    );
  }
}

function requireSetting(value, highest, code, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > highest) {
    throw new MhfeError(code, `${name} must be a whole number from 0 to ${highest}.`);
  }
}

/** Overwrites this client's byte copies of the secrets in a request; they are its own arrays. */
function wipeSecrets(message) {
  message.password?.fill(0);
  message.passphrase?.fill(0);
}

/**
 * UTF-8 bytes of a password or passphrase. A JavaScript string may hold a lone surrogate, which
 * TextEncoder would silently turn into U+FFFD, so such a string is refused instead. Bytes are
 * copied so that the transfer to the worker does not empty the caller's array.
 */
function encodeSecret(value, name, emptyAllowed) {
  let bytes;
  if (value instanceof Uint8Array) {
    bytes = value.slice();
  } else if (typeof value === "string") {
    if (!isWellFormed(value)) {
      throw new MhfeError(
        "INVALID_PASSWORD_TEXT",
        `The ${name} contains an unpaired surrogate, which is not valid text.`,
      );
    }
    bytes = new TextEncoder().encode(value);
  } else {
    throw new TypeError(`${name} must be a string or a Uint8Array.`);
  }
  if (!emptyAllowed && bytes.length === 0) {
    throw new MhfeError("EMPTY_PASSWORD", `The ${name} is empty.`);
  }
  return bytes;
}

function isWellFormed(text) {
  if (typeof text.isWellFormed === "function") return text.isWellFormed();
  // With the u flag a valid pair is one code point, so only a lone surrogate matches.
  return !/[\uD800-\uDFFF]/u.test(text);
}

/**
 * The one reference of a check. Exactly one of address, fingerprint and words must be given:
 * with several, the check would silently use only one of them.
 */
function describeReference(reference) {
  const isObject = reference !== null && typeof reference === "object";
  const given = (kind) => Object.hasOwn(reference, kind) && reference[kind] !== undefined;
  const kinds = isObject ? REFERENCE_KINDS.filter(given) : [];
  if (kinds.length !== 1) {
    throw new TypeError(
      "reference must be exactly one of { address, path? }, { fingerprint } or { words }.",
    );
  }
  if (reference.path !== undefined && kinds[0] !== "address") {
    throw new TypeError("reference.path belongs only to an address reference.");
  }
  switch (kinds[0]) {
    case "address":
      requireText(reference.address, "reference.address");
      if (reference.path !== undefined) requireText(reference.path, "reference.path");
      return ["address", reference.address, reference.path ?? ""];
    case "fingerprint":
      requireText(reference.fingerprint, "reference.fingerprint");
      return ["fingerprint", reference.fingerprint, ""];
    default:
      if (![12, 15, 18, 21].includes(reference.words)) {
        throw new MhfeError(
          "INVALID_WORD_COUNT",
          "The built-in check needs a 12-, 15-, 18- or 21-word original.",
        );
      }
      return ["words", String(reference.words), ""];
  }
}
