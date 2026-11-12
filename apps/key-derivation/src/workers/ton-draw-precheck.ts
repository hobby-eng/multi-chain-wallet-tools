// TON's check as the precheck of the wallet-check draw (wallet-check-draw-job.ts), so that a
// phrase the Telegram wallet accepts can also pass the MHFE wallet check. A TON module
// (tooling/single-key-coins.mjs TON_PHRASE_MODULES): a build without TON resolves this file to
// no-ton-draw-precheck.ts (tooling/key-derivation-composition.mjs).
import type { DrawPrecheck } from "@ckd/core/bip39-wallet-check.js";
import type { Pbkdf2Sha512 } from "@ckd/core/pbkdf2-sha512.js";
import { passesTonCheckBy, runTonCheckSelfTest, TON_CHECK_BITS } from "@ckd/core/ton-mnemonic.js";

/** TON's check by the worker's engine `derive`, once it has given its known answers. */
export async function tonDrawPrecheck(derive: Pbkdf2Sha512): Promise<DrawPrecheck> {
  await runTonCheckSelfTest(derive);
  return {
    passes: (phrase) => passesTonCheckBy(phrase, derive),
    expectedDraws: 2 ** TON_CHECK_BITS,
  };
}
