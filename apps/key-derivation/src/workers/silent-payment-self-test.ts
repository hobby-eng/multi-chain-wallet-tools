// BIP352 Silent Payment derivation of the public BIP39 test phrase's seed, checked before the page derives
// any Silent Payment address: the scan and spend paths and the receiving and change addresses of
// account 0. The addresses were checked against the specification's encoding when the feature was
// added (tests/silent-payment.test.ts). The worker holds no word list, so the seed is given as BIP39
// computes it. Public test data only.
import { hexToBytes } from "@ckd/core/crypto.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { expectEqual, now } from "../../../../packages/verification/src/helpers.js";
import { deriveSilentPayment } from "./silent-payment.js";

/** The BIP39 seed of "abandon … about" with an empty passphrase. */
const PUBLIC_SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

export async function runSilentPaymentSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const seed = hexToBytes(PUBLIC_SEED);
  try {
    const result = await deriveSilentPayment(seed, "mainnet", 0);
    expectEqual("Silent Payment scan path", result.scanPath, "m/352'/0'/0'/1'/0");
    expectEqual("Silent Payment spend path", result.spendPath, "m/352'/0'/0'/0'/0");
    expectEqual(
      "Silent Payment address",
      result.address,
      "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g",
    );
    expectEqual(
      "Silent Payment change address",
      result.changeAddress,
      "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqc7cztt86v30fp7s8rdq99v4vxl5vs4r6naeha9dgwu38c2aszwlqdmad77",
    );
  } finally {
    seed.fill(0);
  }
  return {
    passed: true,
    checks: ["Silent Payments / BIP352"],
    durationMs: Math.round(now() - started),
  };
}
