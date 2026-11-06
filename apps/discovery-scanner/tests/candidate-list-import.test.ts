import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type MnemoCodeBinding } from "@ckd/recovery-backup/mnemocode-engine.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { mnclList } from "@ckd/test-support/mncl-list.js";
import { CandidateListImport } from "../src/candidate-list-import.js";
import { CandidateListTestFile } from "./candidate-list-file.js";

// Public BIP39 test phrases and synthetic list passphrases only.
const PHRASES = [
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
];
const LIST_PASSPHRASE = "public list passphrase";
const WRONG_LIST_PASSPHRASE = "another passphrase";
/** MnemoCode's limits (docs/CANDIDATES.md): the age header read for the lock, and an age file. */
const HEADER_BYTES = 64 * 1024;
const MAX_ENCRYPTED_BYTES = 155_292_688;

let mnemocode: MnemoCodeBinding;
beforeAll(async () => {
  mnemocode = await loadMnemoCode();
});

function plainList(passphrase?: string, phrases = PHRASES): Uint8Array {
  return mnclList(
    phrases.map((phrase) => ({ phrase })),
    passphrase,
  );
}

function toKey(list: Uint8Array, recipient: string): Uint8Array {
  return mnemocode.protectList(list, "key", recipient);
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

  it("preserves multiple leading BOMs when an explicitly admitted plaintext list opens", async () => {
    const passphrase = "﻿﻿TREZOR";
    const bytes = plainList(passphrase);
    const lists = new CandidateListImport();
    try {
      expect(await lists.openPlaintext(new CandidateListTestFile(bytes), true)).toEqual({
        count: 2,
        passphrases: "list",
      });
      expect(
        lists.inputs().map(({ mnemonic, passphrase: read }) => ({ mnemonic, passphrase: read })),
      ).toEqual(PHRASES.map((mnemonic) => ({ mnemonic, passphrase })));
    } finally {
      lists.clear();
      bytes.fill(0);
    }
    expect(lists.count).toBe(0);
  });

  it("refuses oversized metadata without reading or allocating the reported body", async () => {
    const file = new CandidateListTestFile(Uint8Array.of(1, 2, 3));
    // Inject only oversized metadata; no large allocation and no accepted malformed File.
    vi.spyOn(file, "size", "get").mockReturnValue(MAX_ENCRYPTED_BYTES + 1);
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
    const session = mnemocode.SessionIdentity.create();
    const encrypted = toKey(plainList(), session.recipient);
    // Inspection authenticates no body. Padding grows this header fixture past the prefix bound.
    const bytes = new Uint8Array(HEADER_BYTES + 1);
    bytes.set(encrypted);
    const file = new CandidateListTestFile(bytes);
    const body = vi.spyOn(file, "arrayBuffer");
    await expect(CandidateListImport.inspect(file)).resolves.toBe("key");
    expect(file.prefixSizes).toEqual([HEADER_BYTES]);
    expect(body).not.toHaveBeenCalled();
    expect(file.readsWiped).toBe(true);
    expect(bytes.subarray(0, encrypted.length)).toEqual(encrypted);
  });

  it.each([-1, 1])("refuses a body whose returned size changed by %i byte", async (difference) => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(toKey(plainList(), await lists.recipient()));
    const changed = new Uint8Array(file.size + difference).fill(1);
    // Inject a changed File read; it must be refused, never admitted under its stale size.
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(changed.buffer);
    await expect(lists.open(file)).rejects.toThrow(/changed while it was read/u);
    expect(changed.every((byte) => byte === 0)).toBe(true);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
  });

  it("opens a small valid File and wipes each returned prefix and body without changing it", async () => {
    const lists = new CandidateListImport();
    const encrypted = toKey(plainList(), await lists.recipient());
    const original = encrypted.slice();
    const file = new CandidateListTestFile(encrypted);
    try {
      await expect(lists.open(file)).resolves.toEqual({ count: 2, passphrases: "none" });
      expect(file.prefixSizes).toEqual([Math.min(file.size, HEADER_BYTES)]);
      expect(file.buffers).toHaveLength(2);
      expect(file.readsWiped).toBe(true);
      expect(encrypted).toEqual(original);
    } finally {
      lists.clear();
    }
  });

  it("wipes and drops a list removed while its admitted body is being read", async () => {
    const lists = new CandidateListImport();
    const file = new CandidateListTestFile(toKey(plainList(), await lists.recipient()));
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

  it("wipes authenticated bytes when their MNCL contents are refused", async () => {
    const lists = new CandidateListImport();
    const decrypt = vi.spyOn(mnemocode.SessionIdentity.prototype, "decrypt");
    const file = new CandidateListTestFile(toKey(Uint8Array.of(1, 2, 3), await lists.recipient()));
    await expect(lists.open(file)).rejects.toThrow();
    const plain = decrypt.mock.results[0]?.value as Uint8Array;
    expect(plain).toHaveLength(3);
    expect(plain.every((byte) => byte === 0)).toBe(true);
    expect(file.readsWiped).toBe(true);
    expect(lists.count).toBe(0);
  });
});

describe("MnemoCode candidate list in the Scanner", () => {
  // scrypt at the fixed work factor takes about a second, so the passphrase list is made once.
  let passphraseFile: Uint8Array;
  beforeAll(() => {
    passphraseFile = mnemocode.protectList(plainList(), "passphrase", LIST_PASSPHRASE);
  });

  it("opens a list saved to this page's key, candidate N as MnemoCode numbers it", async () => {
    const lists = new CandidateListImport();
    const file = toKey(plainList("TREZOR"), await lists.recipient());
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
    const other = mnemocode.SessionIdentity.create();
    const file = new Blob([toKey(plainList(), other.recipient).slice()]);
    const lists = new CandidateListImport();
    await expect(lists.open(file)).rejects.toThrow(/no Scanner key yet/u);
    await lists.recipient();
    await expect(lists.open(file)).rejects.toThrow(/saved for another Scanner key/u);
    expect(() => CandidateListImport.lockOf(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("refuses a list saved to a key that the page has ended", async () => {
    const lists = new CandidateListImport();
    const file = new Blob([toKey(plainList(), await lists.recipient()).slice()]);
    lists.end();
    await lists.recipient();
    await expect(lists.open(file)).rejects.toThrow(/saved for another Scanner key/u);
  });

  it("keeps nothing of a list removed while its file is read, and wipes the bytes", async () => {
    const lists = new CandidateListImport();
    const held = heldFile(toKey(plainList(), await lists.recipient()));
    const opening = lists.open(held.file);
    lists.clear();
    held.release();
    expect(await opening).toBeUndefined();
    expect(lists.count).toBe(0);
    expect(lists.inputs()).toEqual([]);
    expect(held.file.readsWiped).toBe(true);
  });

  it("keeps the newer list when an earlier open finishes after it", async () => {
    const lists = new CandidateListImport();
    const recipient = await lists.recipient();
    const earlier = heldFile(toKey(plainList("list A", [PHRASES[1]!]), recipient));
    const newer = new Blob([toKey(plainList("TREZOR"), recipient).slice()]);
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
