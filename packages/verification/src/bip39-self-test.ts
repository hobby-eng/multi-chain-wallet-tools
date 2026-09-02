import { bytesToHex } from '@ckd/core/crypto.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { expectEqual, now } from './helpers.js';
import type { CryptoSelfTestReport } from './types.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Runs in the UI bundle so the BIP39 wordlist is embedded exactly once. */
export function runBip39SelfTest(): CryptoSelfTestReport {
  const started = now();
  const seed = mnemonicToSeed(TEST_MNEMONIC, 'TREZOR');
  try {
    expectEqual(
      'BIP39 PBKDF2 seed',
      bytesToHex(seed),
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553' +
      '1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    );
    return { passed: true, checks: ['BIP39'], durationMs: Math.round(now() - started) };
  } finally {
    seed.fill(0);
  }
}
