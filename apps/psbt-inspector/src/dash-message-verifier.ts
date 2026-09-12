import { encodeBase58Check, hash160, secp256k1, sha256 } from '@ckd/core/crypto.js';
import type { PsbtNetwork } from './psbt.js';

export interface MessageVerification {
  readonly valid: boolean;
  readonly format: string;
  readonly recoveredAddress: string | null;
  readonly recoveredPublicKey: string | null;
  readonly messageMagic: string;
  readonly timeConstraints: string;
}

function compactSize(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Message length is outside the supported range.');
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return Uint8Array.of(0xfd, value & 0xff, value >>> 8);
  if (value <= 0xffffffff) {
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

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll(/\s+/gu, '');
  if (normalized.length === 0) throw new Error('Enter a Base64 compact signature.');
  try {
    const decoded = atob(normalized);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The signature is not valid Base64.');
  }
}

function messageDigest(message: string): Uint8Array {
  const encoder = new TextEncoder();
  const magicBytes = encoder.encode('DarkCoin Signed Message:\n');
  const messageBytes = encoder.encode(message);
  const serialized = concat(compactSize(magicBytes.length), magicBytes, compactSize(messageBytes.length), messageBytes);
  return sha256(sha256(serialized));
}

function dashAddress(publicKey: Uint8Array, network: PsbtNetwork): string {
  const payload = concat(Uint8Array.of(network === 'mainnet' ? 0x4c : 0x8c), hash160(publicKey));
  return encodeBase58Check(payload);
}

function hexadecimal(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyDashSignedMessage(
  address: string,
  message: string,
  signatureBase64: string,
  network: PsbtNetwork,
): Promise<MessageVerification> {
  const signature = decodeBase64(signatureBase64);
  if (signature.length !== 65) throw new Error('A compact message signature must decode to exactly 65 bytes.');
  const header = signature[0]!;
  if (header < 27 || header > 34) throw new Error('Dash compact signature header must be from 27 to 34.');
  const offset = header - 27;
  const compressed = offset >= 4;
  const digest = messageDigest(message);
  let publicKey: Uint8Array;
  try {
    publicKey = secp256k1.Signature.fromBytes(signature.slice(1), 'compact')
      .addRecoveryBit(offset & 3)
      .recoverPublicKey(digest)
      .toBytes(compressed);
  } catch {
    throw new Error('The compact signature contains invalid ECDSA values or a recovery identifier that cannot recover a key.');
  }
  if (!secp256k1.verify(signature.slice(1), digest, publicKey, { prehash: false, lowS: false })) {
    throw new Error('The recovered public key does not verify this message signature.');
  }
  const recoveredAddress = dashAddress(publicKey, network);
  return {
    valid: recoveredAddress === address.trim(),
    format: compressed ? 'Dash Core compact P2PKH · compressed key' : 'Dash Core compact P2PKH · uncompressed key',
    recoveredAddress,
    recoveredPublicKey: hexadecimal(publicKey),
    messageMagic: 'Dash Core signed-message domain',
    timeConstraints: 'Not applicable',
  };
}
