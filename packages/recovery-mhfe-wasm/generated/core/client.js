// The core module of the mhfe browser package: encryption, recovery, the rehearsal check, rekey,
// hidden wallets and the self-test, with Argon2. Every operation runs in a new Web Worker, so a
// long Argon2 computation never blocks the page, cancel() can end it at once, and the worker's
// memory is freed when the worker is terminated, as soon as it has loaded the WebAssembly.
//
// The page supplies the parts of the module as text and bytes, because a page under a strict
// Content-Security-Policy may not fetch anything:
//
//   const client = new MhfeClient({
//     workerSource,          // text of runtime/worker.js
//     wasm,                  // runtime/mhfe.wasm as a Uint8Array or a WebAssembly.Module
//     argon2Threaded,        // text of core/argon2-mt.js
//     argon2SingleThreaded,  // text of core/argon2-st.js
//   });
//
// A page that uses other module classes too compiles runtime/mhfe.wasm once, with
// WebAssembly.compile, and passes the WebAssembly.Module to each.
//
// Every operation returns a promise and reports every error by rejecting it, the checks of its
// arguments included; none throws when it is called. A callback of the page that throws, or whose
// promise rejects, stops the operation and rejects it with CALLBACK_FAILED. mode(),
// maxSupportedMemLevel() and cancel() are synchronous. Only the constructor throws, for missing
// package parts. One long operation runs at a time (BUSY otherwise); reading words and the
// parameters never wait. The first operation waits for the class's startup check
// (startupCheck()); parameters(), selfTest(), startupCheck() and fullCheck() do not.

import {
  CompiledModule,
  MhfeCancelledError,
  MhfeError,
  OperationSlot,
  PackageCheck,
  WorkerJob,
  countsText,
  describeChoice,
  encodeSecret,
  packageMismatch,
  requireBoolean,
  requireCallback,
  requireSecret,
  secretOrEmpty,
  requireText,
  secretBuffers,
  sentence,
  wipeSecrets,
} from "../runtime/runtime.js";

export { MhfeCancelledError, MhfeError } from "../runtime/runtime.js";

/** Four Argon2 lanes in parallel; needs a cross-origin isolated page, such as `mhfe serve` gives. */
export const FAST_MODE = "fast";
/** One lane after another; works everywhere, including a page opened as a file. */
export const STANDARD_MODE = "standard";

// These limits are checked here, before any secret is copied, so that a refusal never waits for a
// worker. scripts/verify-browser-package.mjs checks that each equals the core's suiteParameters();
// a repair word count of 0 means none.
/** The reference Argon2 code allows 2 GiB when pointers are 32 bits wide, as in WebAssembly: memory level 0 only. */
const HIGHEST_BROWSER_MEMORY_LEVEL = 0;
const MAX_PIM = 1023;
const MAX_MEMORY_LEVEL = 21;
const WORD_COUNTS = [12, 15, 18, 21, 24];
const BUILT_IN_CHECK_WORD_COUNTS = [12, 15, 18, 21];
const REPAIR_WORD_COUNTS = [0, 2, 4, 6, 8];
const DECOY_SCAN_GAP = 20;
const REFERENCE_KINDS = ["address", "fingerprint", "words", "walletCheck"];
/** The name of this module's operations in the package's worker. */
const CORE_MODULE = "core";
/** The build of this file, which scripts/stamp-build-id.mjs writes; see BUILD_ID in the runtime. */
const CLIENT_BUILD_ID = "4f5000f4290fa5eb";

// The parts of the self-check that run Argon2: its known answer at 1 MiB, and at 64 and 256 MiB.
// The page names them before any worker runs; scripts/verify-browser-package.mjs checks that they
// are the core's parameters().argon2Parts.
const ARGON2_PART = "argon2";
const ARGON2_SIZES_PART = "argon2-sizes";
/** How the full self-check names the check at 64 and 256 MiB of each of the two Argon2 builds. */
const ARGON2_SIZES_OF_BUILD = {
  singleThreaded: {
    id: "argon2-sizes-single-threaded",
    label: "Argon2id at 64 and 256 MiB, single-threaded build",
  },
  threaded: { id: "argon2-sizes-threaded", label: "Argon2id at 64 and 256 MiB, threaded build" },
};
/**
 * What the full self-check lists without running: the published vectors, which take minutes and
 * 2 GiB and run in selfTest() only, and the parts of the command-line tool's self-test that a
 * browser cannot check, with the reason.
 */
const NOT_RUN_IN_FULL_CHECK = [
  {
    id: "published-vectors",
    label: "Published vectors",
    outcome: "notRun",
    detail: "they take minutes and 2 GiB: selfTest() runs them",
  },
  {
    id: "memory-locking",
    label: "Locked memory",
    outcome: "notAvailable",
    detail: "a web page cannot keep its memory out of swap",
  },
  {
    id: "core-dumps",
    label: "Core dumps",
    outcome: "notAvailable",
    detail: "the browser keeps its own crash reports, which a page cannot turn off",
  },
  {
    id: "isolation",
    label: "Isolation",
    outcome: "notAvailable",
    detail: "a web page cannot sandbox itself or prove that it is offline",
  },
  {
    id: "hidden-input",
    label: "Hidden input",
    outcome: "notAvailable",
    detail: "a web page has no terminal whose echo it could read back",
  },
];

export class MhfeClient {
  #sources;
  #wasm;
  #check;
  #slot = new OperationSlot();

  constructor({ workerSource, wasm, argon2Threaded, argon2SingleThreaded } = {}) {
    for (const [name, value] of Object.entries({
      workerSource,
      argon2Threaded,
      argon2SingleThreaded,
    })) {
      if (typeof value !== "string" || value.length === 0)
        throw new TypeError(`${name} must be the text of the file.`);
    }
    this.#wasm = new CompiledModule(wasm, "wasm");
    this.#sources = { workerSource, argon2Threaded, argon2SingleThreaded };
    this.#check = new PackageCheck({
      wasm: this.#wasm,
      classFile: "core/client.js",
      classBuildId: CLIENT_BUILD_ID,
      needs: ["threads"],
      secrets: true,
      // Argon2's known answer holds for the build that gave it, which another client may not use.
      identityOf: (id) => (id === ARGON2_PART ? this.#argon2Source() : undefined),
    });
  }

  /** "fast" on a cross-origin isolated page, otherwise "standard" (about three times slower). */
  mode() {
    return globalThis.crossOriginIsolated === true ? FAST_MODE : STANDARD_MODE;
  }

  /**
   * The quick self-check of the core: known answers of every part encryption, recovery, the
   * rehearsal check, rekey and hidden wallets compute, each with a case it must refuse, and what
   * the page itself must do. With `argon2` (the default) it also runs Argon2's known answer at
   * 1 MiB through this mode's Argon2 build, which it loads; `argon2: false` leaves Argon2 out (not
   * run), for a quick check at a page's start, since every operation runs that known answer itself
   * before its first round and after its last. Resolves to `{ passed, tier, version, buildId,
   * components: [{ id, label, outcome, detail? }] }`, made once per page for each choice: parts
   * that another class of the page passed with the same WebAssembly are not run again. Every
   * operation but parameters() and selfTest() awaits it before its first call (without Argon2 when
   * none ran yet). When a part has failed, every such operation rejects with SELF_CHECK_FAILED from
   * then on, the report attached; a page keeps its controls closed and shows the report.
   *
   * An Argon2 build that does not start gave no wrong answer: Argon2 is then not available, with
   * the cause, the class stays open and the next call checks again, and an operation gets its own
   * error. When only the threaded build of the fast mode does not start, the check runs the
   * single-threaded build of the standard mode instead, and Argon2 passes with a warning that says
   * so.
   */
  async startupCheck({ argon2 = true } = {}) {
    requireBoolean(argon2, "argon2");
    return this.#check.startup(argon2 ? "argon2" : "withoutArgon2", (skip, handlers) =>
      this.#coreCheck("startup", skip, argon2, handlers),
    );
  }

  /**
   * The full self-check, run anew each time, in seconds: every part with its slower cases, and
   * Argon2 at 64 and 256 MiB with each build in turn, never two at once: the single-threaded build,
   * then on a cross-origin isolated page the threaded one (not run otherwise). It lists the
   * published vectors as not run (selfTest() runs them) and the parts a browser cannot check as not
   * available, with the reason. `onProgress({ id, label, running, outcome?, detail? })` hears of
   * each part as it starts and ends. Resolves to a report as startupCheck() does; a failed part
   * closes the client as there. A browser that cannot give 256 MiB, and an Argon2 build that does
   * not start, make those parts not available rather than failed, as startupCheck() describes.
   */
  async fullCheck({ onProgress } = {}) {
    requireCallback(onProgress, "onProgress");
    const sizesOf = (build, threaded) => ({
      run: (_, handlers) => this.#argon2Check(threaded, handlers),
      rename: (component) =>
        component.id === ARGON2_SIZES_PART ? { ...component, ...build } : component,
    });
    const threaded =
      this.mode() === FAST_MODE
        ? sizesOf(ARGON2_SIZES_OF_BUILD.threaded, true)
        : {
            components: [
              {
                ...ARGON2_SIZES_OF_BUILD.threaded,
                outcome: "notRun",
                detail: "the page is not cross-origin isolated",
              },
            ],
          };
    return this.#check.full(
      [
        { run: (skip, handlers) => this.#coreCheck("full", skip, true, handlers) },
        sizesOf(ARGON2_SIZES_OF_BUILD.singleThreaded, false),
        threaded,
        { components: NOT_RUN_IN_FULL_CHECK },
      ],
      onProgress,
    );
  }

  /** The highest memory level this browser build can use: 0 (2 GiB). */
  maxSupportedMemLevel() {
    return HIGHEST_BROWSER_MEMORY_LEVEL;
  }

  /**
   * The core's fixed values: `{ version, suiteId, sameLengthSuiteId, rounds, maxPim,
   * maxMemoryLevel, highestBrowserMemoryLevel, wordCounts, builtInCheckWordCounts,
   * repairWordCounts, recommendedRepairWords, repairCapacities, hiddenWalletRefusals,
   * decoyScanGap, argon2Parts }`.
   */
  async parameters() {
    return this.#quick({ operation: "parameters" });
  }

  /**
   * Reads an original phrase the way a person may have typed it (any case and spacing, words cut
   * to four letters) and resolves to `{ phrase, words, otherLengths, containers: [{ sameLength,
   * words, wrongWordPassesOneIn, otherLengths }] }`: every word written out, for showing back, and
   * the containers it can be encrypted into, each with its own `otherLengths`, empty for a
   * same-length one; the top-level `otherLengths` is the 24-word container's. `otherLengths` is
   * almost always empty; when it is not, automatic detection would not give this phrase on its own
   * after recovery, so the page tells the user to note the word count and choose it then. Rejects
   * an invalid phrase.
   */
  async readPhrase(phrase) {
    requireText(phrase, "phrase");
    await this.#ready();
    // The phrase goes as bytes that the worker and the WebAssembly wipe, as a password does.
    const message = { operation: "describePhrase", phrase: encodeSecret(phrase, "phrase") };
    return this.#quick(message, secretBuffers(message));
  }

  /**
   * Like readPhrase for a container: resolves to `{ container, words, suiteId, phraseLengths,
   * builtInCheckLengths, confirmationFor, hiddenWallets, offersWalletCheck, containerFingerprint }`.
   * `confirmationFor` says, for each phrase length, what confirms a recovery to encrypt again:
   * "builtInCheck" for a stated 12- to 21-word length of a 24-word container, and "walletOrOwner"
   * for every other length and for "0", the length detected, which the built-in check alone does
   * not confirm.
   */
  async readContainer(container) {
    requireText(container, "container");
    await this.#ready();
    return this.#quick({ operation: "describeContainer", container });
  }

  /**
   * Encrypts an original phrase. `passwordRepeat` is the password typed a second time: a typing
   * mistake in the password would lock the phrase away for good. `passwordRepair` is the choice of
   * the check word review (MhfePasswords.review): "asTyped" (the default), "corrected" or
   * `{ repair: position }`. The encryption then decrypts the container's words again and compares
   * the result with the phrase, so it runs 24 rounds: "encrypt" 1 to 12, then "check" 13 to 24.
   *
   * Resolves only after that check has passed to `{ container, suiteId, containerFingerprint,
   * builtInCheck, otherLengths, repairWords, repairProfile, keep: [{ item, ... }] }`; a failed
   * check rejects with VERIFICATION_FAILED. `keep` lists what the owner keeps, in order:
   * containerWords {words}, password, passphrase or passphraseIfAny, repairWords, pim {value},
   * memoryLevel {value}, wordCount {words}.
   *
   * The container has 24 words. With `sameLength: true`, which only the user's own choice may
   * set after the page has shown its consequences, a 12- to 21-word phrase gives a container of
   * its own length instead. `repairWordCount` 2, 4, 6 or 8 makes repair words, which come only
   * with the result. `walletHasPassphrase` says whether the wallet has a BIP39 passphrase, only
   * where the page knows it, such as after drawPhrase(): true adds it to what to keep, since MHFE
   * encrypts only the phrase, and false leaves it out. Left out or null, `keep` names any BIP39
   * passphrase of the wallet (passphraseIfAny) instead: the page need not ask.
   *
   * `onUnverified({ container, containerFingerprint })` is called after the first 12 rounds, so
   * that the page can show the container while the check runs, marked as not yet verified, and
   * later say how the check ended: verified, wrong (VERIFICATION_FAILED), or not verified
   * (cancelled or any other error).
   */
  async encrypt({
    phrase,
    password,
    passwordRepeat,
    passwordRepair,
    pim = 0,
    memoryLevel = 0,
    sameLength = false,
    repairWordCount = 0,
    walletHasPassphrase,
    onProgress,
    onUnverified,
  } = {}) {
    requireText(phrase, "phrase");
    requireBoolean(sameLength, "sameLength");
    if (walletHasPassphrase !== undefined && walletHasPassphrase !== null) {
      requireWalletPassphrase(walletHasPassphrase);
    }
    requireRepairWordCount(repairWordCount);
    requireCallback(onUnverified, "onUnverified");
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    return this.#long(
      {
        operation: "encrypt",
        choice,
        position,
        sameLength,
        repairWordCount,
        walletHasPassphrase,
      },
      {
        phrase,
        password,
        passwordRepeat,
        pim,
        memoryLevel,
        onProgress,
        handlers: { unverified: onUnverified },
      },
    );
  }

  /**
   * Recovers the original phrase, twelve rounds, "recover". The container's word count selects
   * the suite. `words` is 0 for automatic detection or the known length. Resolves to `{ kind:
   * 'phrase' | 'ambiguous', candidates: [{ words, verified, status, phrase, suiteId,
   * fingerprintWithoutPassphrase, walletCheck, statedWords, otherLengths }] }`; `status` is
   * "verified", "noBuiltInCheck", "readAs24" or "readAs24Chosen". `walletCheck` is the 16-bit
   * source check of a 24-word reading with `passphrase`, the wallet's BIP39 passphrase or "" for
   * none, which every recovery evaluates: the container does not show whether the phrase was
   * made with the check, so a page asks for the passphrase when a 24-word reading comes out,
   * says why, and decrypts again with it, or asks before; null for other lengths. A pass makes a
   * right password very likely; a failure means something only if the wallet was made with the
   * check. A stated
   * length does not replace detection: a built-in check that passes takes precedence, and
   * `statedWords` then names the length stated; 24 stated words beside a check that passes give
   * "ambiguous", the checked reading first.
   */
  async decrypt({
    container,
    password,
    passwordRepair,
    pim = 0,
    memoryLevel = 0,
    words = 0,
    passphrase = "",
    onProgress,
  } = {}) {
    requireText(container, "container");
    requireWordCount(words);
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    return this.#long(
      { operation: "decrypt", container, choice, position, words },
      { password, pim, memoryLevel, onProgress, passphrase },
    );
  }

  /**
   * The rehearsal check. `reference` is `{ address, coin, path? }` (strong), `{ fingerprint }`
   * (quick, weaker), `{ words }` (built-in check of a 12- to 21-word original; 0 detects the
   * length, and with `passphrase` a 24-word phrase drawn with the phrase + passphrase check is
   * found too) or `{ walletCheck: true }` (the phrase and passphrase check of a 24-word container,
   * with a passphrase). Resolves to `{ matches, path, evidence }`, `path` being where a matched
   * address was found and null otherwise, `evidence` `{ builtInCheck, walletCheck }` the original
   * seed phrase's own checks from the same recovery, and never to any part of the phrase.
   * Progress: "recover" 1 to 12, then once "compare".
   *
   * With `{ words: 0 }`, `onNoLength` is called when detection found no length: ask the user how
   * many words the original seed phrase has, and return `{ words }` (12 to 21) or for 24 words
   * `{ address, coin, path?, passphrase? }` or `{ fingerprint, passphrase? }`, compared on the
   * same recovery without its rounds again; null keeps the result.
   */
  async check({
    container,
    password,
    passwordRepair,
    pim = 0,
    memoryLevel = 0,
    reference,
    passphrase = "",
    onProgress,
    onNoLength,
  } = {}) {
    requireText(container, "container");
    const [referenceKind, referenceValue, coin, path] = describeReference(reference);
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    requireCallback(onNoLength, "onNoLength");
    const asksLength = onNoLength !== undefined;
    if (asksLength && (referenceKind !== "words" || referenceValue !== "0")) {
      throw new TypeError("onNoLength belongs only to { words: 0 }, the length detected.");
    }
    return this.#long(
      {
        operation: "check",
        container,
        choice,
        position,
        referenceKind,
        reference: referenceValue,
        coin,
        path,
        asksLength,
      },
      {
        password,
        pim,
        memoryLevel,
        onProgress,
        passphrase,
        handlers: asksLength ? { noLength: () => answerNoLength(onNoLength) } : {},
      },
    );
  }

  /**
   * The candidates of a container phrase with words typed as "?" (MhfeRepair.inspectContainer
   * says "marked"), before a search without its repair words: `{ missing, candidates,
   * offersWalletSearch, offersOwnChecks }`, the positions from 1, how many candidate containers
   * pass the BIP39 checksum, and which searches with the password the library offers for them:
   * the original seed phrase's wallet (searchWallet() with an address or fingerprint) and its own
   * checks (searchWallet() with `{ builtInCheck: true }` or `{ walletCheck: true }`). The decoy
   * search (searchDecoy()) is always offered. More than two missing words reject with
   * TOO_MANY_MISSING_WORDS.
   */
  async searchCandidates({ container } = {}) {
    requireText(container, "container");
    await this.#ready();
    return this.#quick({ operation: "searchCandidates", container });
  }

  /**
   * Searches for the words of a container phrase typed as "?", up to two, with the decoy wallet:
   * the container itself as a wallet, whose master key fingerprint the page showed under the
   * container. No password and no Argon2: seconds for one word, minutes for two. `reference` is
   * `{ address, coin, path? }` or `{ fingerprint }`, `passphrase` the BIP39 passphrase used with
   * the container phrase, "" for none: ask the user whether one is used. For two missing words an
   * address is searched among the first `scanGap` receiving and as many change addresses of the
   * first account: parameters().decoyScanGap by default, the usual gap of a wallet; more takes
   * longer in proportion.
   * Progress: `{ stage: "search", candidate, candidates }`.
   * Resolves to `{ found, container, containerFingerprint, words: [{ position, word }], path,
   * candidates }`, `container` null when none matched. Show the words found and use the container
   * only after the user has said so.
   */
  async searchDecoy({
    container,
    reference,
    passphrase = "",
    scanGap = DECOY_SCAN_GAP,
    onProgress,
  } = {}) {
    requireText(container, "container");
    if (!Number.isSafeInteger(scanGap) || scanGap < 1) {
      throw new TypeError("scanGap must be a whole number of addresses, at least 1.");
    }
    const [referenceKind, referenceValue, coin, path] = describeSearchReference(reference, false);
    return this.#long(
      {
        operation: "searchDecoy",
        container,
        referenceKind,
        reference: referenceValue,
        coin,
        path,
        scanGap,
      },
      { onProgress, passphrase, noPassword: true },
    );
  }

  /**
   * Searches for the one word of a container phrase typed as "?" with the owner's wallet: every
   * candidate is recovered with `password` at the settings given, a full recovery each, at the
   * defaults about one and a half to two minutes in fast mode and four to seven in standard mode,
   * so that the page states the time first: the candidates of searchCandidates() times one
   * recovery in this mode. `reference` is `{ address, coin, path? }`, `{ fingerprint }`,
   * or the original seed phrase's own checks: `{ walletCheck: true }` with its BIP39 passphrase,
   * which takes the built-in check of a 12- to 21-word one and the phrase + passphrase check of a
   * 24-word one made by `mhfe new` (16 bits: a wrong candidate passes it about once in 65,536), or
   * `{ builtInCheck: true }`, which needs nothing and takes the built-in check alone. Two
   * missing words reject with TOO_MANY_MISSING_WORDS, a same-length container with the built-in
   * check with NO_BUILT_IN_CHECK. Progress: `{ stage: "search", candidate, candidates, round,
   * rounds }`. Resolves as searchDecoy().
   */
  async searchWallet({
    container,
    password,
    passwordRepair,
    pim = 0,
    memoryLevel = 0,
    reference,
    passphrase = "",
    onProgress,
  } = {}) {
    requireText(container, "container");
    const [referenceKind, referenceValue, coin, path] = describeSearchReference(reference, true);
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    return this.#long(
      {
        operation: "searchWallet",
        container,
        choice,
        position,
        referenceKind,
        reference: referenceValue,
        coin,
        path,
      },
      { password, pim, memoryLevel, onProgress, passphrase },
    );
  }

  /**
   * Re-encrypts a container with a new password or settings: rounds 1 to 12 recover it with the old
   * ones, 13 to 36 seal it again. Tell every user first: wallets that other passwords open on the
   * old container do not move to the new one, so keep the old container, its passwords and its
   * settings until their funds are moved (nothing is destroyed here). `pim` and `memoryLevel` are
   * the old container's settings; `newPim`, `newMemoryLevel`, `newPasswordRepair` and
   * `repairWordCount` those of the new one, and `onProgress` and `onUnverified` work as for
   * encrypt().
   *
   * `words` is the phrase's word count, or 0 to detect it; a same-length container takes 0 or its
   * own length. With the length detected, `{ builtInCheck: true }` alone is refused before the
   * first round (REFERENCE_REQUIRED), as a 24-word original may pass a short check by chance; an
   * address or the fingerprint is compared with every reading, whatever its length, and the owner
   * confirms the one reading found. Several lengths that pass by accident reject
   * `{ builtInCheck: true }` and the owner with AMBIGUOUS_LENGTH, unless the owner's stated length
   * is one of them: rekey again confirmed by an address or the fingerprint, which compares every
   * reading, or by the owner with the length of the reading to compare stated. A stated length
   * whose built-in check fails while one other length's passes rejects `{ builtInCheck: true }`
   * with LENGTH_DIFFERS, as the check takes precedence: rekey again confirmed by an address, the
   * fingerprint or the owner, whose callback then gets the reading the check found. The owner
   * beside 24 stated words is rejected with LENGTH_DIFFERS too when one 12- to 21-word length
   * passes its check: only an address or the fingerprint tells the two readings apart. A stated
   * 12- to 21-word length whose check fails while no other passes rejects with VERIFIER_MISMATCH,
   * whatever the confirmation.
   *
   * After AMBIGUOUS_LENGTH or LENGTH_DIFFERS, which come once the recovery's rounds are done,
   * `onConfirmAgain` is called, when given, with `{ error, ownerLengths }`: the refusal as an
   * MhfeError, and the lengths at which the owner may compare the phrase with their backup, empty
   * where only an address or the fingerprint confirms it. It returns another confirmation, which
   * is judged on the same recovery without the rounds again: `{ address, coin, path?,
   * passphrase? }`, `{ fingerprint, passphrase? }`, or `{ owner, words }` with `words` one of
   * `ownerLengths` (left out when there is only one); or null, which rejects with the refusal.
   * After AMBIGUOUS_LENGTH the owner states the length of the reading to compare; after
   * LENGTH_DIFFERS it is the stated one, and the owner callback gets the reading the check found.
   * The answer to `walletHasPassphrase` holds for every confirmation. Without `onConfirmAgain`,
   * and after every other refusal, the rekey ends: a page calls rekey() again, which recovers
   * again.
   *
   * `confirmation` is exactly one of `{ builtInCheck: true }`, `{ address, coin, path? }`,
   * `{ fingerprint }` or `{ owner: (check) => boolean | Promise<boolean> }`
   * (readContainer().confirmationFor says which a length needs, "0" for detection). The wallet
   * check, 16 bits, never confirms a phrase to encrypt again. The owner callback receives
   * `{ phrase, words, statedWords?, fingerprintWithoutPassphrase }` to compare with the written
   * backup, `statedWords` only where the built-in check found another length than the one stated,
   * which the page says first; anything but true stops the rekey with NOT_CONFIRMED_BY_OWNER.
   * Resolves as encrypt does, with `walletCheck`, the 16-bit source check of a recovered 24-word
   * reading with the reference's passphrase or none (null for other lengths), which every recovery
   * reports and which never confirms a rekey.
   *
   * `walletHasPassphrase` is the user's answer whether the wallet has a BIP39 passphrase, which
   * the new container's keep list names. An address or a fingerprint compared with a non-empty
   * `passphrase` shows that it has one: there the answer may be left out, and false is refused.
   * Everywhere else it is required (INVALID_REQUEST without it): the built-in check and the owner
   * show nothing, and a reference without a passphrase matches the phrase's wallet without one,
   * which says nothing about funds under a passphrase, so it confirms only a wallet stated to have
   * none: true is refused, as such a wallet is compared with its passphrase. These refusals come
   * before the first round; only the 1 MiB known answer of the Argon2 build runs first.
   * `passphrase` belongs only to an address or a fingerprint: a non-empty one with the built-in
   * check or the owner is a TypeError.
   */
  async rekey({
    container,
    words = 0,
    password,
    passwordRepair,
    pim = 0,
    memoryLevel = 0,
    newPassword,
    newPasswordRepeat,
    newPasswordRepair,
    newPim = 0,
    newMemoryLevel = 0,
    repairWordCount = 0,
    confirmation,
    passphrase = "",
    walletHasPassphrase,
    onProgress,
    onUnverified,
    onConfirmAgain,
  } = {}) {
    requireText(container, "container");
    if (walletHasPassphrase !== undefined) requireWalletPassphrase(walletHasPassphrase);
    requireWordCount(words);
    requireSettings(newPim, newMemoryLevel);
    requireRepairWordCount(repairWordCount);
    requireCallback(onUnverified, "onUnverified");
    requireCallback(onConfirmAgain, "onConfirmAgain");
    const [confirmKind, reference, coin, path, firstOwner] = describeConfirmation(confirmation);
    requirePassphraseFits(confirmKind, passphrase);
    // The owner callback of the confirmation being judged: an answer of onConfirmAgain may give
    // another.
    let owner = firstOwner;
    const confirmAgain = (refusal) =>
      answerConfirmAgain(onConfirmAgain, refusal, (next) => {
        owner = next;
      });
    const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
    const [newChoice, newPosition] = describeChoice(newPasswordRepair, "newPasswordRepair");
    const request = {
      operation: "rekey",
      container,
      words,
      choice,
      position,
      newChoice,
      newPosition,
      newPim,
      newMemoryLevel,
      repairWordCount,
      confirmKind,
      reference,
      coin,
      path,
      walletHasPassphrase,
      confirmsAgain: onConfirmAgain !== undefined,
    };
    const handlers = { unverified: onUnverified, ownerCheck: (check) => owner(check) };
    if (onConfirmAgain !== undefined) handlers.confirmAgain = confirmAgain;
    return this.#long(request, {
      password,
      pim,
      memoryLevel,
      onProgress,
      passphrase,
      newPassword,
      newPasswordRepeat,
      handlers,
    });
  }

  /**
   * Opens a session of hidden wallets on a 24-word container, with the main wallet's BIP39
   * passphrase (`mainPassphrase`, required, empty for a wallet without one). Resolves, once the
   * Argon2 work area is reserved, to a handle:
   *
   * - `open({ password, passwordRepeat, passwordRepair, onProgress })` opens the wallet of a new
   *   password, twelve rounds, and resolves to `{ phrase, words, fingerprintWithoutPassphrase }`.
   *   A password used already (PASSWORD_ALREADY_USED), one whose wallet would pass a check
   *   (HIDDEN_WALLET_PASSES_CHECK) and a password refused before any work reject it, and the
   *   session stays open.
   * - `close()` ends the session: the Rust code overwrites every password and the passphrase in
   *   it, and the worker ends. During an `open` it stops the worker at once instead, which frees
   *   its memory without overwriting it. Resolves once the session has ended.
   *
   * The session holds the long-operation slot until it is closed or cancelled. Nothing is created
   * or stored: the container and each password give the same wallet every time. The page shows no
   * list or count of the wallets opened.
   */
  async openHiddenWallets({ container, pim = 0, memoryLevel = 0, mainPassphrase } = {}) {
    requireText(container, "container");
    if (mainPassphrase === undefined) {
      throw new TypeError("mainPassphrase is required; an empty one means a wallet without one.");
    }
    let pendingOpen = null;
    let nextRequest = null;
    let closing = null;
    let handle = null;
    let ready = null;
    // The worker waits for the page's next request (`nextRequest` is set) between wallets.
    const waitForPage = () =>
      new Promise((resolve) => {
        nextRequest = resolve;
      });
    const sendRequest = (request) => {
      const send = nextRequest;
      nextRequest = null;
      send(request);
    };
    const answerOpen = (settle) => {
      const open = pendingOpen;
      pendingOpen = null;
      settle(open);
      return waitForPage();
    };
    const handlers = {
      ready: () => {
        ready.resolve(handle);
        return waitForPage();
      },
      opened: (wallet) => answerOpen((open) => open?.resolve(wallet)),
      refused: (error) =>
        answerOpen((open) => open?.reject(new MhfeError(error.code, sentence(error.message)))),
      progress: (value) => pendingOpen?.onProgress?.(value),
    };
    let job;
    handle = {
      open: async ({ password, passwordRepeat, passwordRepair, onProgress } = {}) => {
        if (job.ended || closing !== null) {
          throw new MhfeError("SESSION_CLOSED", "The session is closed.");
        }
        if (pendingOpen !== null) throw new MhfeError("BUSY", "A wallet is being opened.");
        requireCallback(onProgress, "onProgress");
        const repeat = requireRepetition(password, passwordRepeat, "password");
        const [choice, position] = describeChoice(passwordRepair, "passwordRepair");
        // Built one secret at a time, so that a refused repetition wipes the password's copy too
        // (AUD-011-SEC001).
        const message = { choice, position };
        try {
          message.password = encodeSecret(password, "password");
          message.passwordRepeat = encodeSecret(repeat, "repeated password");
        } catch (error) {
          wipeSecrets(message);
          throw error;
        }
        return new Promise((resolve, reject) => {
          pendingOpen = { resolve, reject, onProgress };
          sendRequest({ message, transfer: secretBuffers(message) });
        });
      },
      // Every call returns the same promise, which settles once the session has ended.
      close: () => {
        closing ??= closeSession();
        return closing;
      },
    };
    const closeSession = async () => {
      if (nextRequest !== null) {
        // The worker waits: it frees the session, which overwrites its secrets, and ends.
        sendRequest({ message: { close: true }, transfer: [] });
      } else if (!job.ended) {
        // An open is running: its worker stops at once.
        const open = pendingOpen;
        pendingOpen = null;
        job.stop(new MhfeCancelledError());
        open?.reject(new MhfeCancelledError());
      }
      await done.then(
        () => undefined,
        () => undefined,
      );
    };
    const started = new Promise((resolve, reject) => {
      ready = { resolve, reject };
    });
    let done;
    ({ job, done } = await this.#begin(
      { operation: "hiddenWallets", container },
      { pim, memoryLevel, mainPassphrase, handlers, noPassword: true },
    ));
    done.then(undefined, (error) => {
      ready.reject(error);
      pendingOpen?.reject(error);
      pendingOpen = null;
    });
    return started;
  }

  /**
   * The self-test with the two published vectors at their full cost: an encryption of suite 3
   * ("encrypt", rounds 1 to 12 of 24) and a recovery of suite 4 ("recover", 13 to 24). It takes
   * minutes and 2 GiB, so a page starts it only when the person asks; it does not wait for the
   * startup check. Resolves to `{ passed, suite3: { vector, asPublished }, suite4: { vector,
   * asPublished }, firstWrongRound, fault }`. `fault`, null when the test passed, tells where it
   * first left the published path, as `{ kind, round, message }`: "argon2-input" when Argon2id
   * was given an input the published vector does not have, so the fault lies before Argon2id;
   * "argon2-key" when the published input gave another key, so the fault lies in Argon2id; and
   * "after-argon2", round null, when every input and key was as published. `message` is the
   * sentence to show. `firstWrongRound` is that round, 1 to 12 the encryption and 13 to 24 the
   * recovery, or null.
   */
  async selfTest({ onProgress } = {}) {
    return this.#long({ operation: "selfTest" }, { onProgress, noPassword: true }, false);
  }

  /**
   * Stops the running long operation or session: its promise rejects at once with
   * MhfeCancelledError, and its worker is terminated, as soon as it has loaded the WebAssembly if
   * it is still loading it.
   */
  cancel() {
    this.#slot.cancel();
  }

  /**
   * A quick operation: the Rust core only, in a worker of its own, never BUSY. `transfer` lists the
   * buffers of the message's secrets, which the job owns from here on.
   */
  #quick(message, transfer = []) {
    return new WorkerJob([this.#sources.workerSource]).run(
      { module: CORE_MODULE, ...message },
      transfer,
      this.#wasm,
    );
  }

  /** A long operation, which resolves to its result; see #begin. */
  async #long(request, options, gated = true) {
    const { done } = await this.#begin(request, options, gated);
    return done;
  }

  /**
   * Starts a long operation in the slot and resolves to `{ job, done }`, `done` resolving to its
   * result. Everything that is not secret is checked first; then, when `gated`, the startup check
   * is awaited with the slot held; only then are the secrets copied into bytes, and until the
   * worker owns them, every failure wipes the copies.
   */
  async #begin(request, options, gated = true) {
    const { pim = 0, memoryLevel = 0 } = options;
    this.#slot.requireIdle();
    requireSettings(pim, memoryLevel);
    requireCallback(options.onProgress, "onProgress");
    const typedTwice = { ...options };
    if (options.passwordRepeat !== undefined || request.operation === "encrypt") {
      typedTwice.passwordRepeat = requireRepetition(
        options.password,
        options.passwordRepeat,
        "password",
      );
    }
    if (options.newPassword !== undefined || request.operation === "rekey") {
      typedTwice.newPasswordRepeat = requireRepetition(
        options.newPassword,
        options.newPasswordRepeat,
        "new password",
      );
    }
    const start = () => this.#start(request, typedTwice);
    return gated ? this.#slot.after(this.#ready(), start) : start();
  }

  /** Copies the secrets of a checked request and starts its job in the slot; see #begin. */
  #start(
    request,
    {
      phrase,
      password,
      passwordRepeat,
      pim = 0,
      memoryLevel = 0,
      passphrase,
      newPassword,
      newPasswordRepeat,
      mainPassphrase,
      onProgress,
      handlers = {},
      noPassword = false,
    },
  ) {
    let message = { module: CORE_MODULE, ...request, pim, memoryLevel };
    try {
      // An empty phrase is the core's to refuse (INVALID_PHRASE), as any other invalid one.
      if (phrase !== undefined) message.phrase = encodeSecret(phrase, "phrase");
      if (!noPassword) message.password = encodeSecret(password, "password");
      if (passwordRepeat !== undefined) {
        message.passwordRepeat = encodeSecret(passwordRepeat, "repeated password");
      }
      if (passphrase !== undefined) message.passphrase = encodeSecret(passphrase, "passphrase");
      if (newPassword !== undefined) {
        message.newPassword = encodeSecret(newPassword, "new password");
        message.newPasswordRepeat = encodeSecret(newPasswordRepeat, "repeated new password");
      }
      if (mainPassphrase !== undefined) {
        message.mainPassphrase = encodeSecret(mainPassphrase, "main passphrase");
      }
      message.argon2Script = this.#argon2Script(this.mode() === FAST_MODE);
      const job = this.#slot.job([this.#argon2Source(), this.#sources.workerSource], {
        progress: onProgress,
        ...handlers,
      });
      return { job, done: job.run(message, secretBuffers(message), this.#wasm) };
    } catch (error) {
      wipeSecrets(message);
      message = null;
      throw error;
    }
  }

  /** The text of this mode's Argon2 build: threaded on a cross-origin isolated page. */
  #argon2Source() {
    return this.mode() === FAST_MODE
      ? this.#sources.argon2Threaded
      : this.#sources.argon2SingleThreaded;
  }

  /** The threaded build's lane workers run this same script and may only come from a Blob. */
  #argon2Script(threaded) {
    return threaded ? new Blob([this.#sources.argon2Threaded], { type: "text/javascript" }) : null;
  }

  /** Resolves once the startup check has passed; see startupCheck(). */
  #ready() {
    return this.#check.require(() => this.startupCheck({ argon2: false }));
  }

  /**
   * The core's set of known answers at `tier` in a worker of its own, through this mode's Argon2
   * build when `argon2`. In fast mode the single-threaded build follows the threaded one, so that
   * the check falls back to it, and says so, when the threaded build does not start
   * (web/core-worker.js); an operation still uses the threaded build and gets its own error. The
   * core's limits must be this file's, which it checks before any secret is copied: a difference
   * means parts of different builds (PACKAGE_MISMATCH).
   */
  async #coreCheck(tier, skip, argon2, handlers) {
    const scripts = [this.#sources.workerSource];
    if (argon2 && this.mode() === FAST_MODE) {
      scripts.unshift(this.#sources.argon2Threaded, this.#sources.argon2SingleThreaded);
    } else if (argon2) {
      scripts.unshift(this.#sources.argon2SingleThreaded);
    }
    const { parameters, ...report } = await new WorkerJob(scripts, handlers).run(
      {
        module: CORE_MODULE,
        operation: "selfCheck",
        tier,
        skip,
        argon2,
        argon2Script: this.#argon2Script(argon2 && this.mode() === FAST_MODE),
      },
      [],
      this.#wasm,
    );
    requireSameLimits(parameters);
    return report;
  }

  /**
   * One Argon2 build alone at 64 and 256 MiB, in a worker of its own. Its known answer at 1 MiB is
   * left out: the core's check gave it for this mode's build, and these larger ones cover it.
   */
  #argon2Check(threaded, handlers) {
    const source = threaded ? this.#sources.argon2Threaded : this.#sources.argon2SingleThreaded;
    return new WorkerJob([source, this.#sources.workerSource], handlers).run(
      {
        module: CORE_MODULE,
        operation: "selfCheckArgon2",
        tier: "full",
        skip: [ARGON2_PART],
        argon2Script: this.#argon2Script(threaded),
      },
      [],
      this.#wasm,
    );
  }
}

/**
 * The core's fixed values must be the limits this file checks before any secret is copied
 * (scripts/verify-browser-package.mjs compares them too); otherwise the files come from different
 * builds.
 */
function requireSameLimits(parameters) {
  const same =
    parameters.maxPim === MAX_PIM &&
    parameters.maxMemoryLevel === MAX_MEMORY_LEVEL &&
    parameters.highestBrowserMemoryLevel === HIGHEST_BROWSER_MEMORY_LEVEL &&
    parameters.wordCounts.join() === WORD_COUNTS.join() &&
    parameters.builtInCheckWordCounts.join() === BUILT_IN_CHECK_WORD_COUNTS.join() &&
    [0, ...parameters.repairWordCounts].join() === REPAIR_WORD_COUNTS.join() &&
    parameters.decoyScanGap === DECOY_SCAN_GAP;
  if (!same) {
    throw packageMismatch("The files core/client.js and runtime/mhfe.wasm have different limits");
  }
}

/** An answer given whether the wallet has a BIP39 passphrase: true or false, nothing else. */
function requireWalletPassphrase(walletHasPassphrase) {
  if (typeof walletHasPassphrase !== "boolean") {
    throw new TypeError(
      "walletHasPassphrase must be true or false: whether the wallet has a BIP39 passphrase.",
    );
  }
}

/**
 * A new password typed twice: both a string or a Uint8Array, a TypeError otherwise; `name` names
 * the password. The two are compared by the library, after the password's own rules
 * (check_word::check_typed_twice), as the command-line tool compares them, so that both give the
 * same refusal. A repetition left out is an empty one, which differs.
 */
function requireRepetition(password, passwordRepeat, name) {
  requireSecret(password, name);
  return secretOrEmpty(passwordRepeat, `repeated ${name}`);
}

/** The PIM and memory level, including the browser's memory limit. */
function requireSettings(pim, memoryLevel) {
  requireSetting(pim, MAX_PIM, "INVALID_PIM", "pim");
  requireSetting(memoryLevel, MAX_MEMORY_LEVEL, "INVALID_MEMORY_LEVEL", "memoryLevel");
  // The library's refusal (WorkFactor::require_level), with its code and message, before any
  // secret reaches a worker; scripts/verify-browser-package.mjs keeps the two in step.
  if (memoryLevel > HIGHEST_BROWSER_MEMORY_LEVEL) {
    throw new MhfeError(
      "MEMORY_LEVEL_NOT_SUPPORTED_HERE",
      `Memory level ${memoryLevel} needs more memory than this environment can use; the highest ` +
        `supported level here is ${HIGHEST_BROWSER_MEMORY_LEVEL}. Use the command-line tool on a ` +
        "64-bit system for higher levels",
    );
  }
}

function requireSetting(value, highest, code, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > highest) {
    throw new MhfeError(code, `${name} must be a whole number from 0 to ${highest}.`);
  }
}

/** The length of an original seed phrase: 0 to detect it, or a word count. */
function requireWordCount(words) {
  if (words !== 0 && !WORD_COUNTS.includes(words)) {
    throw new MhfeError(
      "INVALID_WORD_COUNT",
      `words must be 0 (detect) or ${countsText(WORD_COUNTS)}.`,
    );
  }
}

function requireRepairWordCount(count) {
  if (!REPAIR_WORD_COUNTS.includes(count)) {
    throw new MhfeError(
      "INVALID_REPAIR_WORDS",
      `repairWordCount must be ${countsText(REPAIR_WORD_COUNTS)}.`,
    );
  }
}

/**
 * The reference of a search for missing words: an address or a fingerprint, and with the owner's
 * wallet (`ofWallet`) also `{ walletCheck: true }` or `{ builtInCheck: true }`.
 */
function describeSearchReference(reference, ofWallet) {
  const isObject = reference !== null && typeof reference === "object";
  if (ofWallet && isObject && reference.builtInCheck !== undefined) {
    if (reference.builtInCheck !== true || Object.keys(reference).length !== 1) {
      throw new TypeError("reference.builtInCheck must be true, alone.");
    }
    return ["builtInCheck", "", "", ""];
  }
  if (isObject && (reference.words !== undefined || (!ofWallet && reference.walletCheck))) {
    throw new TypeError(
      ofWallet
        ? "reference must be { address, coin, path? }, { fingerprint }, { walletCheck: true } or { builtInCheck: true }."
        : "reference must be { address, coin, path? } or { fingerprint }.",
    );
  }
  return describeReference(reference);
}

/**
 * The one reference of a check. Exactly one of address, fingerprint, words and walletCheck must
 * be given: with several, the check would silently use only one of them.
 */
function describeReference(reference) {
  const isObject = reference !== null && typeof reference === "object";
  const given = (kind) => Object.hasOwn(reference, kind) && reference[kind] !== undefined;
  const kinds = isObject ? REFERENCE_KINDS.filter(given) : [];
  if (kinds.length !== 1) {
    throw new TypeError(
      "reference must be exactly one of { address, coin, path? }, { fingerprint }, { words } or { walletCheck: true }.",
    );
  }
  for (const key of ["coin", "path"]) {
    if (reference[key] !== undefined && kinds[0] !== "address") {
      throw new TypeError(`reference.${key} belongs only to an address reference.`);
    }
  }
  switch (kinds[0]) {
    case "address":
      requireText(reference.address, "reference.address");
      if (reference.path !== undefined) requireText(reference.path, "reference.path");
      // No coin is the default, so that a page for one coin names no other.
      if (reference.coin === undefined) {
        throw new TypeError(
          "reference.coin must name the coin of the address, an id of MhfeWallet.parameters().coins.",
        );
      }
      requireText(reference.coin, "reference.coin");
      return ["address", reference.address, reference.coin, reference.path ?? ""];
    case "fingerprint":
      requireText(reference.fingerprint, "reference.fingerprint");
      return ["fingerprint", reference.fingerprint, "", ""];
    case "walletCheck":
      if (reference.walletCheck !== true)
        throw new TypeError("reference.walletCheck must be true.");
      return ["walletCheck", "", "", ""];
    default:
      // 0 detects the length (the library's detection).
      requireWordCount(reference.words);
      // The library's refusal (rehearsal::require_built_in_check_length), with its code and
      // message, before any secret reaches a worker; scripts/verify-browser-package.mjs keeps the
      // two in step.
      if (reference.words !== 0 && !BUILT_IN_CHECK_WORD_COUNTS.includes(reference.words)) {
        throw new MhfeError(
          "INVALID_WORD_COUNT",
          `A ${reference.words}-word original seed phrase has no built-in check (only 12, 15, 18 ` +
            "or 21 words have one); compare it with a receiving address or the master key " +
            "fingerprint of the wallet instead",
        );
      }
      return ["words", String(reference.words), "", ""];
  }
}

/**
 * The page's answer when detection found no length (check's onNoLength): another reference with
 * its passphrase, sent to the worker as a secret, or null. The answer is checked as a reference
 * is; detection again is refused.
 */
async function answerNoLength(onNoLength) {
  const answer = await onNoLength();
  if (answer === null || answer === undefined) return null;
  const { passphrase = "", ...reference } = answer;
  if (reference.words === 0) {
    throw new TypeError("onNoLength gives a length or a wallet reference, not detection again.");
  }
  const [referenceKind, value, coin, path] = describeReference(reference);
  const message = {
    referenceKind,
    reference: value,
    coin,
    path,
    passphrase: encodeSecret(passphrase, "passphrase"),
  };
  return { message, transfer: secretBuffers(message) };
}

/**
 * The page's answer when a rekey's confirmation is refused and another may follow on the same
 * recovery (rekey()'s onConfirmAgain): another confirmation, sent to the worker with its
 * passphrase as a secret, or null. The answer is checked as rekey() checks its confirmation; the
 * owner states `words`, one of `ownerLengths`. `useOwner` takes the callback of an owner's answer.
 */
async function answerConfirmAgain(onConfirmAgain, { code, message, ownerLengths }, useOwner) {
  const answer = await onConfirmAgain({
    error: new MhfeError(code, sentence(message)),
    ownerLengths: [...ownerLengths],
  });
  if (answer === null || answer === undefined) return null;
  const { passphrase = "", words, ...confirmation } = answer;
  const [confirmKind, reference, coin, path, owner] = describeConfirmation(confirmation);
  requirePassphraseFits(confirmKind, passphrase);
  let stated = 0;
  if (owner !== undefined) {
    stated = words ?? (ownerLengths.length === 1 ? ownerLengths[0] : undefined);
    // The core refuses any other length too; this names the page's mistake at once.
    if (!ownerLengths.includes(stated)) {
      throw new TypeError(
        ownerLengths.length === 0
          ? "the owner cannot confirm this phrase: give an address or the fingerprint."
          : `words must name the reading the owner compares: ${countsText(ownerLengths)}.`,
      );
    }
    useOwner(owner);
  } else if (words !== undefined) {
    throw new TypeError("words belongs only to the owner's confirmation.");
  }
  const next = {
    confirmKind,
    reference,
    coin,
    path,
    words: stated,
    passphrase: encodeSecret(passphrase, "passphrase"),
  };
  return { message: next, transfer: secretBuffers(next) };
}

/**
 * A passphrase belongs only to an address or a fingerprint: a non-empty one with the built-in
 * check or the owner is a TypeError (the core refuses it too).
 */
function requirePassphraseFits(confirmKind, passphrase) {
  // Only a string or bytes has a length here; any other type is refused when it is encoded.
  const givenPassphrase =
    (typeof passphrase === "string" || passphrase instanceof Uint8Array) && passphrase.length > 0;
  if (givenPassphrase && (confirmKind === "builtInCheck" || confirmKind === "owner")) {
    throw new TypeError("passphrase belongs only to an address or fingerprint confirmation.");
  }
}

/**
 * The confirmation of a rekey: the built-in check, the owner, or an address or fingerprint of the
 * wallet. A key whose value is undefined counts as not given, as for a check's reference.
 */
function describeConfirmation(confirmation) {
  if (confirmation === null || typeof confirmation !== "object") {
    throw new TypeError(
      "confirmation must be one of { builtInCheck: true }, { address, coin, path? }, " +
        "{ fingerprint } or { owner }.",
    );
  }
  const given = Object.keys(confirmation).filter((key) => confirmation[key] !== undefined);
  if (given.includes("builtInCheck")) {
    if (confirmation.builtInCheck !== true || given.length !== 1) {
      throw new TypeError("confirmation must be exactly one kind; builtInCheck must be true.");
    }
    return ["builtInCheck", "", "", "", undefined];
  }
  if (given.includes("owner")) {
    if (typeof confirmation.owner !== "function" || given.length !== 1) {
      throw new TypeError("confirmation must be exactly one kind; owner must be a function.");
    }
    // Whatever the page's callback throws, even an MhfeError of another call, ends the rekey
    // with CALLBACK_FAILED and the page's error as the cause.
    const owner = async (check) => {
      try {
        return (await confirmation.owner(check)) === true;
      } catch (cause) {
        throw new MhfeError("CALLBACK_FAILED", "The page's owner callback failed.", { cause });
      }
    };
    return ["owner", "", "", "", owner];
  }
  if (given.includes("words")) {
    throw new TypeError("a rekey is confirmed by { builtInCheck: true }, not by a word count.");
  }
  if (given.includes("walletCheck")) {
    throw new TypeError(
      "a rekey is confirmed by an address or a fingerprint, not by the wallet check.",
    );
  }
  if (!given.includes("address") && !given.includes("fingerprint")) {
    throw new TypeError(
      "confirmation must be one of { builtInCheck: true }, { address, coin, path? }, " +
        "{ fingerprint } or { owner }.",
    );
  }
  const [kind, reference, coin, path] = describeReference(confirmation);
  return [kind, reference, coin, path, undefined];
}
