import { concatBytes, encodeP2pkh, hash160, secp256k1, sha256 } from './crypto.js';
import type { NetworkName } from './types.js';

export type CompactMessageChain = 'bitcoin' | 'dash';

export interface CompactMessageSignature {
  readonly signature: string;
  readonly format: string;
  readonly verified: boolean;
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

function messageDigest(message: string, chain: CompactMessageChain): Uint8Array {
  const encoder = new TextEncoder();
  const magic = encoder.encode(chain === 'bitcoin' ? 'Bitcoin Signed Message:\n' : 'DarkCoin Signed Message:\n');
  const payload = encoder.encode(message);
  return sha256(sha256(concatBytes(compactSize(magic.length), magic, compactSize(payload.length), payload)));
}

function p2pkhPrefix(chain: CompactMessageChain, network: NetworkName): number {
  if (chain === 'bitcoin') return network === 'mainnet' ? 0x00 : 0x6f;
  return network === 'mainnet' ? 0x4c : 0x8c;
}

function base64Encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  try {
    const binary = atob(value.replaceAll(/\s+/gu, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The compact signature is not valid Base64.');
  }
}

function recoveredAddress(
  signature: Uint8Array,
  digest: Uint8Array,
  chain: CompactMessageChain,
  network: NetworkName,
): string {
  if (signature.length !== 65) throw new Error('A compact message signature must contain exactly 65 bytes.');
  const header = signature[0]!;
  if (header < 27 || header > 34) throw new Error('Compact message signature header must be from 27 to 34.');
  const offset = header - 27;
  const publicKey = secp256k1.Signature.fromBytes(signature.slice(1), 'compact')
    .addRecoveryBit(offset & 3)
    .recoverPublicKey(digest)
    .toBytes(offset >= 4);
  if (!secp256k1.verify(signature.slice(1), digest, publicKey, { prehash: false, lowS: false })) {
    throw new Error('The recovered public key does not verify the compact message signature.');
  }
  return encodeP2pkh(hash160(publicKey), p2pkhPrefix(chain, network));
}

export function signCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  chain: CompactMessageChain,
  network: NetworkName,
): CompactMessageSignature {
  if (privateKey.length !== 32) throw new Error('Message signing requires a 32-byte private key.');
  if (message.length === 0) throw new Error('Enter a message to sign.');
  const digest = messageDigest(message, chain);
  const recovered = secp256k1.sign(digest, privateKey, { prehash: false, format: 'recovered' });
  const signatureBytes = concatBytes(Uint8Array.of(31 + recovered[0]!), recovered.slice(1));
  const signature = base64Encode(signatureBytes);
  const verified = recoveredAddress(signatureBytes, digest, chain, network) === address;
  signatureBytes.fill(0);
  if (!verified) throw new Error('The generated signature did not verify against the selected address.');
  return {
    signature,
    format: chain === 'bitcoin' ? 'Bitcoin compact P2PKH (BIP137)' : 'Dash Core compact P2PKH',
    verified,
  };
}

export function verifyCompactP2pkhMessage(
  address: string,
  message: string,
  signature: string,
  chain: CompactMessageChain,
  network: NetworkName,
): boolean {
  const digest = messageDigest(message, chain);
  return recoveredAddress(base64Decode(signature), digest, chain, network) === address.trim();
}
