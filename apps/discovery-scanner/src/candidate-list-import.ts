// A MnemoCode candidate list in the Scanner: the candidates of a forgotten word or date, saved by
// MnemoCode or the Wallet Deriver as one encrypted MNCL file (MnemoCode docs/CANDIDATES.md), which
// the Scanner opens and checks like typed seed phrases. The Scanner holds no recovery code: it only
// opens the list, with MnemoCode's own modules for the encryption (core/candidate-encryption.ts)
// and the format (core/candidate-list.ts), used unchanged.
//
// A list is encrypted either to this page's one-time key (age X25519), made when the person asks
// for it and gone when the page closes, or, as a separate file, under a list passphrase (scrypt).
// The candidates are never shown: they become the seed inputs of a scan, candidate N as MnemoCode
// numbers it, and their entropy is wiped when the list is removed or replaced.
import {
  CandidateFileRefused,
  createSessionIdentity,
  decryptCandidates,
  parseListPassphrase,
  type SessionIdentity,
} from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import {
  CandidateFileAdmission,
  type CandidateFileForm,
  type ListFileLock,
} from "../../../packages/recovery-mnemocode/source/core/candidate-file-admission.js";
import {
  OpenedCandidateList,
  type ListPassphrases,
} from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import type { RecoverySeedInput } from "./types.js";

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
  #session: Promise<SessionIdentity> | undefined;
  #list: OpenedCandidateList | undefined;
  /** Counts removals: a list that finishes opening after one is wiped and not kept. */
  #generation = 0;

  /** The kind of key that opens `file`; refused unless it is a list file of one of the two kinds. */
  static lockOf(file: Uint8Array): ListFileLock {
    return CandidateFileAdmission.lock(file);
  }

  /** Size and bounded prefix admission, before the panel asks for a key or reads the body. */
  static inspect(file: Pick<Blob, "size" | "slice">): Promise<ListFileLock> {
    return CandidateListImport.#inspect(file, file.size);
  }

  /** Plaintext is selected explicitly, never guessed from an encrypted file's failure. */
  static inspectPlaintext(file: Pick<Blob, "size">): void {
    CandidateFileAdmission.assertSize(file.size, "plaintext");
  }

  static #inspect(file: Pick<Blob, "slice">, size: number): Promise<ListFileLock> {
    return CandidateFileAdmission.inspect(
      size,
      async (length) => new Uint8Array(await file.slice(0, length).arrayBuffer()),
    );
  }

  /** The age1… key that MnemoCode or the Deriver encrypts a list to: one for this page. */
  async recipient(): Promise<string> {
    this.#session ??= createSessionIdentity();
    return (await this.#session).recipient;
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
    return this.#open(file, "age", passphrase);
  }

  async openPlaintext(file: CandidateListFile, consent = false): Promise<OpenedList | undefined> {
    if (!consent)
      throw new Error(
        "Confirm that this candidate list contains unencrypted recovery material before opening it.",
      );
    return this.#open(file, "plaintext");
  }

  /** One lifecycle and ownership path for the two explicitly selected file forms. */
  async #open(
    file: CandidateListFile,
    form: CandidateFileForm,
    passphrase?: string,
  ): Promise<OpenedList | undefined> {
    this.clear();
    const generation = this.#generation;
    // Removed, or replaced by another list, while it was read or opened (scrypt takes seconds).
    const dropped = (): boolean => generation !== this.#generation;
    let bytes: Uint8Array | undefined;
    let plain: Uint8Array | undefined;
    try {
      const size = file.size;
      const lock = form === "age" ? await CandidateListImport.#inspect(file, size) : undefined;
      if (form === "plaintext") CandidateFileAdmission.assertSize(size, form);
      if (dropped()) return undefined;
      bytes = new Uint8Array(await file.arrayBuffer());
      if (dropped()) return undefined;
      CandidateFileAdmission.assertSize(bytes.byteLength, form);
      if (
        bytes.byteLength !== size ||
        (lock !== undefined && CandidateFileAdmission.lock(bytes) !== lock)
      )
        throw new CandidateFileRefused(
          "damaged",
          "The candidate file changed or ended while it was being read.",
        );
      plain = lock === undefined ? bytes : await this.#decrypt(bytes, lock, passphrase);
      CandidateFileAdmission.assertSize(plain.byteLength, "plaintext");
      if (dropped()) return undefined;
      // fromBytes takes ownership and wipes the plaintext even when parsing refuses it.
      const parsedBytes = plain;
      plain = undefined;
      const list = OpenedCandidateList.fromBytes(parsedBytes);
      if (dropped()) {
        list.wipe();
        return undefined;
      }
      this.#list = list;
    } catch (cause) {
      if (dropped()) return undefined;
      throw cause;
    } finally {
      bytes?.fill(0);
      plain?.fill(0);
    }
    return { count: this.#list.count, passphrases: this.#list.passphrases };
  }

  /** The candidates as seed inputs, candidate N as MnemoCode numbers it; made fresh each time. */
  inputs(): RecoverySeedInput[] {
    return (this.#list?.candidates() ?? []).map((candidate, index) => ({
      id: `candidate-${index + 1}`,
      label: `Candidate ${index + 1} · MnemoCode list`,
      mnemonic: candidate.phrase,
      passphrase: candidate.passphrase,
    }));
  }

  /** Removes the list and wipes its entropy; the page's key stays for the next list. */
  clear(): void {
    this.#generation += 1;
    this.#list?.wipe();
    this.#list = undefined;
  }

  /** Decrypts `file` with the key its header asks for, in words a person can act on if it fails. */
  async #decrypt(
    file: Uint8Array,
    lock: ListFileLock,
    passphrase: string | undefined,
  ): Promise<Uint8Array> {
    const key =
      lock === "passphrase"
        ? { passphrase: parseListPassphrase(passphrase ?? "") }
        : { identity: (await this.#sessionForOpening()).identity };
    try {
      return await decryptCandidates(file, key);
    } catch (cause) {
      // MnemoCode's message says what failed; only the page knows which page a key belongs to.
      if (cause instanceof CandidateFileRefused && cause.problem === "key" && "identity" in key)
        throw new Error(
          "This list was saved for another Scanner key. A list opens only in the page whose key it was saved to, while that page stays open.",
          { cause },
        );
      throw cause;
    }
  }

  async #sessionForOpening(): Promise<SessionIdentity> {
    if (this.#session === undefined)
      throw new Error(
        "This page has no Scanner key yet: show the key, save the list to it, then open the list here.",
      );
    return this.#session;
  }
}
