import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  assertValidMnemonic,
  englishMnemonicToEntropy,
  entropyToEnglishMnemonic,
} from "@ckd/core/bip39.js";
import { BIP39_ENTROPY_BYTES, BIP39_WORD_COUNTS } from "@ckd/core/bip39-parameters.js";
import { orList } from "@ckd/core/listing.js";

/** Standard SeedQR writes each word as its index in four decimal digits. */
const STANDARD_DIGITS_PER_WORD = 4;
/** SeedQR takes every BIP39 length: a standard payload of four digits a word, a compact one of the entropy. */
const STANDARD_PAYLOAD_LENGTHS: readonly number[] = BIP39_WORD_COUNTS.map(
  (words) => words * STANDARD_DIGITS_PER_WORD,
);

/** Whether `bytes` have the size of a CompactSeedQR: the entropy of a BIP39 phrase. */
export function isCompactSeedQr(bytes: Uint8Array): boolean {
  return BIP39_ENTROPY_BYTES.includes(bytes.length);
}

/** SeedQR encodes every BIP39 phrase, so a valid one is all it needs. */
function assertSeedQrMnemonic(value: string): string {
  return assertValidMnemonic(value);
}

export function encodeStandardSeedQr(value: string): string {
  return assertSeedQrMnemonic(value)
    .split(" ")
    .map((word) => {
      const index = wordlist.indexOf(word);
      if (index < 0) throw new Error(`Unknown BIP39 word: ${word}.`);
      return index.toString().padStart(4, "0");
    })
    .join("");
}

export function decodeStandardSeedQr(value: string): string {
  const payload = value.trim();
  if (!/^\d+$/u.test(payload) || !STANDARD_PAYLOAD_LENGTHS.includes(payload.length)) {
    throw new Error(
      `Standard SeedQR must contain exactly ${orList(STANDARD_PAYLOAD_LENGTHS)} decimal digits.`,
    );
  }
  const words: string[] = [];
  for (let offset = 0; offset < payload.length; offset += STANDARD_DIGITS_PER_WORD) {
    const index = Number(payload.slice(offset, offset + STANDARD_DIGITS_PER_WORD));
    const word = wordlist[index];
    if (word === undefined)
      throw new Error(`SeedQR word index ${index} is outside the BIP39 English list.`);
    words.push(word);
  }
  return assertSeedQrMnemonic(words.join(" "));
}

export function encodeCompactSeedQr(value: string): Uint8Array {
  const mnemonic = assertSeedQrMnemonic(value);
  return englishMnemonicToEntropy(mnemonic);
}

export function decodeCompactSeedQr(value: Uint8Array): string {
  if (!isCompactSeedQr(value)) {
    throw new Error(`CompactSeedQR must contain exactly ${orList(BIP39_ENTROPY_BYTES)} bytes.`);
  }
  return entropyToEnglishMnemonic(value);
}
