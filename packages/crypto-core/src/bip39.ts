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
    // This call gives a useful unknown-word/checksum error in development, but the UI keeps
    // the public message concise and avoids echoing recovery words.
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

export function generateMnemonic(wordCount: 12 | 24): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error('Secure randomness is unavailable: crypto.getRandomValues is required.');
  }
  const entropy = new Uint8Array(wordCount === 12 ? 16 : 32);
  globalThis.crypto.getRandomValues(entropy);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}
