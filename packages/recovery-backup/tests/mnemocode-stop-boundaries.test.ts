import { describe, expect, it } from "vitest";
import { CandidateListWriter, MnemoCodeSearches } from "../src/mnemocode-search.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const WALLET = {
  evidence: { kind: "master-fingerprint" as const, value: "73c5da0a", network: "mainnet" as const },
  passphrase: "",
};

describe("MnemoCode stopped search publication", () => {
  it("returns a stop before parsing rather than a refusal or empty completed result", async () => {
    const stop = AbortSignal.abort(new Error("synthetic private reason"));
    const searches = new MnemoCodeSearches({ checkFor: () => () => ({ matched: false }) });
    await expect(
      searches.words({ text: PHRASE, kind: "unknown-words" }, () => undefined, stop),
    ).resolves.toMatchObject({ stopped: true, shown: [], listFull: false, listEmpty: false });
    await expect(
      searches.missingCodes(
        { text: "invalid", format: "english", mode: "direct", way: "list" },
        () => undefined,
        stop,
      ),
    ).resolves.toEqual({ kind: "stopped" });
  });

  it("does not publish partial words or a candidate file after a wallet callback stops", async () => {
    const abort = new AbortController();
    const searches = new MnemoCodeSearches({
      checkFor: () => () => {
        abort.abort();
        return { matched: true };
      },
    });
    const text = `${"abandon ".repeat(11)}about|zoo`;
    const outcome = await searches.words(
      { text, kind: "unknown-words", wallet: WALLET, list: { kind: "none" } },
      () => undefined,
      abort.signal,
    );
    expect(outcome).toMatchObject({ stopped: true, shown: [] });
    expect(outcome.list).toBeUndefined();
  });

  it("wipes a candidate buffer completed after a stop while preserving current publication", () => {
    const bytes = Uint8Array.of(11, 23, 47);
    const listed = {
      listFull: false,
      listEmpty: false,
      list: { bytes, description: "synthetic list", encrypted: false, records: 1 },
    };
    expect(CandidateListWriter.current(listed, new AbortController().signal)).toBe(true);
    expect([...bytes]).toEqual([11, 23, 47]);
    expect(CandidateListWriter.current(listed, AbortSignal.abort())).toBe(false);
    expect([...bytes]).toEqual([0, 0, 0]);
  });

  it("returns a stopped date assessment without a question or completed candidate list", async () => {
    const abort = new AbortController();
    const searches = new MnemoCodeSearches({
      checkFor: () => () => {
        abort.abort();
        return { matched: false };
      },
    });
    const outcome = await searches.dates(
      {
        indexes: [...Array<number>(11).fill(0), 3],
        mode: "seedshift",
        dates: "2?-09-2026",
        wallet: WALLET,
        list: { kind: "none" },
      },
      () => undefined,
      abort.signal,
    );
    expect(outcome).toMatchObject({ stopped: true });
    expect(outcome).not.toHaveProperty("list");
    expect(outcome).not.toHaveProperty("question");
  });
});
