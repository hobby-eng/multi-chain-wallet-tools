import { ecb } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createBase58check } from '@scure/base';
import { concatBytes, encodeP2pkh, hash160, secp256k1, wipe } from './crypto.js';

const base58check = createBase58check(sha256);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 8, dkLen: 64 } as const;

export interface Bip38Network {
  p2pkh: number;
}

function addressFor(privateKey: Uint8Array, compressed: boolean, network: Bip38Network): string {
  return encodeP2pkh(hash160(secp256k1.getPublicKey(privateKey, compressed)), network.p2pkh);
}

function addressHash(address: string): Uint8Array {
  const encoded = new TextEncoder().encode(address);
  return sha256(sha256(encoded)).slice(0, 4);
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return Uint8Array.from(left, (value, index) => value ^ right[index]!);
}

export async function encryptBip38(
  privateKey: Uint8Array,
  compressed: boolean,
  passphrase: string,
  network: Bip38Network,
): Promise<{ encryptedKey: string; address: string }> {
  if (!secp256k1.utils.isValidSecretKey(privateKey)) throw new Error('BIP38 requires a valid secp256k1 private key.');
  if (passphrase.length === 0) throw new Error('Enter a BIP38 passphrase.');
  const address = addressFor(privateKey, compressed, network);
  const salt = addressHash(address);
  const derived = await scryptAsync(
    new TextEncoder().encode(passphrase.normalize('NFC')),
    salt,
    SCRYPT_OPTIONS,
  );
  const block = xor(privateKey, derived.slice(0, 32));
  let encrypted: Uint8Array | null = null;
  try {
    encrypted = ecb(derived.slice(32), { disablePadding: true }).encrypt(block);
    const flag = compressed ? 0xe0 : 0xc0;
    return {
      encryptedKey: base58check.encode(concatBytes(Uint8Array.of(0x01, 0x42, flag), salt, encrypted)),
      address,
    };
  } finally {
    wipe(salt, derived, block, encrypted);
  }
}

export async function decryptBip38(
  encryptedKey: string,
  passphrase: string,
  network: Bip38Network,
): Promise<{ privateKey: Uint8Array; compressed: boolean; address: string }> {
  if (passphrase.length === 0) throw new Error('Enter a BIP38 passphrase.');
  let payload: Uint8Array;
  try {
    payload = base58check.decode(encryptedKey.trim());
  } catch {
    throw new Error('Invalid BIP38 Base58Check value.');
  }
  if (payload.length !== 39 || payload[0] !== 0x01 || payload[1] !== 0x42) {
    throw new Error('Only non-EC-multiplied BIP38 private keys are supported.');
  }
  const flag = payload[2];
  if (flag !== 0xc0 && flag !== 0xe0) throw new Error('Invalid BIP38 compression flag.');
  const compressed = flag === 0xe0;
  const salt = payload.slice(3, 7);
  const derived = await scryptAsync(
    new TextEncoder().encode(passphrase.normalize('NFC')),
    salt,
    SCRYPT_OPTIONS,
  );
  const decrypted = ecb(derived.slice(32), { disablePadding: true }).decrypt(payload.slice(7));
  const privateKey = xor(decrypted, derived.slice(0, 32));
  try {
    if (!secp256k1.utils.isValidSecretKey(privateKey)) throw new Error('Incorrect BIP38 passphrase or network.');
    const address = addressFor(privateKey, compressed, network);
    const check = addressHash(address);
    if (!check.every((value, index) => value === salt[index])) {
      throw new Error('Incorrect BIP38 passphrase or network.');
    }
    return { privateKey: privateKey.slice(), compressed, address };
  } finally {
    wipe(payload, salt, derived, decrypted, privateKey);
  }
}
