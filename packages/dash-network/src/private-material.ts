import { createBase58check } from '@scure/base';
import { validateMnemonic } from '@scure/bip39';
import { wordlist as czechWordlist } from '@scure/bip39/wordlists/czech.js';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as frenchWordlist } from '@scure/bip39/wordlists/french.js';
import { wordlist as italianWordlist } from '@scure/bip39/wordlists/italian.js';
import { wordlist as japaneseWordlist } from '@scure/bip39/wordlists/japanese.js';
import { wordlist as koreanWordlist } from '@scure/bip39/wordlists/korean.js';
import { wordlist as portugueseWordlist } from '@scure/bip39/wordlists/portuguese.js';
import { wordlist as simplifiedChineseWordlist } from '@scure/bip39/wordlists/simplified-chinese.js';
import { wordlist as spanishWordlist } from '@scure/bip39/wordlists/spanish.js';
import { wordlist as traditionalChineseWordlist } from '@scure/bip39/wordlists/traditional-chinese.js';
import { sha256 } from '@ckd/core/crypto.js';

const base58check = createBase58check(sha256);
const RAW_SECRET_PATTERN = /^(?:0x)?[0-9a-f]{64}$/iu;
const EXTENDED_PRIVATE_PATTERN = /(?:^|[^a-z0-9])(?:xprv|tprv|yprv|zprv|uprv|vprv)[1-9A-HJ-NP-Za-km-z]+/iu;
const PRIVATE_LABEL_PATTERN = /(?:^|[{"'\s])(?:private[\s_-]*key|spending[\s_-]*key|mnemonic|seed[\s_-]*phrase|recovery[\s_-]*phrase|xprv)["']?\s*[:=]/iu;
const WIF_VERSIONS = new Set([0x80, 0xcc, 0xef]);
const MNEMONIC_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
const BIP39_WORDLISTS = [
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
] as const;

export class PrivateMaterialError extends Error {
  constructor(message = 'Private key-like material was detected and erased. No network request was made.') {
    super(message);
    this.name = 'PrivateMaterialError';
  }
}

function looksLikeMnemonic(value: string): boolean {
  const words = value.normalize('NFKD').trim().split(/\s+/u);
  return MNEMONIC_WORD_COUNTS.includes(words.length as typeof MNEMONIC_WORD_COUNTS[number])
    && words.every((word) => /^[\p{L}]+$/u.test(word));
}

function containsValidMnemonic(value: string): boolean {
  const words = value.normalize('NFKD').trim().toLowerCase().split(/\s+/u);
  for (const length of MNEMONIC_WORD_COUNTS) {
    for (let start = 0; start + length <= words.length; start += 1) {
      const candidate = words.slice(start, start + length).join(' ');
      if (BIP39_WORDLISTS.some((wordlist) => validateMnemonic(candidate, wordlist))) return true;
    }
  }
  return false;
}

function looksLikeWif(value: string): boolean {
  try {
    const payload = base58check.decode(value);
    return (payload.length === 33 || payload.length === 34)
      && WIF_VERSIONS.has(payload[0] ?? -1)
      && (payload.length === 33 || payload[33] === 0x01);
  } catch {
    return false;
  }
}

export function assertPublicLookupInput(value: string): void {
  const input = value.trim();
  if (input.length === 0) throw new Error('Enter a public address, Identity identifier, or public key.');
  if (
    RAW_SECRET_PATTERN.test(input)
    || EXTENDED_PRIVATE_PATTERN.test(input)
    || PRIVATE_LABEL_PATTERN.test(input)
    || /-----BEGIN [^-]*PRIVATE KEY-----/iu.test(input)
    || looksLikeMnemonic(input)
    || looksLikeWif(input)
  ) {
    throw new PrivateMaterialError();
  }
}

export function assertPublicBatchLookupInput(value: string): void {
  const lines = value.replaceAll('\r', '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) assertPublicLookupInput(line);
  if (containsValidMnemonic(value)) throw new PrivateMaterialError();
}
