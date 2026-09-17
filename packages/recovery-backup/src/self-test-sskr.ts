import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { createSskrShares, recoverSskrShares } from './sskr.js';
import { expectBytes, now } from './self-test-helpers.js';

export function runSskrSelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes('000102030405060708090a0b0c0d0e0f');
  const vectors = [
    ['compact-ur', 'SSKR Compact UR encode/decode'],
    ['bytewords', 'SSKR Bytewords encode/decode'],
  ] as const;
  const checks = vectors.map(([, label]) => label);
  try {
    for (const [encoding, label] of vectors) {
      const shares = createSskrShares(secret, 1, [{ threshold: 2, count: 3 }], encoding);
      const recovered = recoverSskrShares([shares[0]!, shares[2]!], encoding);
      try {
        expectBytes(label, recovered, secret);
      } finally {
        recovered.fill(0);
      }
    }
    return { passed: true, checks, durationMs: Math.round(now() - started) };
  } finally {
    secret.fill(0);
  }
}
