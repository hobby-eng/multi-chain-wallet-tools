import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex, hash160, sha256 } from '@ckd/core/crypto.js';

export type HashlockKind = 'sha256' | 'hash256' | 'ripemd160' | 'hash160';

export interface PreimageCalculation {
  readonly rawUtf8Hex: string;
  readonly rawByteLength: number;
  readonly preimageHex: string;
  readonly normalization: string;
  readonly commitments: Readonly<Record<HashlockKind, string>>;
}

export function hashlockCommitment(kind: HashlockKind, preimage: Uint8Array): Uint8Array {
  if (preimage.length !== 32) throw new Error('Miniscript hashlocks require an exact 32-byte preimage.');
  if (kind === 'sha256') return sha256(preimage);
  if (kind === 'hash256') return sha256(sha256(preimage));
  if (kind === 'ripemd160') return ripemd160(preimage);
  return hash160(preimage);
}

export function calculatePhrasePreimage(phrase: string): PreimageCalculation {
  if (phrase.length === 0) throw new Error('Enter a phrase to calculate its preimage commitments.');
  const raw = new TextEncoder().encode(phrase);
  const preimage = raw.length === 32 ? raw.slice() : sha256(raw);
  return {
    rawUtf8Hex: bytesToHex(raw),
    rawByteLength: raw.length,
    preimageHex: bytesToHex(preimage),
    normalization: raw.length === 32
      ? 'The UTF-8 phrase is exactly 32 bytes and is used directly.'
      : `The UTF-8 phrase is ${raw.length} bytes, so SHA-256(UTF-8 phrase) is used as the deterministic 32-byte Miniscript preimage.`,
    commitments: {
      sha256: bytesToHex(hashlockCommitment('sha256', preimage)),
      hash256: bytesToHex(hashlockCommitment('hash256', preimage)),
      ripemd160: bytesToHex(hashlockCommitment('ripemd160', preimage)),
      hash160: bytesToHex(hashlockCommitment('hash160', preimage)),
    },
  };
}
