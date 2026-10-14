/**
 * Every code an MhfeError carries: those of the Rust library (docs/API.md) and those of the
 * browser classes.
 */
export type MhfeErrorCode =
  /** The original phrase is not a valid English BIP39 phrase. */
  | "INVALID_PHRASE"
  /** The container is not a valid English BIP39 phrase, or not one of the selected suite. */
  | "INVALID_CONTAINER"
  /**
   * A length other than 12, 15, 18, 21 or 24, or a length without the check asked for: a built-in
   * check of a 24-word phrase, or a wallet check of a phrase that is not 24 words.
   */
  | "INVALID_WORD_COUNT"
  /** A same-length container was asked for a 24-word original. */
  | "SAME_LENGTH_NEEDS_SHORT_PHRASE"
  /** The chosen length does not fit the container's word count. */
  | "LENGTH_CHOICE_NOT_APPLICABLE"
  /** The built-in check was asked for a same-length container. */
  | "NO_BUILT_IN_CHECK"
  /** The wallet check was asked for a same-length container. */
  | "NO_WALLET_CHECK"
  /** Hidden wallets were asked of a same-length container, which opens none. */
  | "NO_HIDDEN_WALLETS"
  /**
   * The built-in check alone was given where it does not confirm a recovery to encrypt again (a
   * 24-word original, a same-length container or a detected length): give an address, the
   * fingerprint or the owner.
   */
  | "REFERENCE_REQUIRED"
  /** The phrase recovered to encrypt again does not match the address or fingerprint. */
  | "REFERENCE_MISMATCH"
  /**
   * A hidden wallet's phrase passes a check: the built-in check of a shorter phrase, or by chance
   * (once in 65,536) the 16-bit wallet check.
   */
  | "HIDDEN_WALLET_PASSES_CHECK"
  /** Repair words that are not 2, 4, 6 or 8 English BIP39 words. */
  | "INVALID_REPAIR_WORDS"
  /** No repair within the repair words' bound passes the BIP39 checksum. */
  | "REPAIR_NOT_POSSIBLE"
  | "TOO_MANY_MISSING_WORDS"
  /**
   * Several lengths pass the built-in check, by rare chance: an address or the fingerprint tells
   * the readings apart, and a rekey needs one of them, or the owner with one of those lengths
   * stated.
   */
  | "AMBIGUOUS_LENGTH"
  /**
   * A rekey's built-in check finds another length than the one stated, which takes precedence:
   * rekey again confirmed by a receiving address or the master key fingerprint, or, for a stated
   * 12- to 21-word length, by the owner. With 24 words stated beside a shorter length that passes,
   * only an address or the fingerprint confirms one.
   */
  | "LENGTH_DIFFERS"
  /** PIM outside 0 to 1023. */
  | "INVALID_PIM"
  /** Memory level outside 0 to 21. */
  | "INVALID_MEMORY_LEVEL"
  /** The password is empty. */
  | "EMPTY_PASSWORD"
  /** More than 1024 bytes after normalization. */
  | "PASSWORD_TOO_LONG"
  /** The password bytes are not UTF-8. */
  | "INVALID_PASSWORD_UTF8"
  /** The password has a control character, U+2028 or U+2029. */
  | "CONTROL_CHARACTER_IN_PASSWORD"
  /** The password has a code point unassigned in Unicode 17.0.0. */
  | "UNASSIGNED_CHARACTER"
  /** No built-in check passes where a short length was stated or needed. */
  | "VERIFIER_MISMATCH"
  /** The container would equal the original. */
  | "FIXED_POINT"
  /** The new container did not decrypt to the original; discarded. */
  | "VERIFICATION_FAILED"
  /**
   * A part of the self-check gave another answer than its known one: the class stays closed for
   * good, and the error's `report` names the part. Also an Argon2 build that does not give its
   * known answer before or after an operation's rounds, whose result is then dropped.
   */
  | "SELF_CHECK_FAILED"
  /**
   * Files of different builds of the package: a class, runtime.js, worker.js, mhfe.wasm and the
   * Argon2 builds must come from one. Also a message of the worker that the page does not know or
   * cannot read, which ends the operation and stops the worker. Not kept: the next call checks
   * again.
   */
  | "PACKAGE_MISMATCH"
  /** cancel() stopped the operation (MhfeCancelledError); a failing callback is CALLBACK_FAILED. */
  | "CANCELLED"
  /** The check's address cannot be used. */
  | "INVALID_ADDRESS"
  /** The check's path is malformed. */
  | "INVALID_DERIVATION_PATH"
  /** The fingerprint is not eight hexadecimal digits. */
  | "INVALID_FINGERPRINT"
  /** Less free memory than the level needs, also within a cgroup. */
  | "NOT_ENOUGH_MEMORY"
  /** The operating system refused the memory. */
  | "MEMORY_ALLOCATION_FAILED"
  /** The build cannot address that much memory (browser: > 0). */
  | "MEMORY_LEVEL_NOT_SUPPORTED_HERE"
  /** The Argon2 code reported an error. */
  | "ARGON2_FAILED"
  /** The BIP39 passphrase bytes are not UTF-8. */
  | "INVALID_PASSPHRASE"
  /** A choice the API does not know, or a step out of its order. */
  | "INVALID_REQUEST"
  /** An address's coin is not one the check knows. */
  | "INVALID_COIN"
  /** A generated password of more words or characters than allowed, or none. */
  | "INVALID_PASSWORD_SIZE"
  /** Dice digits for a word are not five digits from 1 to 6. */
  | "INVALID_DICE_ROLLS"
  /** A check word choice the review did not offer. */
  | "PASSWORD_REPAIR_NOT_OFFERED"
  /** A new password and its repetition differ. */
  | "PASSWORDS_DIFFER"
  /** The wallet check was asked for without a BIP39 passphrase. */
  | "WALLET_CHECK_NEEDS_PASSPHRASE"
  /** The random source failed or gave bytes that cannot be random. */
  | "RANDOM_FAILED"
  /** A hidden wallet's password was used already in this session. */
  | "PASSWORD_ALREADY_USED"
  /** A rekey that would give the old container again. */
  | "NEW_PASSWORD_SAME_AS_OLD"
  /** The owner said the recovered phrase is not theirs. */
  | "NOT_CONFIRMED_BY_OWNER"
  /** Anything else. */
  | "INTERNAL_ERROR"
  /**
   * A secret given as a string, such as a password, a passphrase or a phrase, has an unpaired
   * surrogate.
   */
  | "INVALID_PASSWORD_TEXT"
  /** A new phrase's passphrase and its repetition differ. */
  | "PASSPHRASES_DIFFER"
  /** A chosen word or a word never to use that cannot be used, or more than one of either. */
  | "INVALID_WORD_WISH"
  /** Another long operation runs, a phrase is being drawn, or a hidden wallet is being opened. */
  | "BUSY"
  /** A session of hidden wallets was used after it closed. */
  | "SESSION_CLOSED"
  /** The worker did not start within a minute, or stopped unexpectedly. */
  | "WORKER_FAILED"
  /** A callback of the page threw or rejected; its error is the `cause`. */
  | "CALLBACK_FAILED";

/** The errors every module class of the mhfe browser package rejects with. */
export class MhfeError extends Error {
  readonly code: MhfeErrorCode;
  /** For CALLBACK_FAILED, the error that the page's callback threw or its promise rejected with. */
  readonly cause?: unknown;
  /** For SELF_CHECK_FAILED from a class whose self-check failed: its report, to show. */
  readonly report?: MhfeSelfCheckReport;
  /** `message` is an English sentence that a page can show as it is. */
  constructor(
    code: MhfeErrorCode,
    message: string,
    options?: { cause?: unknown; report?: MhfeSelfCheckReport },
  );
}

/**
 * The build of the package's files: the first 16 hex digits of the SHA-256 of a list of the
 * SHA-256 of every file a page loads (mhfe.wasm, runtime.js, worker.js, each class file and both
 * Argon2 builds) before any was stamped, the same in modules.json, each of these files and the
 * WebAssembly's custom section "mhfe-build". Two builds that differ in any of these files differ
 * in it, so that their parts are never used together (PACKAGE_MISMATCH).
 */
export const BUILD_ID: string;

/** "startup": the quick check before a class's first operation; "full": the self-test's. */
export type MhfeSelfCheckTier = "startup" | "full";

/**
 * "passed": every case gave its known answer. "warning": it works, with a limit the detail names,
 * such as the single-threaded Argon2 build checked because the threaded one did not start.
 * "notAvailable": it cannot be checked here, for the reason given, such as an Argon2 build that
 * did not start. "notRun": not checked in this run, for the reason given. "failed": do not use the
 * program on this computer. A startup report with a "warning" or a "notAvailable" part is not
 * kept: the next call checks again.
 */
export type MhfeComponentOutcome = "passed" | "warning" | "notAvailable" | "notRun" | "failed";

/** One part of a self-check. */
export interface MhfeComponentResult {
  /** A stable identifier, such as "repair-words". */
  id: string;
  /** The name a person reads, such as "Repair words (MHFE-REPAIR-1)". It names no coin. */
  label: string;
  outcome: MhfeComponentOutcome;
  /**
   * For any outcome but "passed": the reason, or the case that differed by its place, such as
   * "card 2 of 7 gives other words". Never a secret, a coin or a vector's text.
   */
  detail?: string;
}

/** The report of a class's startupCheck() or fullCheck(). */
export interface MhfeSelfCheckReport {
  /** Whether no part failed; warnings and parts not available or not run do not fail it. */
  passed: boolean;
  tier: MhfeSelfCheckTier;
  /** The package's release version, from the WebAssembly; null when no worker could run. */
  version: string | null;
  /** BUILD_ID of the files that ran. */
  buildId: string;
  /** The page's own parts first, then the class's, in their order. */
  components: MhfeComponentResult[];
}

/** A part of a self-check as it starts (`running: true`) and as it ends, with its outcome. */
export type MhfeSelfCheckProgress =
  { id: string; label: string; running: true } | (MhfeComponentResult & { running: false });

export class MhfeCancelledError extends MhfeError {
  constructor();
}

/**
 * A secret as text or as its UTF-8 bytes; a caller's own array is copied, never emptied. One that
 * a method lets the caller leave out is empty only when left out: null is a TypeError.
 */
export type MhfeSecret = string | Uint8Array;

/** The hint below a line of words being typed: see MhfeWallet.wordHints(). */
export interface MhfeWordHint {
  /** "count" after one letter of the last word, "words" from two, "noWord" when none begins so. */
  hint: "nothing" | "count" | "words" | "noWord";
  /** How many words of the list begin with the letters typed. */
  count: number;
  /** For "words": those words, in list order. */
  words: string[];
  /** What Tab adds: the letters all those words share next, and a space when one word is left. */
  completion: { letters: string; wordEnds: boolean };
}

/**
 * The choice made after a check word review (MhfePasswords.review): the password as typed (the
 * default), its written form, or the repair at a word, from 1.
 */
export type MhfePasswordRepair = "asTyped" | "corrected" | { repair: number };

/** The package files every module class takes. */
export interface MhfePackageParts {
  /** Text of runtime/worker.js. */
  workerSource: string;
  /**
   * runtime/mhfe.wasm as bytes or as a compiled module. A page that uses several module
   * classes compiles it once, with WebAssembly.compile, and passes the module to each.
   */
  wasm: Uint8Array | WebAssembly.Module;
}

/**
 * What MhfeRepair, MhfePasswords and MhfeWallet have in common. Every method returns a promise and
 * reports every error by rejecting it.
 */
export class MhfeModuleClass<Parameters> {
  /**
   * The quick self-check, made once per page and awaited by every other method of the class but
   * parameters(), fullCheck() and cancel() before its first call: known answers of each part the
   * class computes, each with a case it must refuse. A failed part closes the class for good: every
   * such method then rejects with SELF_CHECK_FAILED, the report attached. A page awaits it before
   * it enables any field and shows the report on failure.
   */
  startupCheck(): Promise<MhfeSelfCheckReport>;
  /** The full self-check, run anew each time, in seconds; a failed part closes the class too. */
  fullCheck(options?: {
    onProgress?: (progress: MhfeSelfCheckProgress) => void | Promise<void>;
  }): Promise<MhfeSelfCheckReport>;
  /** The module's fixed values. */
  parameters(): Promise<Parameters>;
}

/** The parts the module classes share; a page uses the classes, not these. */
export class CompiledModule {
  constructor(wasm: Uint8Array | WebAssembly.Module, name: string);
  readonly source: Uint8Array | WebAssembly.Module;
  get(): Promise<WebAssembly.Module>;
}

/** The self-check of one class on its page; the classes use it, a page calls theirs. */
export class PackageCheck {
  constructor(options: {
    wasm: CompiledModule;
    classFile: string;
    classBuildId: string;
    needs?: ("random" | "threads")[];
    secrets: boolean;
    identityOf?: (id: string) => unknown;
  });
}
