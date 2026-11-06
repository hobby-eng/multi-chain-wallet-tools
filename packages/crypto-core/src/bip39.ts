import { MnemonicInspection } from "./mnemonic-inspection.js";
export type { MnemonicDiagnostic } from "./mnemonic-inspection.js";
import { secureRandomBytes } from "./secure-random.js";
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  BIP39_WORD_COUNT_LIST,
  assertBip39WordCount,
  bip39EntropyBytes,
  isBip39WordCount,
  type Bip39WordCount,
} from "./bip39-parameters.js";
import { MnemonicFingerprint } from "./mnemonic-fingerprint.js";
import { Bip39Input } from "./bip39-input.js";
import { ENGLISH_BIP39_WORDS } from "./bip39-word-reader.js";

function normalizeMnemonic(value: string): string {
  return Bip39Input.normalize(value);
}

export function assertValidMnemonic(value: string): string {
  const mnemonic = normalizeMnemonic(value);
  const words = mnemonic.length === 0 ? [] : mnemonic.split(" ");
  if (!isBip39WordCount(words.length)) {
    throw new Error(`Enter exactly ${BIP39_WORD_COUNT_LIST} BIP39 English words.`);
  }
  if (!validateMnemonic(mnemonic, wordlist)) {
    // The message names the position of an unknown word, never the word itself: a mistyped
    // word is close to a secret one, and this text is shown openly. The candidate-scan
    // export boundary replaces this error with fixed text before reporting it.
    const unknown = words.findIndex((word) => ENGLISH_BIP39_WORDS.exactIndex(word) === undefined);
    if (unknown >= 0) {
      throw new Error(`Invalid BIP39 mnemonic: word ${unknown + 1} is not an English BIP39 word.`);
    }
    throw new Error("Invalid BIP39 mnemonic: check the word order and checksum.");
  }
  return mnemonic;
}

export function mnemonicToSeed(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(assertValidMnemonic(mnemonic), passphrase);
}

export function generateMnemonic(wordCount: Bip39WordCount): string {
  assertBip39WordCount(wordCount);
  const entropy = secureRandomBytes(bip39EntropyBytes(wordCount));
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

/** Inspect bounded phrase input; dispose the returned owner after its synchronous presentation. */
export const diagnoseMnemonic = MnemonicInspection.inspect.bind(MnemonicInspection);

/** Borrow the seed to compute its BIP32 master fingerprint; the temporary SDK node is wiped. */
export const masterFingerprintFromSeed = MnemonicFingerprint.fromSeed.bind(MnemonicFingerprint);
