/* tslint:disable */
/* eslint-disable */

/**
 * A candidate list read from its MNCL bytes, one candidate on request.
 */
export class OpenedCandidateList {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The BIP39 passphrase that the candidate at `at` is checked with; refused past the last.
     */
    passphrase(at: number): string;
    /**
     * The phrase of the candidate at `at`, a whole number from 0; refused past the last.
     */
    phrase(at: number): string;
    /**
     * The list in `bytes`; refused as the library refuses a damaged or foreign list.
     */
    static read(bytes: Uint8Array): OpenedCandidateList;
    /**
     * How many candidates it holds.
     */
    readonly count: number;
    /**
     * Which passphrases it holds: "none", "list" (one for all) or "records" (their own).
     */
    readonly passphrases: string;
}

/**
 * The Discovery Scanner's one-time key for a session; only its recipient leaves the WebAssembly,
 * and `wipe()` or `free()` wipes the key.
 */
export class SessionIdentity {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A new key from the browser's randomness, once the gate is open.
     */
    static create(): SessionIdentity;
    /**
     * The candidate list in the age `file`, opened with this key; refused for a file of another
     * lock or shape, one this key does not open, a damaged one, and once the key is wiped.
     */
    decrypt(file: Uint8Array): Uint8Array;
    /**
     * Wipes the key now, as `free()` does, and leaves an object that refuses every use.
     */
    wipe(): void;
    /**
     * Its recipient, age1…, which the writer of a list encrypts to; refused once wiped.
     */
    readonly recipient: string;
}

/**
 * The lock of the candidate file that begins with `head`, its first 64 KiB or more: "X25519" for
 * a Scanner's key, "scrypt" for a passphrase; refused where it is no list. A page asks it before
 * it asks for a key or a passphrase.
 */
export function candidateFileLock(head: Uint8Array): string;

/**
 * Refuses a candidate file of `size` bytes larger than any list's, before it is read.
 */
export function checkCandidateFileSize(size: number): void;

/**
 * The candidate list in the age `file`, opened with `passphrase`.
 */
export function decryptWithPassphrase(file: Uint8Array, passphrase: any): Uint8Array;

/**
 * The file of `list` protected as `kind` says: "key" encrypts it to the Scanner's recipient in
 * `secret`, "passphrase" under the passphrase in `secret` (at least 12 characters), and "none",
 * only on the person's explicit request, leaves it in the open (`secret` undefined).
 */
export function protectList(list: Uint8Array, kind: any, secret: any): Uint8Array;

/**
 * The candidates part's known answers: the startup cases, or with `full` every case, scrypt's
 * among them.
 */
export function selfCheckCandidates(full: boolean): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_openedcandidatelist_free: (a: number, b: number) => void;
    readonly __wbg_sessionidentity_free: (a: number, b: number) => void;
    readonly candidateFileLock: (a: number, b: number, c: number) => void;
    readonly checkCandidateFileSize: (a: number, b: number) => void;
    readonly decryptWithPassphrase: (a: number, b: number, c: number, d: number) => void;
    readonly openedcandidatelist_count: (a: number) => number;
    readonly openedcandidatelist_passphrase: (a: number, b: number, c: number) => void;
    readonly openedcandidatelist_passphrases: (a: number, b: number) => void;
    readonly openedcandidatelist_phrase: (a: number, b: number, c: number) => void;
    readonly openedcandidatelist_read: (a: number, b: number, c: number) => void;
    readonly protectList: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly selfCheckCandidates: (a: number, b: number) => void;
    readonly sessionidentity_create: (a: number) => void;
    readonly sessionidentity_decrypt: (a: number, b: number, c: number, d: number) => void;
    readonly sessionidentity_recipient: (a: number, b: number) => void;
    readonly sessionidentity_wipe: (a: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;
