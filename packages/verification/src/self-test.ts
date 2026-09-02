import { runBip39SelfTest } from './bip39-self-test.js';
import { runDerivationSelfTest } from './derivation-self-test.js';
import type { CryptoSelfTestReport } from './types.js';

export type { CryptoSelfTestReport } from './types.js';

/** Complete report used by non-size-constrained tools and release verification. */
export async function runCryptoSelfTest(): Promise<CryptoSelfTestReport> {
  const bip39 = runBip39SelfTest();
  const derivation = await runDerivationSelfTest();
  return {
    passed: true,
    checks: [...bip39.checks, ...derivation.checks],
    durationMs: bip39.durationMs + derivation.durationMs,
  };
}
