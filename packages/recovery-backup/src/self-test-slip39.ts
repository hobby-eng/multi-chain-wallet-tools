import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { combineSlip39Mnemonics, generateSlip39Mnemonics } from './slip39.js';
import { deterministicRandom, expectBytes, now } from './self-test-helpers.js';

export function runSlip39SelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes('bb54aac4b89dc868ba37d9cc21b2cece');
  const official = combineSlip39Mnemonics(
    [
      'duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard',
    ],
    'TREZOR',
  );
  try {
    expectBytes('official SLIP-39 recovery vector', official, secret);
    const generated = generateSlip39Mnemonics(secret, {
      groupThreshold: 1,
      groups: [{ memberThreshold: 2, memberCount: 3 }],
      passphrase: 'runtime vector',
      extendable: true,
      iterationExponent: 0,
      randomBytes: deterministicRandom(),
    });
    const recovered = combineSlip39Mnemonics([generated[0]![0]!, generated[0]![2]!], 'runtime vector');
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
