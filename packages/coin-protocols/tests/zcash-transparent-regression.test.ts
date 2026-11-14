// The transparent Zcash tab as it was before Zcash's Sapling variant joined the coin: its adapter,
// its rows and summary for the public "abandon … about" seed, and the adapters its message signing
// admits, byte for byte. Each SHA-256 below was taken at commit 8acde63, where Zcash had no other
// variant; a change to any of them is a change to the transparent tab.
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes, sha256 } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { ZCASH_COIN_ADAPTERS } from "../src/coins/adapters/zcash.js";
import { zcashDerivation } from "../src/coins/zcash/index.js";
import { ZCASH_MESSAGE_SIGNING } from "../src/coins/zcash/message-signing.js";
import { ZCASH_PROFILES } from "../src/coins/zcash/profiles.js";

/** The BIP39 seed of "abandon abandon … about" without a passphrase (BIP39's first vector). */
const SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

const digest = (value: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));

describe("the transparent Zcash tab", () => {
  it("keeps its adapter as it was", () => {
    const adapter = ZCASH_COIN_ADAPTERS.find(({ id }) => id === "zcash");
    if (adapter === undefined) throw new Error("No transparent Zcash adapter.");
    const previews = [
      { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
      { network: "mainnet", account: 7, branch: 1, start: 5, count: 1 },
    ] as const;
    // JSON leaves the adapter's pathPreview function out; its previews stand for it.
    expect(
      digest({ facts: adapter, previews: previews.map((input) => adapter.pathPreview(input)) }),
    ).toBe("bb213668e0246c2d359cbb7bf7f0ca879c367451e52f419db2732539f586b0d3");
    expect(ZCASH_PROFILES.map(({ adapterId }) => adapterId)).toEqual(["zcash"]);
  });

  it.each([
    {
      input: { account: 0, branch: 0, start: 0, count: 5 },
      sha256: "5d10ac7431a38e9f59e2585d81bdf820021854035cde478a5136fa96a312dab6",
    },
    {
      input: { account: 0, branch: 1, start: 0, count: 2 },
      sha256: "f8b300946987a68f2dc136029dbcc10f65fc234351904938f56ff4d7b873d527",
    },
    {
      input: { account: 3, branch: 0, start: 100, count: 2 },
      sha256: "3b1248bc78e3a647047a6b722b1463239186424f0f3e210a46255acb6d5eff08",
    },
  ])("keeps its rows and summary of $input", ({ input, sha256: expected }) => {
    const derive = zcashDerivation("zcash");
    if (derive === undefined) throw new Error("The transparent tab is not derived.");
    const result = derive({ seed: hexToBytes(SEED), network: "mainnet", ...input });
    try {
      expect(digest(result)).toBe(expected);
    } finally {
      clearDerivationResult(result);
    }
  });

  it("signs messages for the transparent tab only", () => {
    expect(ZCASH_MESSAGE_SIGNING.formats).toEqual({ "zcash-compact": ["zcash"] });
  });
});
