import { combinedReports } from "@ckd/verification/helpers.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { runCodex32SelfTest } from "./self-test-codex32.js";
import { runSeedQrSelfTest } from "./self-test-seedqr.js";
import { runSskrSelfTest } from "./self-test-sskr.js";
import { runGordianEnvelopeSelfTest } from "./self-test-gordian-envelope.js";
import { runSlip39SelfTest } from "./self-test-slip39.js";
import { runMnemoCodeSelfTest } from "./self-test-mnemocode.js";
import { runMnemoCodeHeirsSelfTest } from "./self-test-mnemocode-heirs.js";
import { runMnemoCodeShareCardsSelfTest } from "./self-test-mnemocode-share-cards.js";

/** Exercises every recovery codec in the complete build. */
export function runRecoveryBackupSelfTest(): CryptoSelfTestReport {
  const reports = [
    runSeedQrSelfTest(),
    runMnemoCodeSelfTest(),
    runMnemoCodeHeirsSelfTest(),
    runMnemoCodeShareCardsSelfTest(),
    runSlip39SelfTest(),
    runCodex32SelfTest(),
    runSskrSelfTest(),
    runGordianEnvelopeSelfTest(),
  ];
  return combinedReports(reports);
}
