import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { createCkdShamirShares, recoverCkdShamirShares, type CkdShamirShareFormat } from './shamir.js';
import { expectBytes, now } from './self-test-helpers.js';

export function runShamirSelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes('5bbd9d71a8ec7990831aff359d426545');
  const checks: string[] = [];
  try {
    for (const format of ['raw', 'words'] as const satisfies readonly CkdShamirShareFormat[]) {
      const generated = createCkdShamirShares(secret, 2, 3, format);
      const recovered = recoverCkdShamirShares([generated.shares[0]!, generated.shares[2]!], format);
      try {
        expectBytes('Shamir ' + format + ' encode/decode', recovered, secret);
      } finally {
        recovered.fill(0);
      }
      checks.push('Shamir ' + format + ' encode/decode');
    }
    return { passed: true, checks, durationMs: Math.round(now() - started) };
  } finally {
    secret.fill(0);
  }
}
