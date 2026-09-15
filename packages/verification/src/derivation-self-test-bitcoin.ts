import { deriveBitcoin } from '@ckd/coins/bitcoin/index.js';
import { hexToBytes } from '@ckd/core/crypto.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import { expectEqual, now, resultValue } from './helpers.js';
import type { CryptoSelfTestReport } from './types.js';

const FIXED_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

/** Bitcoin-only worker vectors for selectively composed offline artifacts. */
export async function runBitcoinDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const checks: string[] = [];
  const seed = hexToBytes(FIXED_SEED_HEX);
  const vectors = [
    ['legacy', '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'],
    ['nested-segwit', '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf'],
    ['native-segwit', 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'],
    ['taproot', 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'],
  ] as const;
  try {
    for (const [mode, address] of vectors) {
      const result = deriveBitcoin(mode, {
        seed: seed.slice(),
        network: 'mainnet',
        account: 0,
        branch: 0,
        start: 0,
        count: 1,
      });
      try {
        expectEqual(`Bitcoin ${mode}`, resultValue(result, 'address'), address);
        checks.push(`Bitcoin ${mode}`);
      } finally {
        clearDerivationResult(result);
      }
    }
  } finally {
    seed.fill(0);
  }
  return { passed: true, checks, durationMs: Math.round(now() - started) };
}
