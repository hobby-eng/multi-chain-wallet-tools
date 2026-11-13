import { mnemonicToEntropy, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { checkedDrawOdds } from "../src/bip39-chosen-words.js";
import {
  bip39Seed,
  drawWalletCheckPhrase,
  passesWalletCheck,
  runWalletCheckSelfTest,
  WALLET_CHECK_BITS,
  walletCheckDigest,
} from "../src/bip39-wallet-check.js";
import { javascriptPbkdf2Sha512 } from "../src/pbkdf2-sha512.js";
import { passesTonCheck, passesTonCheckBy, TON_CHECK_BITS } from "../src/ton-mnemonic.js";

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

  it("rates what wishes and the check keep, as MHFE did: 240 bits with the check alone", () => {
    expect(checkedDrawOdds({ wordCount: 24, chosen: [], neverUse: [] }, WALLET_CHECK_BITS)).toEqual(
      { randomBits: 240, recommendedBits: 240, randomness: "ample", fixedPosition: false },
    );
    const fixed = checkedDrawOdds(
      { wordCount: 24, chosen: [{ word: "zoo", position: 3 }], neverUse: [] },
      WALLET_CHECK_BITS,
    );
    expect(fixed).toMatchObject({ randomness: "notRecommended", fixedPosition: true });
    expect(fixed.randomBits).toBeCloseTo(229, 0);
    // With TON's 8 bits too, only wishes make the phrase not recommended.
    expect(
      checkedDrawOdds({ wordCount: 24, chosen: [], neverUse: [] }, WALLET_CHECK_BITS + 8),
    ).toMatchObject({ randomBits: 232, recommendedBits: 232, randomness: "ample" });
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
    expect(tried).toEqual([1, 2]);
  });
});

describe("the wallet-check draw with a precheck", () => {
  it("tries the precheck first and takes only a phrase that passes both", async () => {
    // Every draw is "above proof fatigue", which passes the wallet check with TREZOR; the stub
    // precheck refuses the first two, so the third is taken.
    const above = new Uint8Array(32);
    new DataView(above.buffer).setUint32(28, 0x12b12);
    let calls = -2;
    const randomBytes = (length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      if (calls < 0) bytes.fill(calls + 3);
      else for (let offset = 0; offset < length; offset += 32) bytes.set(above, offset);
      calls += 1;
      return bytes;
    };
    const passes = vi.fn(async (phrase: string) => {
      expect(phrase).toBe(ABOVE);
      return passes.mock.calls.length > 2;
    });
    const phrase = await drawWalletCheckPhrase(
      { wordCount: 24, chosen: [], neverUse: [] },
      "TREZOR",
      { randomBytes, precheck: { passes, expectedDraws: 256 } },
    );
    expect(phrase).toBe(ABOVE);
    expect(passes).toHaveBeenCalledTimes(3);
  });

  it("stops between phrases when the precheck keeps refusing, after counting each draw", async () => {
    const stop = new AbortController();
    const tried: number[] = [];
    const passes = vi.fn(async () => false);
    await expect(
      drawWalletCheckPhrase({ wordCount: 24, chosen: [], neverUse: [] }, "public", {
        precheck: { passes, expectedDraws: 256 },
        onDraws: (draws) => {
          tried.push(draws);
          if (draws === 5) stop.abort(new Error("stopped"));
        },
        signal: stop.signal,
      }),
    ).rejects.toThrow("stopped");
    expect(tried).toEqual([1, 2, 3, 4, 5]);
    expect(passes).toHaveBeenCalledTimes(5);
  });

  it("draws a phrase that passes TON's check and the wallet check, with TON's check first", async () => {
    // A public combined vector. BOTH passes TON's check (ton-mnemonic.test.ts); with a passphrase
    // it passes the wallet check once in 65,536 passphrases, so a public test passphrase was
    // searched instead of a phrase: "TON wallet check 0", "… 1", …
    // in order, each BIP39 seed by Node's crypto.pbkdf2Sync(phrase, "mnemonic" + passphrase,
    // 2048, 64, "sha512") and its digest by Node's SHA-256 over the profile's tag, BE32(256) and
    // the seed, until the digest began with two zero bytes. "TON wallet check 23613" was the first:
    // 23,614 tries, 18.8 s on one core of a test laptop (2026-11-12). Its digest is
    // 000001e3d5f8…, and every value here is recomputed by the page's own code.
    const both =
      "theme bubble daring setup grass park apart mountain orbit donate mosquito indicate lonely history strategy produce demand rookie demise myth flower length occur carry";
    const passphrase = "TON wallet check 23613";
    const seed = await bip39Seed(both, passphrase);
    expect(bytesToHex(walletCheckDigest(seed))).toBe(
      "000001e3d5f85581a528d0855191a0a024ba81a5b3f0ec244ce523138c94100f",
    );
    expect(passesWalletCheck(seed)).toBe(true);
    expect(passesWalletCheck(await bip39Seed(both, "TREZOR"))).toBe(false);
    // "above proof fatigue" passes the wallet check with TREZOR but not TON's check.
    expect(passesTonCheck(ABOVE)).toBe(false);
    // The draw's first phrases are both's entropy; TON's check runs before each seed.
    const entropy = mnemonicToEntropy(both, wordlist);
    let calls = -2;
    const randomBytes = (length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      if (calls < 0) bytes.fill(calls + 3);
      else for (let offset = 0; offset < length; offset += 32) bytes.set(entropy, offset);
      calls += 1;
      return bytes;
    };
    const order: string[] = [];
    const drawn = await drawWalletCheckPhrase(
      { wordCount: 24, chosen: [{ word: "bubble", position: 2 }], neverUse: [] },
      passphrase,
      {
        randomBytes,
        precheck: {
          passes: async (phrase) => {
            order.push(phrase);
            return passesTonCheckBy(phrase, javascriptPbkdf2Sha512);
          },
          expectedDraws: 2 ** TON_CHECK_BITS,
        },
        // A worker that computes in JavaScript, as every thread past the first two does.
        derive: javascriptPbkdf2Sha512,
      },
    );
    expect(drawn).toBe(both);
    expect(order).toEqual([both]);
  });
});

describe("the wallet-check draw's refusals", () => {
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
