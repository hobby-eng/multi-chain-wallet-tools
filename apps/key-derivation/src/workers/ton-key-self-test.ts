// The known answer of a TON phrase's key, for the full self-test: 100,000 PBKDF2-SHA512 iterations
// are too slow for every startup, whose TON check covers the phrase check and the wallet contracts
// (packages/verification/src/derivation-self-test-ton.ts). The vector is ton-crypto's own
// (ton-org/ton-crypto src/mnemonic/mnemonic.spec.ts, read 2026-11-10): the secret key of its test
// phrase, the 32-byte seed and the public key.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { wipe } from "@ckd/core/crypto.js";
import { tonEntropy } from "@ckd/core/ton-mnemonic.js";
import { deriveTonStandard } from "@ckd/coins/ton/index.js";
import {
  TON_TEST_ADDRESSES,
  TON_TEST_PHRASE,
} from "../../../../packages/verification/src/derivation-self-test-ton.js";
import { expectEqual, now, resultValue } from "../../../../packages/verification/src/helpers.js";

const TON_TEST_SECRET_KEY =
  "9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97d" +
  "f6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd";

export function runTonKeyFullSelfTest(): CryptoSelfTestReport {
  const started = now();
  const seed = tonEntropy(TON_TEST_PHRASE);
  try {
    const result = deriveTonStandard({
      seed,
      network: "mainnet",
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    });
    try {
      expectEqual("TON phrase secret key", resultValue(result, "privateKey"), TON_TEST_SECRET_KEY);
      expectEqual("TON phrase W5 address", resultValue(result, "address"), TON_TEST_ADDRESSES.w5);
    } finally {
      clearDerivationResult(result);
    }
  } finally {
    wipe(seed);
  }
  return {
    passed: true,
    checks: ["TON phrase key · PBKDF2-SHA512, 100,000 iterations"],
    durationMs: Math.round(now() - started),
  };
}
