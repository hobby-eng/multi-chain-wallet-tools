// A MnemoCode candidate list in the Scanner: the candidates of a forgotten word or date, saved by
// MnemoCode or the Wallet Deriver as one encrypted MNCL file (MnemoCode docs/CANDIDATES.md), which
// the Scanner opens and checks like typed seed phrases. The Scanner holds no recovery code: it only
// opens the list, with the candidates part of MnemoCode's WebAssembly (candidateFileLock,
// SessionIdentity, decryptWithPassphrase, OpenedCandidateList).
//
// A list is encrypted either to this page's one-time key (age X25519), made when the person asks
// for it and gone when the page closes, or, as a separate file, under a list passphrase (scrypt).
// The candidates are never shown: they become the seed inputs of a scan, candidate N as MnemoCode
// numbers it, and the list is freed, which wipes it, when it is removed or replaced.
import type { OpenedCandidateList, SessionIdentity } from "@ckd/mnemocode-wasm/mnemocode.js";
import { mnemocode, mnemocodeCode } from "@ckd/recovery-backup/mnemocode-engine.js";
import type { RecoverySeedInput } from "./types.js";

/** How an encrypted list file is locked: to a Scanner key or with a passphrase. */
export type ListFileLock = "key" | "passphrase";
/** Which passphrases a list holds: none, one for all, or one for each candidate. */
export type ListPassphrases = "none" | "list" | "records";

/** The bytes of a file that MnemoCode reads for its lock: its age header fits in them. */
const HEADER_BYTES = 64 * 1024;
const LOCKS: Readonly<Record<string, ListFileLock>> = { X25519: "key", scrypt: "passphrase" };

/** What an opened list holds, as the page reports it. */
export interface OpenedList {
  readonly count: number;
  readonly passphrases: ListPassphrases;
}

/** The candidates of a list as a scan takes them. */
export interface CandidateSource {
  readonly count: number;
  inputs(): RecoverySeedInput[];
}

/** Native File/Blob metadata and reads; admission must happen before the body is buffered. */
export type CandidateListFile = Pick<Blob, "size" | "slice" | "arrayBuffer">;

export class CandidateListImport implements CandidateSource {
  #session: SessionIdentity | undefined;
  #list: OpenedCandidateList | undefined;
  /** Counts removals: a list that finishes opening after one is wiped and not kept. */
  #generation = 0;

  /** The kind of key that opens `file`; refused unless it is a list file of one of the two kinds. */
  static lockOf(file: Uint8Array): ListFileLock {
    const lock = LOCKS[mnemocode().candidateFileLock(file)];
    if (lock === undefined)
      throw new Error("This file is locked in a way the Scanner cannot open.");
    return lock;
  }

  /** Size and bounded prefix admission, before the panel asks for a key or reads the body. */
  static async inspect(file: Pick<Blob, "size" | "slice">): Promise<ListFileLock> {
    mnemocode().checkCandidateFileSize(file.size);
    const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
    try {
      return CandidateListImport.lockOf(head);
    } finally {
      head.fill(0);
    }
  }

  /** Plaintext is selected explicitly, never guessed from an encrypted file's failure. */
  static inspectPlaintext(file: Pick<Blob, "size">): void {
    mnemocode().checkCandidateFileSize(file.size);
  }

  /** The age1… key that MnemoCode or the Deriver encrypts a list to: one for this page. */
  recipient(): Promise<string> {
    this.#session ??= mnemocode().SessionIdentity.create();
    return Promise.resolve(this.#session.recipient);
  }

  get count(): number {
    return this.#list?.count ?? 0;
  }

  /**
   * Opens a list file, with this page's key or with `passphrase` as its header asks, and keeps its
   * candidates; the list before it, and any open still running, is removed first. The whole file
   * is authenticated and read before anything is kept, so a damaged or foreign file leaves no
   * candidate behind. Undefined means the list was removed or replaced while it was being read or
   * opened: nothing of it is kept, and a failure of it is not reported.
   */
  async open(file: CandidateListFile, passphrase?: string): Promise<OpenedList | undefined> {
    return this.#open(file, true, passphrase);
  }

  async openPlaintext(file: CandidateListFile, consent = false): Promise<OpenedList | undefined> {
    if (!consent)
      throw new Error(
        "Confirm that this candidate list contains unencrypted recovery material before opening it.",
      );
    return this.#open(file, false);
  }

  /** One lifecycle and ownership path for the two explicitly selected file forms. */
  async #open(
    file: CandidateListFile,
    encrypted: boolean,
    passphrase?: string,
  ): Promise<OpenedList | undefined> {
    this.clear();
    const generation = this.#generation;
    // Removed, or replaced by another list, while it was read or opened (scrypt takes seconds).
    const dropped = (): boolean => generation !== this.#generation;
    let bytes: Uint8Array | undefined;
    let plain: Uint8Array | undefined;
    let list: OpenedCandidateList | undefined;
    try {
      const size = file.size;
      const lock = encrypted ? await CandidateListImport.inspect(file) : undefined;
      if (!encrypted) CandidateListImport.inspectPlaintext(file);
      if (dropped()) return undefined;
      bytes = new Uint8Array(await file.arrayBuffer());
      if (dropped()) return undefined;
      if (
        bytes.byteLength !== size ||
        (lock !== undefined && CandidateListImport.lockOf(bytes) !== lock)
      )
        throw new Error("The file changed while it was read. Choose it again.");
      plain = lock === undefined ? bytes : this.#decrypt(bytes, lock, passphrase);
      list = mnemocode().OpenedCandidateList.read(plain);
      if (dropped()) return undefined;
      this.#list = list;
      list = undefined;
    } catch (cause) {
      if (dropped()) return undefined;
      throw cause;
    } finally {
      bytes?.fill(0);
      plain?.fill(0);
      list?.free();
    }
    return {
      count: this.#list.count,
      passphrases: this.#list.passphrases as ListPassphrases,
    };
  }

  /** The candidates as seed inputs, candidate N as MnemoCode numbers it; made fresh each time. */
  inputs(): RecoverySeedInput[] {
    const list = this.#list;
    if (list === undefined) return [];
    return Array.from({ length: list.count }, (_, index) => ({
      id: `candidate-${index + 1}`,
      label: `Candidate ${index + 1} · MnemoCode list`,
      mnemonic: list.phrase(index),
      passphrase: list.passphrase(index),
    }));
  }

  /** Removes the list and wipes it; the page's key stays for the next list. */
  clear(): void {
    this.#generation += 1;
    this.#list?.free();
    this.#list = undefined;
  }

  /**
   * Ends this page's lists: wipes any list and the page's one-time key, which this import owns, so
   * that a list saved to it no longer opens; a later recipient() makes a new key.
   */
  end(): void {
    this.clear();
    this.#session?.free();
    this.#session = undefined;
  }

  /** Decrypts `file` with the key its header asks for, in words a person can act on if it fails. */
  #decrypt(file: Uint8Array, lock: ListFileLock, passphrase: string | undefined): Uint8Array {
    if (lock === "passphrase") return mnemocode().decryptWithPassphrase(file, passphrase ?? "");
    if (this.#session === undefined)
      throw new Error(
        "This page has no Scanner key yet: show the key, save the list to it, then open the list here.",
      );
    try {
      return this.#session.decrypt(file);
    } catch (cause) {
      // MnemoCode's message says what failed; only the page knows which page a key belongs to.
      if (mnemocodeCode(cause) === "core.candidate-file-refusal.scanner-key-does-not-open")
        throw new Error(
          "This list was saved for another Scanner key. A list opens only in the page whose key it was saved to, while that page stays open.",
          { cause },
        );
      throw cause;
    }
  }
}
