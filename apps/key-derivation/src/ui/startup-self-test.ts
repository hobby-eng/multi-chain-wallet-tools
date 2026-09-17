import { DerivationCancelledError, type DerivationWorkerClient } from '../workers/derive-client.js';

interface StartupSelfTestDependencies {
  readonly runBip39SelfTest: typeof import('@ckd/bip39-self-test').runBip39SelfTest;
  readonly runRecoveryBackupSelfTest: typeof import('@ckd/recovery-backup/self-test.js').runRecoveryBackupSelfTest;
  readonly createWorker: () => DerivationWorkerClient;
}

interface StartupSelfTestReport {
  readonly passed: boolean;
  readonly checks: readonly string[];
  readonly durationMs: number;
}

/** Runs every cryptographic startup check and always releases its worker. */
export async function runStartupSelfTests(dependencies: StartupSelfTestDependencies): Promise<StartupSelfTestReport> {
  const worker = dependencies.createWorker();
  try {
    const bip39 = dependencies.runBip39SelfTest();
    const recovery = dependencies.runRecoveryBackupSelfTest();
    const derivation = await worker.selfTest();
    return {
      passed: bip39.passed && recovery.passed && derivation.passed,
      checks: [...bip39.checks, ...recovery.checks, ...derivation.checks],
      durationMs: bip39.durationMs + recovery.durationMs + derivation.durationMs,
    };
  } finally {
    worker.terminate(new DerivationCancelledError('Startup self-test worker released.'));
  }
}
