import { concatBytes, encodeP2pkh, hash160, secp256k1, sha256 } from './crypto.js';

export interface CompactMessageSignature {
  readonly signature: string;
  readonly format: string;
  readonly verified: boolean;
}

export interface CompactMessageParameters {
  readonly magic: string;
  readonly p2pkhPrefix: number;
  readonly format: string;
}

function compactSize(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Message length is outside the supported range.');
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return Uint8Array.of(0xfd, value & 0xff, value >>> 8);
  if (value <= 0xffff_ffff) {
    return Uint8Array.of(0xfe, value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24);
  }
  const bytes = new Uint8Array(9);
  bytes[0] = 0xff;
  let remaining = BigInt(value);
  for (let index = 1; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function compactMessageDigest(message: string, magicText: string): Uint8Array {
  const encoder = new TextEncoder();
  const magic = encoder.encode(magicText);
  const payload = encoder.encode(message);
  return sha256(sha256(concatBytes(compactSize(magic.length), magic, compactSize(payload.length), payload)));
}

function base64Encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeCompactSignature(value: string): Uint8Array {
  try {
    const binary = atob(value.replaceAll(/\s+/gu, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The compact signature is not valid Base64.');
  }
}

interface RecoveredCompactPublicKey {
  readonly publicKey: Uint8Array;
  readonly compressed: boolean;
}

export function recoverCompactPublicKey(signature: Uint8Array, digest: Uint8Array): RecoveredCompactPublicKey {
  if (signature.length !== 65) throw new Error('A compact message signature must contain exactly 65 bytes.');
  const header = signature[0]!;
  if (header < 27 || header > 34) throw new Error('Compact message signature header must be from 27 to 34.');
  const offset = header - 27;
  const compressed = offset >= 4;
  const publicKey = secp256k1.Signature.fromBytes(signature.slice(1), 'compact')
    .addRecoveryBit(offset & 3)
    .recoverPublicKey(digest)
    .toBytes(compressed);
  if (!secp256k1.verify(signature.slice(1), digest, publicKey, { prehash: false, lowS: false })) {
    throw new Error('The recovered public key does not verify the compact message signature.');
  }
  return { publicKey, compressed };
}

function recoveredAddress(signature: Uint8Array, digest: Uint8Array, p2pkhPrefix: number): string {
  const { publicKey } = recoverCompactPublicKey(signature, digest);
  return encodeP2pkh(hash160(publicKey), p2pkhPrefix);
}

export function signCompactMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  parameters: CompactMessageParameters,
): CompactMessageSignature {
  if (privateKey.length !== 32) throw new Error('Message signing requires a 32-byte private key.');
  if (message.length === 0) throw new Error('Enter a message to sign.');
  const digest = compactMessageDigest(message, parameters.magic);
  const recovered = secp256k1.sign(digest, privateKey, { prehash: false, format: 'recovered' });
  const signatureBytes = concatBytes(Uint8Array.of(31 + recovered[0]!), recovered.slice(1));
  try {
    const signature = base64Encode(signatureBytes);
    if (recoveredAddress(signatureBytes, digest, parameters.p2pkhPrefix) !== address) {
      throw new Error('The generated signature did not verify against the selected address.');
    }
    return { signature, format: parameters.format, verified: true };
  } finally {
    signatureBytes.fill(0);
    digest.fill(0);
  }
}

export function verifyCompactMessage(
  address: string,
  message: string,
  signature: string,
  parameters: CompactMessageParameters,
): boolean {
  const digest = compactMessageDigest(message, parameters.magic);
  const signatureBytes = decodeCompactSignature(signature);
  try {
    return recoveredAddress(signatureBytes, digest, parameters.p2pkhPrefix) === address.trim();
  } finally {
    digest.fill(0);
    signatureBytes.fill(0);
  }
}
