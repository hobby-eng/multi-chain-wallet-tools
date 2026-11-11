import { combinedReports } from "@ckd/verification/helpers.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { runCodex32SelfTest } from "./self-test-codex32.js";
import { runSeedQrSelfTest } from "./self-test-seedqr.js";
import { runDecoyQrTextSelfTest } from "./self-test-decoy-qr-text.js";
import { runSskrSelfTest } from "./self-test-sskr.js";
import { runGordianEnvelopeSelfTest } from "./self-test-gordian-envelope.js";
import { runSlip39SelfTest } from "./self-test-slip39.js";
import { runMnemoCodeSelfTest } from "./self-test-mnemocode.js";
import { runMnemoCodeCardsSelfTest } from "./self-test-mnemocode-cards.js";

/** Exercises every recovery codec in the complete build. */
export async function runRecoveryBackupSelfTest(): Promise<CryptoSelfTestReport> {
  const reports = [
    runSeedQrSelfTest(),
    runDecoyQrTextSelfTest(),
    await runMnemoCodeSelfTest(),
    await runMnemoCodeCardsSelfTest(),
    runSlip39SelfTest(),
    runCodex32SelfTest(),
    runSskrSelfTest(),
    runGordianEnvelopeSelfTest(),
  ];
  return combinedReports(reports);
}
