// The public-input guard's known answers as one report of the Scanner's startup self-test, for
// builds that offer watch-only discovery next to seed discovery: the guard screens every typed
// public key and address before a lookup can be sent (packages/wallet-recovery/src/watch-only.ts).
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { runPublicInputGuardSelfTest } from "@ckd/secret-boundary/public-input-guard-self-test.js";

export function runPublicInputGuardStartupCheck(): CryptoSelfTestReport {
  const started = performance.now();
  const checks = [...runPublicInputGuardSelfTest()];
  return { passed: true, checks, durationMs: Math.round(performance.now() - started) };
}
