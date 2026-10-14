// One public all-zero BIP39 entropy: no providers, KDFs, files, wallets or bulk candidate search.
import { describe, expect, it, vi } from "vitest";
import { CandidateListImport } from "../src/candidate-list-import.js";
import { CandidateListTestFile } from "./candidate-list-file.js";
import {
  encodeCandidateList,
  MAX_CANDIDATE_LIST_BYTES,
} from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";

const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
const file = () =>
  new CandidateListTestFile(
    encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }], passphrase: "TREZOR" }),
  );

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

  it("delegates to the shared parser, preserves numbering/passphrases and wipes owned file bytes", async () => {
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
    const input = { size: MAX_CANDIDATE_LIST_BYTES + 1, arrayBuffer, slice };
    await expect(new CandidateListImport().openPlaintext(input, true)).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice).not.toHaveBeenCalled();
  });

  it("wipes refused malformed bytes without retaining candidates", async () => {
    const encoded = encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] });
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
