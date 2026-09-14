import {
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeedSync,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export function normalizeMnemonic(value: string): string {
  return value.normalize('NFKD').trim().toLowerCase().split(/\s+/u).filter(Boolean).join(' ');
}

export function assertValidMnemonic(value: string): string {
  const mnemonic = normalizeMnemonic(value);
  const words = mnemonic.length === 0 ? [] : mnemonic.split(' ');
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error('Enter exactly 12, 15, 18, 21, or 24 BIP39 English words.');
  }
  if (!validateMnemonic(mnemonic, wordlist)) {
    // Preserve a concise diagnostic for local input validation. The candidate-scan
    // export boundary replaces this error with fixed text before reporting it.
    try {
      mnemonicToEntropy(mnemonic, wordlist);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Unknown word:')) {
        throw new Error(`Invalid BIP39 mnemonic: ${message}.`);
      }
    }
    throw new Error('Invalid BIP39 mnemonic: check the word order and checksum.');
  }
  return mnemonic;
}

export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(assertValidMnemonic(mnemonic), passphrase);
}

export const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
export type Bip39WordCount = typeof BIP39_WORD_COUNTS[number];

const BIP39_ENTROPY_BYTES: Readonly<Record<Bip39WordCount, number>> = {
  12: 16,
  15: 20,
  18: 24,
  21: 28,
  24: 32,
};

export function generateMnemonic(wordCount: Bip39WordCount): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error('Secure randomness is unavailable: crypto.getRandomValues is required.');
  }
  const entropyBytes = BIP39_ENTROPY_BYTES[wordCount];
  if (entropyBytes === undefined) throw new Error('BIP39 word count must be 12, 15, 18, 21, or 24.');

  const entropy = new Uint8Array(entropyBytes);
  globalThis.crypto.getRandomValues(entropy);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

export function entropyToEnglishMnemonic(entropy: Uint8Array): string {
  return entropyToMnemonic(entropy, wordlist);
}
