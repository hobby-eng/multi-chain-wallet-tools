import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { recoverSlip39Shares, createSlip39Shares } from './slip39.js';
import { deterministicRandom, expectBytes, now } from './self-test-helpers.js';

export function runSlip39SelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes('bb54aac4b89dc868ba37d9cc21b2cece');
  const official = recoverSlip39Shares(
    [
      'duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard',
    ],
    'TREZOR',
  );
  try {
    expectBytes('official SLIP-39 recovery vector', official, secret);
    const generated = createSlip39Shares(secret, {
      groupThreshold: 1,
      groups: [{ memberThreshold: 2, memberCount: 3 }],
      passphrase: 'runtime vector',
      extendable: true,
      iterationExponent: 0,
      randomBytes: deterministicRandom(),
    });
    const recovered = recoverSlip39Shares([generated[0]![0]!, generated[0]![2]!], 'runtime vector');
    try {
      expectBytes('SLIP-39 encode/decode', recovered, secret);
    } finally {
      recovered.fill(0);
    }
    return { passed: true, checks: ['SLIP-39 official + encode/decode'], durationMs: Math.round(now() - started) };
  } finally {
    official.fill(0);
    secret.fill(0);
  }
}
