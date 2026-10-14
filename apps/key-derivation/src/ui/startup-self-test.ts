import { checkSecureRandom } from "@ckd/core/secure-random.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";

/** The check of the randomness source that new phrases and passwords are drawn from. */
const RANDOMNESS_CHECK = "Web Crypto randomness health";

interface StartupSelfTestDependencies {
  readonly runBip39SelfTest: typeof import("@ckd/bip39-self-test").runBip39SelfTest;
  readonly runRecoveryBackupSelfTest: typeof import("@ckd/recovery-backup/self-test.js").runRecoveryBackupSelfTest;
  readonly createWorker: () => DerivationWorkerClient;
}

interface StartupSelfTestReport {
  readonly passed: boolean;
  readonly checks: readonly string[];
  readonly durationMs: number;
}

/**
 * Runs every cryptographic startup check and always releases its worker. With `full` (the full
 * self-test that the person starts), the worker adds the slower known answers of its features.
 */
export async function runStartupSelfTests(
  dependencies: StartupSelfTestDependencies,
  full = false,
): Promise<StartupSelfTestReport> {
  const worker = dependencies.createWorker();
  try {
    const started = performance.now();
    checkSecureRandom();
    const randomnessMs = Math.round(performance.now() - started);
    const bip39 = dependencies.runBip39SelfTest();
    const recovery = dependencies.runRecoveryBackupSelfTest();
    const derivation = await worker.selfTest(full);
    return {
      passed: bip39.passed && recovery.passed && derivation.passed,
      checks: [RANDOMNESS_CHECK, ...bip39.checks, ...recovery.checks, ...derivation.checks],
      durationMs: randomnessMs + bip39.durationMs + recovery.durationMs + derivation.durationMs,
    };
  } finally {
    worker.terminate(new DerivationCancelledError("Startup self-test worker released."));
  }
}
