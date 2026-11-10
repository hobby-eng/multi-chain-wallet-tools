import { bytesToHex } from "@ckd/core/crypto.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { runChosenWordsSelfTest } from "@ckd/core/bip39-chosen-words.js";
import { nfkd } from "@ckd/core/unicode-nfkd.js";
import { expectEqual, now } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/** Runs in the UI bundle so the BIP39 wordlist is embedded exactly once. */
export function runBip39SelfTest(): CryptoSelfTestReport {
  const started = now();
  const seed = mnemonicToSeed(TEST_MNEMONIC, "TREZOR");
  try {
    expectEqual(
      "BIP39 PBKDF2 seed",
      bytesToHex(seed),
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553" +
        "1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    );
    // The Deriver's own NFKD of Unicode 18.0.0, whatever the browser's version: U+209D, which
    // Unicode 18.0.0 assigned (MHFE's specification names it), fullwidth letters, a Hangul
    // syllable and combining marks out of canonical order (Unicode's NormalizationTest.txt).
    expectEqual(
      "BIP39 passphrase NFKD (Unicode 18.0.0)",
      nfkd("\u209d ＴＲＥＺＯＲ 한 a\u0301\u0328"),
      "w TREZOR \u1112\u1161\u11ab a\u0328\u0301",
    );
    const normalized = mnemonicToSeed(TEST_MNEMONIC, "ＴＲＥＺＯＲ");
    try {
      expectEqual(
        "BIP39 seed of a normalized passphrase",
        bytesToHex(normalized),
        bytesToHex(seed),
      );
    } finally {
      normalized.fill(0);
    }
    // The generator's own checks: bit placement, predicates and known phrases, whose expected
    // values come from an independent oracle (bip39-chosen-words-boundaries.test.ts).
    runChosenWordsSelfTest();
    return {
      passed: true,
      checks: [
        "BIP39",
        "BIP39 passphrase NFKD (Unicode 18.0.0)",
        "BIP39 chosen words",
        "BIP39 chosen-word bit placement and readback (five lengths)",
        "BIP39 chosen-word checksum, predicates and refusals (five lengths)",
      ],
      durationMs: Math.round(now() - started),
    };
  } finally {
    seed.fill(0);
  }
}
