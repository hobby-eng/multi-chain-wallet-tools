import { describe, expect, it } from "vitest";
import { MnemoCodeSearches } from "../../../packages/recovery-backup/src/mnemocode-search.js";

const noProgress = () => undefined;
const signal = new AbortController().signal;
const wallet = {
  evidence: {
    kind: "master-fingerprint" as const,
    value: "00000000",
    network: "mainnet" as const,
  },
  passphrase: "",
};

describe("AUD-022 MnemoCode search contracts", () => {
  it("keeps a completed date search with zero matches when a list was requested", async () => {
    const searches = new MnemoCodeSearches({
      checkFor: () => async () => ({ matched: false }),
    });
    const request = {
      // BIP39 all-zero entropy: abandon eleven times, then about.
      indexes: [...Array<number>(11).fill(0), 3],
      mode: "seedshift" as const,
      dates: "2?-09-2026",
      wallet,
    };
    const baseline = await searches.dates(request, noProgress, signal);
    expect(baseline.count).toBe(10);
    expect(baseline.matched).toBe(0);
    const listed = await searches.dates({ ...request, list: { kind: "none" } }, noProgress, signal);
    expect(listed.count).toBe(10);
    expect(listed.matched).toBe(0);
    expect(listed.list).toBeUndefined();
  });

  it("keeps a completed word search with no checksum-valid candidates", async () => {
    const searches = new MnemoCodeSearches({
      checkFor: () => async () => ({ matched: false }),
    });
    const request = {
      // Both last indexes 0 and 1 fail the checksum of all-zero entropy; it needs 3.
      text: `${"abandon ".repeat(11)}abandon|ability`,
      kind: "unknown-words" as const,
    };
    const baseline = await searches.words(request, noProgress, signal);
    expect(baseline.count).toBe(0);
    const listed = await searches.words({ ...request, list: { kind: "none" } }, noProgress, signal);
    expect(listed.count).toBe(0);
    expect(listed.list).toBeUndefined();
  });

  it("rejects a BIP39 list passphrase above 256 bytes before checking candidates", async () => {
    let checks = 0;
    const searches = new MnemoCodeSearches({
      checkFor: () => async () => {
        checks += 1;
        return { matched: false };
      },
    });
    await expect(
      searches.words(
        {
          text: `${"abandon ".repeat(11)}about|zoo`,
          kind: "unknown-words",
          wallet,
          list: { kind: "none" },
          listPassphrase: "x".repeat(257),
        },
        noProgress,
        signal,
      ),
    ).rejects.toThrow(/longer than 256 bytes/u);
    expect(checks).toBe(0);
  });
});
