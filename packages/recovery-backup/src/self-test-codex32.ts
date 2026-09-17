import { hexToBytes } from '@noble/hashes/utils.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { createCodex32Shares, recoverCodex32Shares } from './codex32.js';
import { expectBytes, expectText, now } from './self-test-helpers.js';

export function runCodex32SelfTest(): CryptoSelfTestReport {
  const started = now();
  const seed = hexToBytes('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100');
  const entropy = hexToBytes('5bbd9d71a8ec7990831aff359d426545');
  const expected = 'ms10leetsllhdmn9m42vcsamx24zrxgs3qrl7ahwvhw4fnzrhve25gvezzyqqtum9pgv99ycma';
  try {
    const record = createCodex32Shares(seed, 'leet', 0, 1);
    expectText('official Codex32 encode vector', record.shares[0]!, expected);
    const recovered = recoverCodex32Shares(record.shares);
    const entropyRecord = createCodex32Shares(entropy, 'seed', 0, 1);
    const recoveredEntropy = recoverCodex32Shares(entropyRecord.shares);
    try {
      expectBytes('official Codex32 decode vector', recovered, seed);
      expectBytes('Codex32 BIP39 entropy encode/decode', recoveredEntropy, entropy);
    } finally {
      recovered.fill(0);
      recoveredEntropy.fill(0);
    }
    return {
      passed: true,
      checks: ['Codex32 official + entropy encode/decode'],
      durationMs: Math.round(now() - started),
    };
  } finally {
    seed.fill(0);
    entropy.fill(0);
  }
}
