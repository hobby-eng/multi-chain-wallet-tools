import { wordlist } from '@scure/bip39/wordlists/english.js';
import { assertValidMnemonic, englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';

const SUPPORTED_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const STANDARD_PAYLOAD_LENGTHS = new Set([48, 60, 72, 84, 96]);
const COMPACT_PAYLOAD_LENGTHS = new Set([16, 20, 24, 28, 32]);

function assertSeedQrMnemonic(value: string): string {
  const mnemonic = assertValidMnemonic(value);
  if (!SUPPORTED_WORD_COUNTS.has(mnemonic.split(' ').length)) {
    throw new Error('SeedQR accepts 12-, 15-, 18-, 21-, or 24-word English BIP39 phrases.');
  }
  return mnemonic;
}

export function encodeStandardSeedQr(value: string): string {
  return assertSeedQrMnemonic(value)
    .split(' ')
    .map((word) => {
      const index = wordlist.indexOf(word);
      if (index < 0) throw new Error(`Unknown BIP39 word: ${word}.`);
      return index.toString().padStart(4, '0');
    })
    .join('');
}

export function decodeStandardSeedQr(value: string): string {
  const payload = value.trim();
  if (!/^\d+$/u.test(payload) || !STANDARD_PAYLOAD_LENGTHS.has(payload.length)) {
    throw new Error('Standard SeedQR must contain exactly 48, 60, 72, 84, or 96 decimal digits.');
  }
  const words: string[] = [];
  for (let offset = 0; offset < payload.length; offset += 4) {
    const index = Number(payload.slice(offset, offset + 4));
    const word = wordlist[index];
    if (word === undefined) throw new Error(`SeedQR word index ${index} is outside the BIP39 English list.`);
    words.push(word);
  }
  return assertSeedQrMnemonic(words.join(' '));
}

export function encodeCompactSeedQr(value: string): Uint8Array {
  const mnemonic = assertSeedQrMnemonic(value);
  return englishMnemonicToEntropy(mnemonic);
}

export function decodeCompactSeedQr(value: Uint8Array): string {
  if (!COMPACT_PAYLOAD_LENGTHS.has(value.length)) {
    throw new Error('CompactSeedQR must contain exactly 16, 20, 24, 28, or 32 bytes.');
  }
  return entropyToEnglishMnemonic(value);
}
