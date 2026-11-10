import { mnemonicToSeedSync } from "@scure/bip39";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import {
  bip39Seed,
  drawWalletCheckPhrase,
  passesWalletCheck,
  RECOMMENDED_RANDOM_BITS,
  runWalletCheckSelfTest,
  walletCheckDigest,
  walletCheckOdds,
} from "../src/bip39-wallet-check.js";

// The published vectors of MHFE-WALLET-CHECK-SEED-1 (mhfe_spec vectors/profiles/wallet-check.json):
// public phrases of 192 zero bits and a counter, with the empty passphrase and "TREZOR".
const ABOVE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon above proof fatigue";
const ABSORB =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon absorb another spoil";
const CASES = [
  {
    phrase: ABOVE,
    passphrase: "TREZOR",
    digest: "0000e86481bdfe6dbf45e6e41fba4f309fcf09d3f0af2fe3f46736c663840853",
    passes: true,
  },
  {
    phrase: ABSORB,
    passphrase: "",
    digest: "0000ede77b44fbd62025e1d36a45ebe3846cf48f7b3e76ca6a91495fdadc1fb2",
    passes: true,
  },
  {
    phrase: ABOVE,
    passphrase: "",
    digest: "ebd07f7120cfeb611077221ca20da98c6bef15e72f0cbfd2ef2c6c6514ad7ddb",
    passes: false,
  },
  {
    phrase: ABSORB,
    passphrase: "TREZOR",
    digest: "8d2b97fb997a034302b996efea1a302ce3721b645ed056c5304c3c327fb77df4",
    passes: false,
  },
] as const;

describe("MHFE-WALLET-CHECK-SEED-1 in the Deriver", () => {
  it.each(CASES)("gives the published digest of $phrase with $passphrase", async (vector) => {
    const seed = await bip39Seed(vector.phrase, vector.passphrase);
    expect(bytesToHex(seed)).toBe(bytesToHex(mnemonicToSeedSync(vector.phrase, vector.passphrase)));
    expect(bytesToHex(walletCheckDigest(seed))).toBe(vector.digest);
    expect(passesWalletCheck(seed)).toBe(vector.passes);
  });

  it("passes its own check against the published vector", () => {
    expect(() => runWalletCheckSelfTest()).not.toThrow();
  });

  it("rates what wishes and the check keep, as MHFE did", () => {
    expect(walletCheckOdds({ wordCount: 24, chosen: [], neverUse: [] })).toEqual({
      randomBits: RECOMMENDED_RANDOM_BITS,
      randomness: "ample",
      fixedPosition: false,
    });
    const fixed = walletCheckOdds({
      wordCount: 24,
      chosen: [{ word: "zoo", position: 3 }],
      neverUse: [],
    });
    expect(fixed).toMatchObject({ randomness: "notRecommended", fixedPosition: true });
    expect(fixed.randomBits).toBeCloseTo(229, 0);
  });

  it("takes the first drawn phrase that passes, and only one that passes", async () => {
    // The vectors' entropies, 192 zero bits and a counter, as the random source's first draws:
    // "absorb another spoil" fails with TREZOR, "above proof fatigue" passes.
    const entropies = [0x18266, 0x12b12].map((counter) => {
      const entropy = new Uint8Array(32);
      new DataView(entropy.buffer).setUint32(28, counter);
      return entropy;
    });
    // Two different probes first, as the draw checks its source before drawing.
    let calls = -2;
    const randomBytes = (length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      if (calls < 0) bytes.fill(calls + 3);
      else bytes.set(entropies[calls] ?? new Uint8Array(32));
      calls += 1;
      return bytes;
    };
    const tried: number[] = [];
    const phrase = await drawWalletCheckPhrase(
      { wordCount: 24, chosen: [], neverUse: [] },
      "TREZOR",
      {
        randomBytes,
        onDraws: (draws) => tried.push(draws),
      },
    );
    expect(phrase).toBe(ABOVE);
    expect(calls).toBe(2);
    expect(tried).toEqual([2]);
  });

  it("refuses a random source that gives the same bytes twice", async () => {
    await expect(
      drawWalletCheckPhrase({ wordCount: 24, chosen: [], neverUse: [] }, "public", {
        randomBytes: (length) => new Uint8Array(length),
      }),
    ).rejects.toMatchObject({ code: "wallet.wallet-check.random" });
  });

  it("draws 24-word phrases only, and stops when asked", async () => {
    await expect(
      drawWalletCheckPhrase({ wordCount: 12, chosen: [], neverUse: [] }, "public"),
    ).rejects.toThrow("24-word phrases only");
    const stop = new AbortController();
    stop.abort(new Error("stopped"));
    await expect(
      drawWalletCheckPhrase({ wordCount: 24, chosen: [], neverUse: [] }, "public", {
        signal: stop.signal,
      }),
    ).rejects.toThrow("stopped");
  });
});
