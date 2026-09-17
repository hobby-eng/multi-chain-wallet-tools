import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { createProtectedGordianSeedEnvelope, recoverProtectedGordianSeedEnvelopeBundle } from './gordian-envelope.js';
import { expectBytes, now } from './self-test-helpers.js';

export function runGordianEnvelopeSelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes('000102030405060708090a0b0c0d0e0f');
  const label = 'Gordian Seed Envelope encrypted entropy/passphrase encode/decode';
  try {
    const records = createProtectedGordianSeedEnvelope(secret, 'self-test', '', {
      password: 'self-test password',
      bip39Passphrase: 'self-test BIP39 passphrase',
    });
    const recovered = recoverProtectedGordianSeedEnvelopeBundle(records, 'self-test password');
    try {
      expectBytes(label, recovered.entropy, secret);
      if (recovered.bip39Passphrase !== 'self-test BIP39 passphrase') {
        throw new Error(`${label}: passphrase mismatch.`);
      }
    } finally {
      recovered.entropy.fill(0);
    }
    return { passed: true, checks: [label], durationMs: Math.round(now() - started) };
  } finally {
    secret.fill(0);
  }
}
