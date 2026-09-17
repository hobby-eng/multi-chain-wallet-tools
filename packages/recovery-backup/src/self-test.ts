import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { runCodex32SelfTest } from './self-test-codex32.js';
import { runSeedQrSelfTest } from './self-test-seedqr.js';
import { runShamirSelfTest } from './self-test-shamir.js';
import { runSskrSelfTest } from './self-test-sskr.js';
import { runGordianEnvelopeSelfTest } from './self-test-gordian-envelope.js';
import { runSlip39SelfTest } from './self-test-slip39.js';

/** Exercises every recovery codec in the complete build. */
export function runRecoveryBackupSelfTest(): CryptoSelfTestReport {
  const reports = [
    runSeedQrSelfTest(),
    runSlip39SelfTest(),
    runShamirSelfTest(),
    runCodex32SelfTest(),
    runSskrSelfTest(),
    runGordianEnvelopeSelfTest(),
  ];
  if (reports.some((report) => report.passed !== true)) {
    throw new Error('A recovery codec self-test returned an unsuccessful report.');
  }
  return {
    passed: true,
    checks: reports.flatMap((report) => report.checks),
    durationMs: reports.reduce((sum, report) => sum + report.durationMs, 0),
  };
}
