import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { decodeCompactSeedQr, decodeStandardSeedQr, encodeCompactSeedQr, encodeStandardSeedQr } from './seedqr.js';
import { expectBytes, expectText, now } from './self-test-helpers.js';

export function runSeedQrSelfTest(): CryptoSelfTestReport {
  const started = now();
  const mnemonic = 'forum undo fragile fade shy sign arrest garment culture tube off merit';
  const standard = '073318950739065415961602009907670428187212261116';
  const entropy = hexToBytes('5bbd9d71a8ec7990831aff359d426545');
  const compact = encodeCompactSeedQr(mnemonic);
  try {
    expectText('Standard SeedQR encode', encodeStandardSeedQr(mnemonic), standard);
    expectText('Standard SeedQR decode', decodeStandardSeedQr(standard), mnemonic);
    expectBytes('CompactSeedQR encode', compact, entropy);
    expectText('CompactSeedQR decode', decodeCompactSeedQr(compact), mnemonic);
    return { passed: true, checks: ['SeedQR encode/decode'], durationMs: Math.round(now() - started) };
  } finally {
    compact.fill(0);
    entropy.fill(0);
  }
}
