// One public all-zero BIP39 entropy: no providers, KDFs, files, wallets or bulk candidate search.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { mnclList } from "@ckd/test-support/mncl-list.js";
import { CandidateListImport } from "../src/candidate-list-import.js";
import { CandidateListTestFile } from "./candidate-list-file.js";

const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
/** MnemoCode's largest age file of a list (docs/CANDIDATES.md), above any plaintext list. */
const MAX_ENCRYPTED_BYTES = 155_292_688;
const file = () => new CandidateListTestFile(mnclList([{ phrase: PUBLIC_PHRASE }], "TREZOR"));

beforeAll(async () => {
  await loadMnemoCode();
});

describe("explicit plaintext MNCL import", () => {
  it("requires consent before reading any body and never falls back after an age refusal", async () => {
    const source = new CandidateListImport();
    const input = file();
    await expect(source.openPlaintext(input)).rejects.toThrow("Confirm");
    expect(input.buffers).toHaveLength(0);
    await expect(source.open(input)).rejects.toThrow();
    expect(source.count).toBe(0);
    expect(input.readsWiped).toBe(true);
  });

  it("delegates to MnemoCode's reader, preserves numbering/passphrases and wipes owned file bytes", async () => {
    const source = new CandidateListImport();
    const input = file();
    expect(await source.openPlaintext(input, true)).toEqual({ count: 1, passphrases: "list" });
    expect(source.inputs()).toEqual([
      {
        id: "candidate-1",
        label: "Candidate 1 · MnemoCode list",
        mnemonic: PUBLIC_PHRASE,
        passphrase: "TREZOR",
      },
    ]);
    expect(input.readsWiped).toBe(true);
    source.clear();
    expect(source.inputs()).toEqual([]);
  });

  it("rejects announced oversize before buffering", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const slice = vi.fn();
    const input = { size: MAX_ENCRYPTED_BYTES + 1, arrayBuffer, slice };
    await expect(new CandidateListImport().openPlaintext(input, true)).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice).not.toHaveBeenCalled();
  });

  it("wipes refused malformed bytes without retaining candidates", async () => {
    const encoded = mnclList([{ phrase: PUBLIC_PHRASE }]);
    encoded[0] = 0;
    const input = new CandidateListTestFile(encoded);
    const source = new CandidateListImport();
    await expect(source.openPlaintext(input, true)).rejects.toThrow();
    expect(source.count).toBe(0);
    expect(input.readsWiped).toBe(true);
  });

  it.each(["clear", "replace"])("drops an in-flight plaintext read after %s", async (action) => {
    const source = new CandidateListImport();
    const input = file();
    const held = input.holdNextRead("body");
    const opened = source.openPlaintext(input, true);
    await held.started;
    if (action === "clear") source.clear();
    else await source.openPlaintext(file(), true);
    held.release();
    expect(await opened).toBeUndefined();
    expect(input.readsWiped).toBe(true);
    expect(source.count).toBe(action === "clear" ? 0 : 1);
  });
});
