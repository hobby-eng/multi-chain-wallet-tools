/** Four Argon2 lanes in parallel; needs a cross-origin isolated page, such as `mhfe serve` gives. */
export const FAST_MODE: 'fast';
/** One lane after another; works everywhere, including a page opened as a file. */
export const STANDARD_MODE: 'standard';

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
  onProgress?: (progress: MhfeProgress) => void;
}

export interface MhfeCandidate {
  words: WordCount;
  /** True when a 12- to 21-word phrase passed its built-in check. Never true for 24 words. */
  verified: boolean;
  phrase: string;
}

export interface MhfeRecovery {
  /** "ambiguous" when several lengths passed their check: show every candidate. */
  kind: 'phrase' | 'ambiguous';
  candidates: MhfeCandidate[];
}

/** Exactly one kind of reference; an object with several is refused with a TypeError. */
export type MhfeReference =
  /** A receiving address of the wallet: the strong check. */
  | { address: string; path?: string; fingerprint?: never; words?: never }
  /** The BIP32 master key fingerprint, eight hex digits: quick but weaker. */
  | { fingerprint: string; address?: never; path?: never; words?: never }
  /** The built-in check of a 12- to 21-word original: confirms the password, not the wallet. */
  | { words: 12 | 15 | 18 | 21; address?: never; path?: never; fingerprint?: never };

export class MhfeError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export class MhfeCancelledError extends MhfeError {
  constructor();
}

export class MhfeClient {
  constructor(sources: MhfeSources);
  mode(): MhfeMode;
  maxSupportedMemLevel(): 0;
  /**
   * Needs the password twice; a difference is refused with the code PASSWORDS_DIFFER. Resolves
   * only after the container has been decrypted again and checked; a failed check rejects with
   * VERIFICATION_FAILED. `onUnverified` receives the container before the check, for showing it
   * marked as not yet verified; the page must then report how the check ended.
   */
  encrypt(
    options: MhfeSettings & {
      phrase: string;
      passwordRepeat: string | Uint8Array;
      onUnverified?: (result: { container: string }) => void;
    },
  ): Promise<{ container: string }>;
  decrypt(options: MhfeSettings & { container: string; words?: 0 | WordCount }): Promise<MhfeRecovery>;
  check(
    options: MhfeSettings & { container: string; reference: MhfeReference; passphrase?: string | Uint8Array },
  ): Promise<{ matches: boolean }>;
  /** The phrase with every word written out, for showing back to the user. */
  /**
   * `otherLengths` is almost always empty. When it is not, automatic detection would not give this
   * phrase on its own after recovery: tell the user to note the word count and choose it then.
   */
  readPhrase(phrase: string): Promise<{ phrase: string; words: WordCount; otherLengths: WordCount[] }>;
  /** The container with every word written out, for showing back to the user. */
  readContainer(container: string): Promise<{ container: string }>;
  /** Stops the running operation at once; its promise rejects with MhfeCancelledError. */
  cancel(): void;
}
