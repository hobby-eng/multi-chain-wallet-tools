import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CandidateFileAdmission } from "../../../packages/recovery-mnemocode/source/core/candidate-file-admission.js";
import {
  createSessionIdentity,
  encryptCandidates,
  encryptCandidatesWithPassphrase,
} from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import { encodeCandidateList } from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import { CandidateListImport } from "../src/candidate-list-import.js";
import { CandidateListTestFile } from "./candidate-list-file.js";

// Lets a test hold the importer at the decryption step, to remove the list while it waits there.
const decryption = vi.hoisted(() => {
  let next: { reached: () => void; released: Promise<void> } | undefined;
  return {
    plain: undefined as Uint8Array | undefined,
    /** Holds the next decryption: `started` settles when it begins, `release` lets it go on. */
    holdNext(): { started: Promise<void>; release: () => void } {
      let reached!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => (reached = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      next = { reached, released };
      return { started, release };
    },
    async pass(): Promise<void> {
      const held = next;
      next = undefined;
      held?.reached();
      await held?.released;
    },
  };
});

vi.mock(
  "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../packages/recovery-mnemocode/source/core/candidate-encryption.js")
      >();
    return {
      ...actual,
      decryptCandidates: async (...args: Parameters<typeof actual.decryptCandidates>) => {
        await decryption.pass();
        const plain = await actual.decryptCandidates(...args);
        decryption.plain = plain;
        return plain;
      },
    };
  },
);

// Public BIP39 test phrases and synthetic list passphrases only.
const PHRASES = [
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
];
const LIST_PASSPHRASE = "public list passphrase";
const WRONG_LIST_PASSPHRASE = "another passphrase";

function plainList(passphrase?: string, phrases = PHRASES): Uint8Array {
  const records = phrases.map((phrase) => ({ entropy: mnemonicToEntropy(phrase, wordlist) }));
  return encodeCandidateList(passphrase === undefined ? { records } : { passphrase, records });
}

/** A native File whose next owned read arrives when the test releases it. */
function heldFile(bytes: Uint8Array): {
  file: CandidateListTestFile;
  release: () => void;
} {
  const file = new CandidateListTestFile(bytes);
  return { file, release: file.holdNextRead().release };
}

describe("candidate-list File admission", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses oversized metadata without reading or allocating the reported body", async () => {
    const file = new CandidateListTestFile(Uint8Array.of(1, 2, 3));
    // Inject only oversized metadata; no large allocation and no accepted malformed File.
    vi.spyOn(file, "size", "get").mockReturnValue(
      CandidateFileAdmission.parameters().encryptedBytes + 1,
    );
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const slice = vi.spyOn(file, "slice");
    const lists = new CandidateListImport();
    await expect(lists.open(file)).rejects.toThrow(/supported limit/u);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice).not.toHaveBeenCalled();
    expect(lists.count).toBe(0);
    expect(lists.inputs()).toEqual([]);
  });

  it("refuses a foreign header after a bounded prefix, without reading the body", async () => {
    const file = new CandidateListTestFile(Uint8Array.of(1, 2, 3));
    const body = vi.spyOn(file, "arrayBuffer");
    await expect(new CandidateListImport().open(file)).rejects.toThrow(/not a binary age file/u);
    expect(file.prefixSizes).toEqual([file.size]);
    expect(body).not.toHaveBeenCalled();
    expect(file.readsWiped).toBe(true);
  });

  it("reads and wipes only the policy prefix when inspecting a file larger than its header", async () => {
    const session = await createSessionIdentity();
    const encrypted = await encryptCandidates(plainList(), session.recipient);
    // Inspection authenticates no body. Padding grows this header fixture past the prefix bound.
    const bytes = new Uint8Array(CandidateFileAdmission.parameters().headerBytes + 1);
    bytes.set(encrypted);
    const file = new CandidateListTestFile(bytes);
    const body = vi.spyOn(file, "arrayBuffer");
    await expect(CandidateListImport.inspect(file)).resolves.toBe("key");
    expect(file.prefixSizes).toEqual([CandidateFileAdmission.parameters().headerBytes]);
    expect(body).not.toHaveBeenCalled();
    expect(file.readsWiped).toBe(true);
    expect(bytes.subarray(0, encrypted.length)).toEqual(encrypted);
  });

  it.each([-1, 1])("refuses a body whose returned size changed by %i byte", async (difference) => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(
      await encryptCandidates(plainList(), await lists.recipient()),
    );
    const changed = new Uint8Array(file.size + difference).fill(1);
    // Inject a changed File read; it must be refused, never admitted under its stale size.
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(changed.buffer);
    await expect(lists.open(file)).rejects.toThrow(/changed or ended/u);
    expect(changed.every((byte) => byte === 0)).toBe(true);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
  });

  it("opens a small valid File and wipes each returned prefix and body without changing it", async () => {
    const lists = new CandidateListImport();
    const encrypted = await encryptCandidates(plainList(), await lists.recipient());
    const original = encrypted.slice();
    const file = new CandidateListTestFile(encrypted);
    try {
      await expect(lists.open(file)).resolves.toEqual({ count: 2, passphrases: "none" });
      expect(file.prefixSizes).toEqual([
        Math.min(file.size, CandidateFileAdmission.parameters().headerBytes),
      ]);
      expect(file.buffers).toHaveLength(2);
      expect(file.readsWiped).toBe(true);
      expect(encrypted).toEqual(original);
    } finally {
      lists.clear();
    }
  });

  it("wipes and drops a list removed while its admitted body is being read", async () => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(
      await encryptCandidates(plainList(), await lists.recipient()),
    );
    const held = file.holdNextRead("body");
    const opening = lists.open(file);
    await held.started;
    lists.clear();
    held.release();
    await expect(opening).resolves.toBeUndefined();
    expect(file.buffers).toHaveLength(2);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
    expect(lists.inputs()).toEqual([]);
  });

  it("wipes authenticated plaintext when removal invalidates a pending decryption", async () => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(
      await encryptCandidates(plainList(), await lists.recipient()),
    );
    decryption.plain = undefined;
    const held = decryption.holdNext();
    const opening = lists.open(file);
    await held.started;
    lists.clear();
    held.release();
    await expect(opening).resolves.toBeUndefined();
    expect(decryption.plain).toBeDefined();
    expect(decryption.plain!.every((byte) => byte === 0)).toBe(true);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
  });

  it("lets the parser wipe authenticated bytes when their MNCL contents are refused", async () => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(
      await encryptCandidates(Uint8Array.of(1, 2, 3), await lists.recipient()),
    );
    decryption.plain = undefined;
    await expect(lists.open(file)).rejects.toThrow();
    expect(decryption.plain).toBeDefined();
    expect(decryption.plain!.every((byte) => byte === 0)).toBe(true);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
  });
});

describe("MnemoCode candidate list in the Scanner", () => {
  // scrypt at the fixed work factor takes about a second, so the passphrase list is made once.
  let passphraseFile: Uint8Array;
  beforeAll(async () => {
    passphraseFile = await encryptCandidatesWithPassphrase(plainList(), LIST_PASSPHRASE);
  });

  it("opens a list saved to this page's key, candidate N as MnemoCode numbers it", async () => {
    const lists = new CandidateListImport();
    const file = await encryptCandidates(plainList("TREZOR"), await lists.recipient());
    expect(CandidateListImport.lockOf(file)).toBe("key");
    expect(await lists.open(new Blob([file.slice()]))).toEqual({ count: 2, passphrases: "list" });
    const inputs = lists.inputs();
    expect(inputs.map((input) => [input.id, input.mnemonic, input.passphrase])).toEqual([
      ["candidate-1", PHRASES[0], "TREZOR"],
      ["candidate-2", PHRASES[1], "TREZOR"],
    ]);
    lists.clear();
    expect(lists.count).toBe(0);
    expect(lists.inputs()).toEqual([]);
  });

  it("opens a list saved under a passphrase, and refuses a wrong one", async () => {
    const lists = new CandidateListImport();
    expect(CandidateListImport.lockOf(passphraseFile)).toBe("passphrase");
    const wrong = heldFile(passphraseFile);
    wrong.release();
    await expect(lists.open(wrong.file, WRONG_LIST_PASSPHRASE)).rejects.toThrow(
      /This passphrase does not open/u,
    );
    expect(lists.count).toBe(0);
    expect(wrong.file.readsWiped).toBe(true);
    expect(await lists.open(new Blob([passphraseFile.slice()]), LIST_PASSPHRASE)).toEqual({
      count: 2,
      passphrases: "none",
    });
  });

  it("refuses a list saved for another key, and one before the key was shown", async () => {
    const other = await createSessionIdentity();
    const file = new Blob([(await encryptCandidates(plainList(), other.recipient)).slice()]);
    const lists = new CandidateListImport();
    await expect(lists.open(file)).rejects.toThrow(/no Scanner key yet/u);
    await lists.recipient();
    await expect(lists.open(file)).rejects.toThrow(/saved for another Scanner key/u);
    expect(() => CandidateListImport.lockOf(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("keeps nothing of a list removed while its file is read, and wipes the bytes", async () => {
    const lists = new CandidateListImport();
    const held = heldFile(await encryptCandidates(plainList(), await lists.recipient()));
    const opening = lists.open(held.file);
    lists.clear();
    held.release();
    expect(await opening).toBeUndefined();
    expect(lists.count).toBe(0);
    expect(lists.inputs()).toEqual([]);
    expect(held.file.readsWiped).toBe(true);
  });

  it("keeps nothing of a list removed while it is decrypted", async () => {
    const lists = new CandidateListImport();
    const held = decryption.holdNext();
    const opening = lists.open(new Blob([passphraseFile.slice()]), LIST_PASSPHRASE);
    await held.started;
    lists.clear();
    held.release();
    expect(await opening).toBeUndefined();
    expect(lists.count).toBe(0);
  });

  it("does not report the failure of a list removed while it is decrypted", async () => {
    const lists = new CandidateListImport();
    const held = decryption.holdNext();
    const opening = lists.open(new Blob([passphraseFile.slice()]), WRONG_LIST_PASSPHRASE);
    await held.started;
    lists.clear();
    held.release();
    expect(await opening).toBeUndefined();
    expect(lists.count).toBe(0);
  });

  it("keeps the newer list when an earlier open finishes after it", async () => {
    const lists = new CandidateListImport();
    const recipient = await lists.recipient();
    const earlier = heldFile(
      await encryptCandidates(plainList("list A", [PHRASES[1]!]), recipient),
    );
    const newer = new Blob([(await encryptCandidates(plainList("TREZOR"), recipient)).slice()]);
    const first = lists.open(earlier.file);
    expect(await lists.open(newer)).toEqual({ count: 2, passphrases: "list" });
    earlier.release();
    expect(await first).toBeUndefined();
    expect(lists.inputs().map((input) => [input.id, input.mnemonic, input.passphrase])).toEqual([
      ["candidate-1", PHRASES[0], "TREZOR"],
      ["candidate-2", PHRASES[1], "TREZOR"],
    ]);
    expect(earlier.file.readsWiped).toBe(true);
  });
});
