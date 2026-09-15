import { secureRandomBytes } from './secure-random.js';
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
  const entropyBytes = BIP39_ENTROPY_BYTES[wordCount];
  if (entropyBytes === undefined) throw new Error('BIP39 word count must be 12, 15, 18, 21, or 24.');

  const entropy = secureRandomBytes(entropyBytes);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

export function entropyToEnglishMnemonic(entropy: Uint8Array): string {
  return entropyToMnemonic(entropy, wordlist);
}

export function englishMnemonicToEntropy(value: string): Uint8Array {
  return mnemonicToEntropy(assertValidMnemonic(value), wordlist);
}

export interface UnknownMnemonicWord {
  readonly index: number;
  readonly word: string;
  readonly suggestions: readonly string[];
}

export interface MnemonicWordDiagnostic {
  readonly position: number;
  readonly word: string;
  readonly wordlistIndex: number | null;
  readonly indexHex: string | null;
  readonly bits: string | null;
}

export interface MnemonicConstructionDiagnostic {
  readonly entropyHex: string;
  readonly entropyBinary: string;
  readonly providedChecksum: string;
  readonly expectedChecksum: string;
  readonly mnemonicBinary: string;
  readonly wordIndexes: readonly number[];
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
  readonly words: readonly MnemonicWordDiagnostic[];
  readonly construction: MnemonicConstructionDiagnostic | null;
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
  const wordDiagnostics = words.map((word, index) => {
    const wordlistIndex = BIP39_WORD_SET.has(word) ? wordlist.indexOf(word) : null;
    return {
      position: index + 1,
      word,
      wordlistIndex,
      indexHex: wordlistIndex === null ? null : `0x${wordlistIndex.toString(16).padStart(3, '0')}`,
      bits: wordlistIndex === null ? null : wordlistIndex.toString(2).padStart(11, '0'),
    };
  });
  let construction: MnemonicConstructionDiagnostic | null = null;
  if (checksumValid && entropyBits !== null) {
    // @scure/bip39 performs the normative checksum validation and entropy recovery.
    // The binary/index presentation mirrors Ian Coleman's Entropy Details view,
    // while keeping cryptographic conversion in the already pinned library.
    const entropy = mnemonicToEntropy(normalized, wordlist);
    try {
      const canonicalWords = entropyToMnemonic(entropy, wordlist).split(' ');
      const canonicalIndexes = canonicalWords.map((word) => wordlist.indexOf(word));
      const mnemonicBinary = canonicalIndexes.map((index) => index.toString(2).padStart(11, '0')).join('');
      const entropyBinary = Array.from(entropy, (byte) => byte.toString(2).padStart(8, '0')).join('');
      const checksum = mnemonicBinary.slice(entropyBits);
      construction = {
        entropyHex: bytesToHex(entropy),
        entropyBinary,
        providedChecksum: checksum,
        expectedChecksum: checksum,
        mnemonicBinary,
        wordIndexes: canonicalIndexes,
      };
    } finally {
      wipe(entropy);
    }
  }
  return {
    normalized,
    wordCount: words.length,
    wordCountValid,
    allWordsKnown,
    checksumValid,
    entropyBits,
    checksumBits: entropyBits === null ? null : entropyBits / 32,
    unknownWords,
    words: wordDiagnostics,
    construction,
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
