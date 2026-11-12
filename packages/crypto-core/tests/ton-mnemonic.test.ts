import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { javascriptPbkdf2Sha512, webCryptoPbkdf2Sha512 } from "../src/pbkdf2-sha512.js";
import {
  passesTonCheck,
  passesTonCheckBy,
  runTonCheckSelfTest,
  TON_CHECK_KNOWN_ANSWERS,
  TON_TEST_PHRASE,
} from "../src/ton-mnemonic.js";

// Public test data only: ton-crypto's test phrase, the all-zero 24-word BIP39 phrase, and the
// synthetic BIP39 phrase of SHA-256("wallet-tools TON test 433"), the first of that series to pass
// TON's check (apps/key-derivation/tests/ton-phrase-feature.test.ts).
const BOTH =
  "theme bubble daring setup grass park apart mountain orbit donate mosquito indicate lonely history strategy produce demand rookie demise myth flower length occur carry";

/** The public BIP39 phrase of entropy SHA-256(`label`). */
const phraseOf = (label: string): string =>
  entropyToMnemonic(createHash("sha256").update(label).digest(), wordlist);

/** 200 public phrases, about one of which passes: the phrases of SHA-256("ton fast check <i>"). */
const SERIES = Array.from({ length: 200 }, (_, index) => phraseOf(`ton fast check ${index}`));

/**
 * Twenty public phrases that pass TON's check, so that a check that refuses too much is seen: the
 * first twenty counters i whose phrase of SHA-256("ton check vector <i>") passes by Node's own
 * HMAC-SHA512 and PBKDF2-SHA512, the independent oracle below. Found on 2026-11-12 by trying
 * i = 0, 1, … in order: 3,704 tries, 1.0 s on one core.
 */
const PASSING_COUNTERS = [
  274, 567, 732, 967, 991, 995, 1171, 1330, 1455, 1609, 1844, 2082, 2232, 2368, 2729, 2814, 3034,
  3669, 3683, 3703,
];

/** TON's check by Node's crypto (ton-crypto's isBasicSeed), independent of the page's code. */
function nodePassesTon(phrase: string): boolean {
  const entropy = createHmac("sha512", Buffer.from(phrase, "utf8")).digest();
  return pbkdf2Sync(entropy, "TON seed version", 390, 64, "sha512")[0] === 0;
}

const ENGINES = [
  ["WebCrypto", webCryptoPbkdf2Sha512],
  ["JavaScript", javascriptPbkdf2Sha512],
] as const;

describe("TON's check in the draw", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ENGINES)(
    "gives the known answers both ways by %s, as ton-crypto does",
    async (_, derive) => {
      expect(TON_CHECK_KNOWN_ANSWERS.map(({ phrase }) => phrase)).toContain(TON_TEST_PHRASE);
      for (const { phrase, passes } of TON_CHECK_KNOWN_ANSWERS) {
        expect(passesTonCheck(phrase)).toBe(passes);
        expect(await passesTonCheckBy(phrase, derive)).toBe(passes);
      }
      await expect(runTonCheckSelfTest(derive)).resolves.toBeUndefined();
    },
  );

  it.each(ENGINES)(
    "passes twenty public TON phrases by %s, as Node's oracle does",
    async (_, derive) => {
      expect(await passesTonCheckBy(BOTH, derive)).toBe(true);
      for (const counter of PASSING_COUNTERS) {
        const phrase = phraseOf(`ton check vector ${counter}`);
        expect(nodePassesTon(phrase)).toBe(true);
        expect(passesTonCheck(phrase)).toBe(true);
        expect(await passesTonCheckBy(phrase, derive)).toBe(true);
      }
      // The counter before the first that passes does not.
      expect(await passesTonCheckBy(phraseOf("ton check vector 273"), derive)).toBe(false);
    },
  );

  it("agrees with the JavaScript check on 200 public phrases by either engine", async () => {
    const expected = SERIES.map((phrase) => passesTonCheck(phrase));
    for (const [, derive] of ENGINES)
      expect(await Promise.all(SERIES.map((phrase) => passesTonCheckBy(phrase, derive)))).toEqual(
        expected,
      );
  });

  it("checks by JavaScript where the browser has no WebCrypto", async () => {
    // TON's check draws no randomness: a crypto object without subtle is enough.
    vi.stubGlobal("crypto", {});
    expect(await passesTonCheckBy(TON_TEST_PHRASE, webCryptoPbkdf2Sha512)).toBe(true);
    expect(await passesTonCheckBy(`${"abandon ".repeat(23)}art`, webCryptoPbkdf2Sha512)).toBe(
      false,
    );
  });
});
