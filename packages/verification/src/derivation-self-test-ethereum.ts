import { deriveEthereum } from '@ckd/coins/ethereum/index.js';
import { hexToBytes } from '@ckd/core/crypto.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import { expectEqual, now, resultValue } from './helpers.js';
import type { CryptoSelfTestReport } from './types.js';

const FIXED_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

/** Ethereum-only worker vector for selectively composed offline artifacts. */
export async function runEthereumDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const seed = hexToBytes(FIXED_SEED_HEX);
  const result = deriveEthereum({ seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 });
  try {
    expectEqual('Ethereum / EIP55', resultValue(result, 'address'), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    return { passed: true, checks: ['Ethereum / EIP55'], durationMs: Math.round(now() - started) };
  } finally {
    seed.fill(0);
    clearDerivationResult(result);
  }
}
