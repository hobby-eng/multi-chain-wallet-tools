/** Four Argon2 lanes in parallel; needs a cross-origin isolated page, such as `mhfe serve` gives. */
export const FAST_MODE: "fast";
/** One lane after another; works everywhere, including a page opened as a file. */
export const STANDARD_MODE: "standard";

export type MhfeMode = typeof FAST_MODE | typeof STANDARD_MODE;
export type WordCount = 12 | 15 | 18 | 21 | 24;

export interface MhfeSources {
  /** Text of mhfe-worker.js. */
  workerSource: string;
  /** Text of argon2-mt.js, the threaded Argon2 build. */
  argon2Threaded: string;
  /** Text of argon2-st.js, the single-threaded Argon2 build. */
  argon2SingleThreaded: string;
  /** mhfe_core_bg.wasm as bytes or as a compiled module. */
  coreWasm: Uint8Array | WebAssembly.Module;
}

export interface MhfeProgress {
  /** The round that starts, from 1 to `rounds`. */
  round: number;
  /** 24 for an encryption, which decrypts its result to check it, and 12 otherwise. */
  rounds: 12 | 24;
}

export interface MhfeSettings {
  /**
   * Password: ordinary single-line text or its UTF-8 bytes. Unpaired surrogates, control characters
   * (such as NUL, TAB and line breaks), U+2028 and U+2029 are refused.
   */
  password: string | Uint8Array;
  /** Pass multiplier, 0 to 1023. Default 0. */
  pim?: number;
  /** Memory level; a browser supports only 0 (2 GiB). Default 0. */
  memoryLevel?: number;
  /**
   * Called as each round starts. If it throws, or is async and its promise rejects while the
   * operation runs, the operation stops and rejects with CALLBACK_FAILED. It is not awaited.
   */
  onProgress?: (progress: MhfeProgress) => void | Promise<void>;
}

export interface MhfeCandidate {
  words: WordCount;
  /**
   * True when a 12- to 21-word phrase from a 24-word container passed its built-in check. Never
   * true for 24 words or for a same-length container, which have no check.
   */
  verified: boolean;
  phrase: string;
  /** The suite of the container, which its word count selected. */
  suiteId: string;
}

export interface MhfeRecovery {
  /** "ambiguous" when several lengths passed their check: show every candidate. */
  kind: "phrase" | "ambiguous";
  candidates: MhfeCandidate[];
}

/**
 * The coin of an address reference. "ethereum" covers every EVM network, such as BNB Smart Chain,
 * Polygon, Avalanche C-Chain, Arbitrum, Optimism and Base.
 */
export type MhfeCoin =
  | "bitcoin"
  | "ethereum"
  | "xrp"
  | "tron"
  | "zcash"
  | "dogecoin"
  | "bitcoin-cash"
  | "litecoin"
  | "ethereum-classic"
  | "cosmos"
  | "injective"
  | "dash";

/** Exactly one kind of reference; an object with several is refused with a TypeError. */
export type MhfeReference =
  /**
   * A single-key receiving address of the wallet, the strong check. `coin` defaults to "bitcoin";
   * the address is searched on that coin's standard paths, or only at `path`.
   */
  | { address: string; coin?: MhfeCoin; path?: string; fingerprint?: never; words?: never }
  /** The BIP32 master key fingerprint, eight hex digits: quick but weaker. */
  | { fingerprint: string; address?: never; coin?: never; path?: never; words?: never }
  /**
   * The built-in check of a 12- to 21-word original in a 24-word container: confirms the
   * password, not the wallet. A same-length container has none (NO_BUILT_IN_CHECK).
   */
  | { words: 12 | 15 | 18 | 21; address?: never; coin?: never; path?: never; fingerprint?: never };

export class MhfeError extends Error {
  readonly code: string;
  /** For CALLBACK_FAILED, the error that the page's callback threw or its promise rejected with. */
  readonly cause?: unknown;
  /** `message` is an English sentence that a page can show as it is. */
  constructor(code: string, message: string, options?: { cause?: unknown });
}

export class MhfeCancelledError extends MhfeError {
  constructor();
}

/**
 * The five operations (encrypt, decrypt, check, readPhrase, readContainer) return a promise and
 * report every error by rejecting it, the checks of their arguments included: none throws when it
 * is called. mode(), maxSupportedMemLevel() and cancel() are synchronous. Only the constructor
 * throws, for missing parts.
 */
export class MhfeClient {
  constructor(sources: MhfeSources);
  mode(): MhfeMode;
  maxSupportedMemLevel(): 0;
  /**
   * Needs the password twice; a difference is refused with the code PASSWORDS_DIFFER. Resolves
   * only after the container has been decrypted again and checked; a failed check rejects with
   * VERIFICATION_FAILED. `onUnverified` receives the container before the check, for showing it
   * marked as not yet verified; the page must then report how the check ended. If `onUnverified`
   * fails like `onProgress` can, the operation stops and rejects with CALLBACK_FAILED.
   */
  encrypt(
    options: MhfeSettings & {
      phrase: string;
      passwordRepeat: string | Uint8Array;
      /**
       * A container as long as the 12- to 21-word phrase instead of 24 words. Set it only on the
       * user's own choice, after showing its consequences: nothing detects a wrong password, the
       * container shows the phrase's length, and a word copied wrongly passes the shorter
       * checksum more often. Default false.
       */
      sameLength?: boolean;
      onUnverified?: (result: { container: string }) => void | Promise<void>;
    },
  ): Promise<{ container: string; suiteId: string }>;
  /**
   * The container's word count selects the suite. `words` chooses the length of a 24-word
   * container's original; a same-length container takes only its own length.
   */
  decrypt(
    options: MhfeSettings & { container: string; words?: 0 | WordCount },
  ): Promise<MhfeRecovery>;
  check(
    options: MhfeSettings & {
      container: string;
      reference: MhfeReference;
      passphrase?: string | Uint8Array;
    },
  ): Promise<{
    matches: boolean;
    /** Where a matched address was found, such as "m/84'/0'/0'/0/5"; null otherwise. */
    path: string | null;
  }>;
  /**
   * The phrase with every word written out, for showing back to the user.
   *
   * `otherLengths` is almost always empty. When it is not, automatic detection would not give this
   * phrase on its own after recovery: tell the user to note the word count and choose it then.
   */
  readPhrase(
    phrase: string,
  ): Promise<{ phrase: string; words: WordCount; otherLengths: WordCount[] }>;
  /** The container with every word written out, for showing back to the user. */
  readContainer(container: string): Promise<{ container: string; words: WordCount }>;
  /** Stops the running operation at once; its promise rejects with MhfeCancelledError. */
  cancel(): void;
}
