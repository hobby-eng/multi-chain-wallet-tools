import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { bytesToHex, hash160, wipe } from './crypto.js';

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
export type Bip39WordCount = (typeof BIP39_WORD_COUNTS)[number];

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

export interface UnknownMnemonicWord {
  readonly index: number;
  readonly word: string;
  readonly suggestions: readonly string[];
}

export interface MnemonicDiagnostic {
  readonly normalized: string;
  readonly wordCount: number;
  readonly wordCountValid: boolean;
  readonly allWordsKnown: boolean;
  readonly checksumValid: boolean;
  readonly entropyBits: number | null;
  readonly checksumBits: number | null;
  readonly unknownWords: readonly UnknownMnemonicWord[];
}

const BIP39_WORD_SET = new Set(wordlist);

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          (current[rightIndex] ?? 0) + 1,
          (previous[rightIndex + 1] ?? 0) + 1,
          (previous[rightIndex] ?? 0) + (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function nearbyWords(value: string): readonly string[] {
  if (!/^[a-z]+$/u.test(value)) return [];
  return wordlist
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .filter(({ distance }) => distance <= 2)
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))
    .slice(0, 5)
    .map(({ candidate }) => candidate);
}

export function diagnoseMnemonic(value: string): MnemonicDiagnostic {
  const normalized = normalizeMnemonic(value);
  const words = normalized === '' ? [] : normalized.split(' ');
  const wordCountValid = BIP39_WORD_COUNTS.includes(words.length as Bip39WordCount);
  const unknownWords = words.flatMap((word, index) =>
    BIP39_WORD_SET.has(word) ? [] : [{ index, word, suggestions: nearbyWords(word) }],
  );
  const allWordsKnown = words.length > 0 && unknownWords.length === 0;
  const checksumValid = wordCountValid && allWordsKnown && validateMnemonic(normalized, wordlist);
  const entropyBits = wordCountValid ? (words.length / 3) * 32 : null;
  return {
    normalized,
    wordCount: words.length,
    wordCountValid,
    allWordsKnown,
    checksumValid,
    entropyBits,
    checksumBits: entropyBits === null ? null : entropyBits / 32,
    unknownWords,
  };
}

export function masterFingerprintFromSeed(seed: Uint8Array): string {
  const root = HDKey.fromMasterSeed(seed);
  const publicKey = root.publicKey;
  if (publicKey === null) throw new Error('BIP32 master public key is unavailable.');
  const fingerprint = hash160(publicKey).slice(0, 4);
  try {
    return bytesToHex(fingerprint);
  } finally {
    root.wipePrivateData();
    wipe(publicKey, fingerprint);
  }
}
