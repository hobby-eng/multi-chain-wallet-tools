import { runBip39SelfTest } from '@ckd/bip39-self-test';
import { runDashDerivationSelfTest } from '@ckd/dash-derivation-self-test';
import { createRecoverySelfTest } from './recovery-self-test.js';

export const runRecoverySelfTest = createRecoverySelfTest(async () => {
  const bip39 = runBip39SelfTest();
  const derivation = await runDashDerivationSelfTest();
  return {
    passed: true,
    checks: [...bip39.checks, ...derivation.checks],
    durationMs: bip39.durationMs + derivation.durationMs,
  };
});
