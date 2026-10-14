import type {
  MhfeError,
  MhfeErrorCode,
  MhfePackageParts,
  MhfePasswordRepair,
  MhfeSecret,
  MhfeSelfCheckProgress,
  MhfeSelfCheckReport,
} from "../runtime/runtime.js";
export {
  MhfeCancelledError,
  MhfeError,
  type MhfeErrorCode,
  type MhfeSelfCheckProgress,
  type MhfeSelfCheckReport,
} from "../runtime/runtime.js";

/** Four Argon2 lanes in parallel; needs a cross-origin isolated page, such as `mhfe serve` gives. */
export const FAST_MODE: "fast";
/** One lane after another; works everywhere, including a page opened as a file. */
export const STANDARD_MODE: "standard";

export type MhfeMode = typeof FAST_MODE | typeof STANDARD_MODE;
export type WordCount = 12 | 15 | 18 | 21 | 24;
export type RepairWordCount = 0 | 2 | 4 | 6 | 8;

/** runtime/worker.js and runtime/mhfe.wasm, with the core's two Argon2 builds. */
export interface MhfeSources extends MhfePackageParts {
  /** Text of core/argon2-mt.js, the threaded Argon2 build. */
  argon2Threaded: string;
  /** Text of core/argon2-st.js, the single-threaded Argon2 build. */
  argon2SingleThreaded: string;
}

export interface MhfeProgress {
  /**
   * "encrypt" and "check" for an encryption, "recover" for a recovery or a hidden wallet,
   * "compare" once after a recovery's rounds, before it is compared with the wallet.
   */
  stage: "encrypt" | "check" | "recover" | "compare";
  /** The round that starts, from 1 to `rounds`; a "compare" report repeats the last round. */
  round: number;
  /** 12 for a recovery, 24 for an encryption with its check or the self-test, 36 for a rekey. */
  rounds: 12 | 24 | 36;
}

export interface MhfeSettings {
  /**
   * Password: ordinary single-line text or its UTF-8 bytes. Unpaired surrogates, control characters
   * (such as NUL, TAB and line breaks), U+2028 and U+2029 are refused.
   */
  password: MhfeSecret;
  /** The choice of the check word review of the password; default "asTyped". */
  passwordRepair?: MhfePasswordRepair;
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

export interface MhfeParameters {
  /** The package's release version, the same in every module. */
  version: string;
  suiteId: string;
  sameLengthSuiteId: string;
  rounds: number;
  maxPim: number;
  maxMemoryLevel: number;
  highestBrowserMemoryLevel: 0;
  wordCounts: WordCount[];
  builtInCheckWordCounts: (12 | 15 | 18 | 21)[];
  repairWordCounts: (2 | 4 | 6 | 8)[];
  recommendedRepairWords: number;
  repairCapacities: { count: number; unreadable: number; wrong: number }[];
  /** The error codes after which a session of hidden wallets stays open for another password. */
  hiddenWalletRefusals: MhfeErrorCode[];
  /** Addresses of each chain searchDecoy() searches for two missing words by default. */
  decoyScanGap: number;
  /** The parts of a self-check report that run Argon2: at 1 MiB, then at 64 and 256 MiB. */
  argon2Parts: string[];
}

export interface MhfePhraseFacts {
  /** The phrase with every word written out, for showing back to the user. */
  phrase: string;
  words: WordCount;
  /**
   * Almost always empty. When it is not, automatic detection would not give this phrase on its
   * own after recovery: tell the user to note the word count and choose it then.
   */
  otherLengths: WordCount[];
  /**
   * The containers the phrase can be encrypted into, 24 words first, with what each means;
   * `otherLengths` of each is the field above for that container, empty for a same-length one,
   * whose length is its own.
   */
  containers: {
    sameLength: boolean;
    words: WordCount;
    wrongWordPassesOneIn: number;
    otherLengths: WordCount[];
  }[];
}

export interface MhfeContainerFacts {
  /** The container with every word written out, for showing back to the user. */
  container: string;
  words: WordCount;
  suiteId: string;
  /** The lengths its phrase can have: all five for 24 words, its own for a same-length one. */
  phraseLengths: WordCount[];
  builtInCheckLengths: (12 | 15 | 18 | 21)[];
  /**
   * For each phrase length, and "0" for the length detected, what confirms a recovery to encrypt
   * again: the built-in check, for a stated 12- to 21-word length of a 24-word container, or the
   * wallet or its owner, for every other length and for a detected one.
   */
  confirmationFor: Partial<Record<`${0 | WordCount}`, "builtInCheck" | "walletOrOwner">>;
  /** Whether hidden wallets open on it: 24-word containers only. */
  hiddenWallets: boolean;
  /** Whether the phrase and passphrase check is offered: 24-word containers only. */
  offersWalletCheck: boolean;
  /** The master key fingerprint of the container's own words: not the wallet's. */
  containerFingerprint: string;
}

/** One thing the owner keeps, in the order the result lists them. */
export type MhfeKeepItem =
  | { item: "containerWords"; words: WordCount }
  | { item: "password" }
  | { item: "passphrase" }
  /** Any BIP39 passphrase of the wallet, where it is not known whether it has one. */
  | { item: "passphraseIfAny" }
  | { item: "repairWords" }
  | { item: "pim"; value: number }
  | { item: "memoryLevel"; value: number }
  | { item: "wordCount"; words: WordCount };

/** A new container whose check has passed. */
export interface MhfeSealed {
  container: string;
  suiteId: string;
  containerFingerprint: string;
  /** Whether a recovery checks the phrase on its own: a 12- to 21-word phrase in 24 words. */
  builtInCheck: boolean;
  otherLengths: WordCount[];
  /** The repair words, made only once the check has passed; null without them. */
  repairWords: string | null;
  repairProfile: "MHFE-REPAIR-1" | null;
  keep: MhfeKeepItem[];
}

export interface MhfeCandidate {
  words: WordCount;
  /**
   * True when a 12- to 21-word phrase from a 24-word container passed its built-in check. Never
   * true for 24 words or for a same-length container, which have no check.
   */
  verified: boolean;
  status: "verified" | "noBuiltInCheck" | "readAs24" | "readAs24Chosen";
  phrase: string;
  /** The suite of the container, which its word count selected. */
  suiteId: string;
  /** The master key fingerprint if the wallet has no BIP39 passphrase. */
  fingerprintWithoutPassphrase: string;
  /**
   * Whether a 24-word reading passes the 16-bit source check with the passphrase given to
   * decrypt(), or with none; null for every other length. Every recovery evaluates it: the
   * container does not show whether the phrase was made with the check.
   */
  walletCheck: boolean | null;
  /**
   * The length stated, where the built-in checks gave this reading another, which takes
   * precedence: a page says so. Null when the reading has the stated length or none was stated.
   */
  statedWords: WordCount | null;
  /** The other 12- to 21-word lengths whose built-in check passes too, by chance. */
  otherLengths: WordCount[];
}

export interface MhfeRecovery {
  /**
   * "ambiguous" when several lengths passed their check, or one did beside 24 stated words:
   * show every candidate, the checked ones first.
   */
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

/** How far a search for missing words has come; `round` and `rounds` with the owner's wallet. */
export interface MhfeSearchProgress {
  stage: "search";
  candidate: number;
  candidates: number;
  round?: number;
  rounds?: number;
}

/** The result of a search for missing words. */
export interface MhfeSearchResult {
  found: boolean;
  /** The container phrase found, every word in full; null when no candidate matched. */
  container: string | null;
  /** The master key fingerprint of the container's own words; null when none matched. */
  containerFingerprint: string | null;
  /** Each missing word as found, with its position from 1. */
  words: { position: number; word: string }[];
  /** Where a matched address was found; null otherwise. */
  path: string | null;
  candidates: number;
}

/** Exactly one kind of reference; an object with several is refused with a TypeError. */
export type MhfeReference =
  /**
   * A single-key receiving address of the wallet, the strong check, with its coin, which has no
   * default; the address is searched on that coin's standard paths, or only at `path`.
   */
  | {
      address: string;
      coin: MhfeCoin;
      path?: string;
      fingerprint?: never;
      words?: never;
      walletCheck?: never;
    }
  /** The BIP32 master key fingerprint, eight hex digits: quick but weaker. */
  | {
      fingerprint: string;
      address?: never;
      coin?: never;
      path?: never;
      words?: never;
      walletCheck?: never;
    }
  /**
   * The built-in check of a 12- to 21-word original in a 24-word container: confirms the
   * password, not the wallet. A same-length container has none (NO_BUILT_IN_CHECK). 0 detects
   * the length, and with a check's `passphrase` finds a 24-word phrase drawn with the phrase +
   * passphrase check too.
   */
  | {
      words: 0 | 12 | 15 | 18 | 21;
      address?: never;
      coin?: never;
      path?: never;
      fingerprint?: never;
      walletCheck?: never;
    }
  /** The phrase and passphrase check of a 24-word container, with its BIP39 passphrase. */
  | {
      walletCheck: true;
      address?: never;
      coin?: never;
      path?: never;
      fingerprint?: never;
      words?: never;
    };

/** The page's answer when a check's detection found no length: a length, or for 24 words the wallet. */
export type MhfeNoLengthAnswer =
  | { words: 12 | 15 | 18 | 21 }
  | (Extract<MhfeReference, { address: string } | { fingerprint: string }> & {
      passphrase?: MhfeSecret;
    });

/** How a rekey confirms the recovered phrase; readContainer().confirmationFor says which applies. */
export type MhfeConfirmation =
  /**
   * Its built-in check, alone: no other kind may be given with it, and only with a 12- to 21-word
   * length stated; with the length detected it rejects with REFERENCE_REQUIRED. A stated length
   * that the check contradicts rejects with LENGTH_DIFFERS: confirm again with an address, the
   * fingerprint or the owner, on the same recovery with `onConfirmAgain`. Several lengths that
   * pass by accident reject it with AMBIGUOUS_LENGTH.
   */
  | { builtInCheck: true; address?: never; fingerprint?: never; owner?: never }
  | {
      /**
       * Shows the phrase to its owner to compare with the written backup; true goes on. With 24
       * words stated, one 12- to 21-word length whose check passes rejects it with
       * LENGTH_DIFFERS: the owner cannot tell the two readings apart, and an address or the
       * fingerprint confirms one. Several lengths that pass by accident reject it with
       * AMBIGUOUS_LENGTH unless the length stated is one of them: state the length of the reading
       * to compare.
       */
      owner: (check: {
        phrase: string;
        words: WordCount;
        /**
         * The length the user stated, present only where the built-in check found `words`
         * instead: say so before the owner compares.
         */
        statedWords?: WordCount;
        fingerprintWithoutPassphrase: string;
      }) => boolean | Promise<boolean>;
      builtInCheck?: never;
      address?: never;
      fingerprint?: never;
    }
  /** The wallet check (16 bits) never confirms a phrase to encrypt again. */
  | Exclude<MhfeReference, { words: number } | { walletCheck: true }>;

/**
 * A rekey's confirmation, with the user's answer whether the wallet has a BIP39 passphrase, which
 * the new container's keep list names.
 */
export type MhfeRekeyConfirmation =
  | {
      /** The built-in check and the owner show nothing of a passphrase: the answer is required. */
      confirmation: Extract<MhfeConfirmation, { builtInCheck: true } | { owner: unknown }>;
      walletHasPassphrase: boolean;
      passphrase?: never;
    }
  | {
      /** An address or a fingerprint compared with the wallet's BIP39 passphrase. */
      confirmation: Exclude<MhfeConfirmation, { builtInCheck: true } | { owner: unknown }>;
      /** Non-empty: it shows that the wallet has one, and false is refused (INVALID_REQUEST). */
      passphrase: MhfeSecret;
      walletHasPassphrase?: boolean;
    }
  | {
      /**
       * An address or a fingerprint without a passphrase matches the phrase's wallet without
       * one, which says nothing about funds under a passphrase: it confirms only a wallet
       * stated to have none, and true is refused (INVALID_REQUEST).
       */
      confirmation: Exclude<MhfeConfirmation, { builtInCheck: true } | { owner: unknown }>;
      passphrase?: "" | undefined;
      walletHasPassphrase: false;
    };

/**
 * The page's answer when a rekey's confirmation is refused with AMBIGUOUS_LENGTH or
 * LENGTH_DIFFERS: another confirmation, judged on the same recovery without the rounds again.
 */
export type MhfeConfirmAgainAnswer =
  | (Exclude<MhfeConfirmation, { builtInCheck: true } | { owner: unknown }> & {
      passphrase?: MhfeSecret;
      words?: never;
    })
  | (Extract<MhfeConfirmation, { owner: unknown }> & {
      /** One of `ownerLengths`; may be left out when there is only one. */
      words?: WordCount;
      passphrase?: never;
    });

export interface MhfeHiddenWallet {
  phrase: string;
  words: 24;
  fingerprintWithoutPassphrase: string;
}

/** An open session of hidden wallets; nothing in it is listed or counted. */
export interface MhfeHiddenWallets {
  /** Opens the wallet of a new password, typed twice; refusals leave the session open. */
  open(options: {
    password: MhfeSecret;
    passwordRepeat: MhfeSecret;
    passwordRepair?: MhfePasswordRepair;
    onProgress?: (progress: MhfeProgress) => void | Promise<void>;
  }): Promise<MhfeHiddenWallet>;
  /**
   * Ends the session: the Rust code overwrites every password and the passphrase in it. During an
   * `open` it stops the worker at once instead, which frees the memory without overwriting it.
   * Every call returns the same promise, settled once the session has ended.
   */
  close(): Promise<void>;
}

/**
 * Where a self-test that did not pass first left the published path. Its rounds are counted over
 * the whole self-test: 1 to 12 the suite 3 encryption, 13 to 24 the suite 4 recovery.
 */
export interface MhfeSelfTestFault {
  /**
   * "argon2-input": Argon2id was given an input, password or salt, that the published vector does
   * not have at that round, so the fault lies before Argon2id: in the round's password or salt or
   * in the state the round started from. "argon2-key": the published input gave another key, so
   * the fault lies in Argon2id. "after-argon2": every Argon2id input and key was as published, so
   * the fault lies after an operation's last Argon2id call.
   */
  kind: "argon2-input" | "argon2-key" | "after-argon2";
  /** The round, 1 to 24; null for "after-argon2". */
  round: number | null;
  /**
   * The sentence a page shows as it is, such as "first wrong round 4 of 24: Argon2id returned
   * another key for the published input, so the fault is in Argon2id".
   */
  message: string;
}

export interface MhfeSelfTest {
  passed: boolean;
  suite3: { vector: string; asPublished: boolean };
  suite4: { vector: string; asPublished: boolean };
  /**
   * The round of `fault`: where Argon2id's input or its key first differed from the published
   * one, 1 to 12 the suite 3 encryption and 13 to 24 the suite 4 recovery. Null when the test
   * passed or when the fault lies after the last Argon2id call. Only `fault` tells a fault in
   * Argon2id from one before it.
   */
  firstWrongRound: number | null;
  /** Null when the test passed. */
  fault: MhfeSelfTestFault | null;
}

/**
 * Every operation returns a promise and reports every error by rejecting it, the checks of its
 * arguments included: none throws when it is called. mode(), maxSupportedMemLevel() and cancel()
 * are synchronous. Only the constructor throws, for missing parts. One long operation or session
 * runs at a time (BUSY otherwise); parameters, readPhrase and readContainer never wait.
 */
export class MhfeClient {
  constructor(sources: MhfeSources);
  mode(): MhfeMode;
  maxSupportedMemLevel(): 0;
  /**
   * The quick self-check of the core, made once per page for each choice and awaited by every
   * operation but parameters() and selfTest() before its first call (without Argon2 when none ran
   * yet). `argon2` (default true) also runs Argon2's known answer at 1 MiB through this mode's
   * build, which loads it; false leaves Argon2 out, listed as not run, for a quick check at a
   * page's start: every operation runs that known answer itself before its first round and after
   * its last. A failed part closes the client for good: every such operation then rejects with
   * SELF_CHECK_FAILED, the report attached. Not the rehearsal check, which is check().
   *
   * An Argon2 build that does not start gave no wrong answer: Argon2 is "notAvailable", the detail
   * naming the cause, the client stays open, such a report is not kept (the next call checks
   * again), and an operation gets its own error. When only the threaded build of the fast mode
   * does not start, the check runs the single-threaded build of the standard mode instead, and
   * Argon2 is a "warning" whose detail says so.
   */
  startupCheck(options?: { argon2?: boolean }): Promise<MhfeSelfCheckReport>;
  /**
   * The full self-check, run anew each time, in seconds and with 256 MiB: every part with its
   * slower cases, and Argon2 at 64 and 256 MiB with the single-threaded build, then the threaded
   * one on a cross-origin isolated page (not run otherwise), never both at once. The published
   * vectors are listed as not run (selfTest()), the parts a browser cannot check as not available.
   * An Argon2 build that does not start makes its parts not available, as startupCheck() says.
   */
  fullCheck(options?: {
    onProgress?: (progress: MhfeSelfCheckProgress) => void | Promise<void>;
  }): Promise<MhfeSelfCheckReport>;
  parameters(): Promise<MhfeParameters>;
  /**
   * The phrase reaches the worker as UTF-8 bytes, which the worker and the WebAssembly wipe after
   * use, as in encrypt(); a phrase with an unpaired surrogate is refused (INVALID_PASSWORD_TEXT).
   */
  readPhrase(phrase: string): Promise<MhfePhraseFacts>;
  readContainer(container: string): Promise<MhfeContainerFacts>;
  /**
   * Needs the password twice; after the password's own rules, a difference is refused with the
   * code PASSWORDS_DIFFER, and a password or repetition that is neither a string nor a Uint8Array
   * with a TypeError. Resolves
   * only after the container has been decrypted again and checked; a failed check rejects with
   * VERIFICATION_FAILED. `onUnverified` receives the container before the check, for showing it
   * marked as not yet verified; the page must then report how the check ended. If `onUnverified`
   * fails like `onProgress` can, the operation stops and rejects with CALLBACK_FAILED.
   */
  encrypt(
    options: MhfeSettings & {
      phrase: string;
      passwordRepeat: MhfeSecret;
      /**
       * A container as long as the 12- to 21-word phrase instead of 24 words. Set it only on the
       * user's own choice, after showing its consequences: nothing detects a wrong password, the
       * container shows the phrase's length, and a word copied wrongly passes the shorter
       * checksum more often. Default false.
       */
      sameLength?: boolean;
      /**
       * Repair words of the new container phrase, made only once the check has passed. Default 0.
       */
      repairWordCount?: RepairWordCount;
      /**
       * Whether the wallet has a BIP39 passphrase, only where the page knows it, such as after
       * drawPhrase(): true adds it to what to keep, since MHFE encrypts only the phrase, and false
       * leaves it out. Left out or null, `keep` names any passphrase of the wallet
       * ("passphraseIfAny") instead.
       */
      walletHasPassphrase?: boolean | null;
      onUnverified?: (result: {
        container: string;
        containerFingerprint: string;
      }) => void | Promise<void>;
    },
  ): Promise<MhfeSealed>;
  /**
   * The container's word count selects the suite. `words` chooses the length of a 24-word
   * container's original; a same-length container takes only its own length.
   */
  decrypt(
    options: MhfeSettings & {
      container: string;
      words?: 0 | WordCount;
      /** The wallet's BIP39 passphrase for the 16-bit source check, "" (the default) for none. */
      passphrase?: MhfeSecret;
    },
  ): Promise<MhfeRecovery>;
  check(
    options: MhfeSettings & {
      container: string;
      reference: MhfeReference;
      passphrase?: MhfeSecret;
      /**
       * With `{ words: 0 }`: called when detection found no length; the length or a wallet
       * reference for 24 words, compared on the same recovery, or null.
       */
      onNoLength?: () =>
        MhfeNoLengthAnswer | null | undefined | Promise<MhfeNoLengthAnswer | null | undefined>;
    },
  ): Promise<{
    matches: boolean;
    /** Where a matched address was found, such as "m/84'/0'/0'/0/5"; null otherwise. */
    path: string | null;
    /**
     * The original seed phrase's own checks, from the same recovery, to list with the match.
     * `builtInCheck` is the length of a 12- to 21-word one whose built-in check passes, the
     * stated one where it passes; with `{ words }` a check that passes at another length takes
     * precedence and matches, and this names that length. `walletCheck` is whether the 24-word
     * reading passes the 16-bit phrase + passphrase check with the passphrase given, or with none
     * if none was given; null for `{ words }` with a length stated, for a same-length container,
     * and when exactly one shorter length passes its check and the reference did not match the
     * 24-word reading. A phrase drawn without that check fails it, so that only a pass says
     * anything.
     */
    evidence: { builtInCheck: number | null; walletCheck: boolean | null };
  }>;
  /** The candidates of a container phrase with words typed as "?"; see client.js. */
  searchCandidates(options: { container: string }): Promise<{
    missing: number[];
    candidates: number;
    /** Whether searchWallet() with an address or fingerprint is offered: one missing word. */
    offersWalletSearch: boolean;
    /** Whether searchWallet() with the phrase's own checks is offered too. */
    offersOwnChecks: boolean;
  }>;
  /** Searches for up to two missing words with the decoy wallet, without a password. */
  searchDecoy(options: {
    container: string;
    reference: Extract<MhfeReference, { address: string } | { fingerprint: string }>;
    passphrase?: MhfeSecret;
    /** First-account receiving and change addresses searched for two missing words; default
     * parameters().decoyScanGap. */
    scanGap?: number;
    onProgress?: (progress: MhfeSearchProgress) => void | Promise<void>;
  }): Promise<MhfeSearchResult>;
  /** Searches for one missing word with the owner's wallet, recovering every candidate. */
  searchWallet(
    options: Omit<MhfeSettings, "onProgress"> & {
      container: string;
      reference:
        | Extract<
            MhfeReference,
            { address: string } | { fingerprint: string } | { walletCheck: true }
          >
        | { builtInCheck: true };
      passphrase?: MhfeSecret;
      onProgress?: (progress: MhfeSearchProgress) => void | Promise<void>;
    },
  ): Promise<MhfeSearchResult>;
  /** Encrypts a container again with a new password or settings; see client.js. */
  rekey(
    options: MhfeSettings & {
      container: string;
      words?: 0 | WordCount;
      newPassword: MhfeSecret;
      newPasswordRepeat: MhfeSecret;
      newPasswordRepair?: MhfePasswordRepair;
      newPim?: number;
      newMemoryLevel?: number;
      repairWordCount?: RepairWordCount;
      onUnverified?: (result: {
        container: string;
        containerFingerprint: string;
      }) => void | Promise<void>;
      /**
       * Called after AMBIGUOUS_LENGTH or LENGTH_DIFFERS, once the recovery's rounds are done:
       * another confirmation, judged on the same recovery, or null, which rejects with the
       * refusal. `ownerLengths` are the lengths at which the owner may compare the phrase with
       * their backup, empty where only an address or the fingerprint confirms it.
       */
      onConfirmAgain?: (refusal: {
        error: MhfeError;
        ownerLengths: WordCount[];
      }) =>
        | MhfeConfirmAgainAnswer
        | null
        | undefined
        | Promise<MhfeConfirmAgainAnswer | null | undefined>;
    } & MhfeRekeyConfirmation,
  ): Promise<
    MhfeSealed & {
      /**
       * The 16-bit source check of the recovered 24-word reading, with the reference's passphrase
       * or none; null for other lengths. It never confirms a rekey.
       */
      walletCheck: boolean | null;
    }
  >;
  openHiddenWallets(options: {
    container: string;
    pim?: number;
    memoryLevel?: number;
    /** The main wallet's BIP39 passphrase, asked every time; empty for a wallet without one. */
    mainPassphrase: MhfeSecret;
  }): Promise<MhfeHiddenWallets>;
  /**
   * The published vectors at full cost: minutes and 2 GiB. Start it only when the person asks; it
   * does not wait for the startup check.
   */
  selfTest(options?: {
    onProgress?: (progress: MhfeProgress) => void | Promise<void>;
  }): Promise<MhfeSelfTest>;
  /**
   * Stops the running operation or session: its promise rejects at once with MhfeCancelledError,
   * and its worker is terminated, as soon as it has loaded the WebAssembly if it is still loading
   * it.
   */
  cancel(): void;
}
