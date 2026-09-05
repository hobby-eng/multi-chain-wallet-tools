import { createBase58check } from '@scure/base';
import { sha256 } from '@ckd/core/crypto.js';

const base58check = createBase58check(sha256);
const RAW_SECRET_PATTERN = /^(?:0x)?[0-9a-f]{64}$/iu;
const EXTENDED_PRIVATE_PATTERN = /(?:^|[^a-z0-9])(?:xprv|tprv|yprv|zprv|uprv|vprv)[1-9A-HJ-NP-Za-km-z]+/iu;
const PRIVATE_LABEL_PATTERN = /(?:^|[{"'\s])(?:private[\s_-]*key|spending[\s_-]*key|mnemonic|seed[\s_-]*phrase|recovery[\s_-]*phrase|xprv)["']?\s*[:=]/iu;
const WIF_VERSIONS = new Set([0x80, 0xcc, 0xef]);

export class PrivateMaterialError extends Error {
  constructor(message = 'Private key-like material was detected and erased. No network request was made.') {
    super(message);
    this.name = 'PrivateMaterialError';
  }
}

function looksLikeMnemonic(value: string): boolean {
  const words = value.normalize('NFKD').trim().split(/\s+/u);
  return [12, 15, 18, 21, 24].includes(words.length)
    && words.every((word) => /^[\p{L}]+$/u.test(word));
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
