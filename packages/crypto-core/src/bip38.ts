import { sha256 } from "@noble/hashes/sha2.js";
import { createBase58check } from "@scure/base";
import { concatBytes, encodeP2pkh, hash160, secp256k1, wipe } from "./crypto.js";
import { Bip38PasswordMaterial } from "./bip38-password-material.js";

const base58check = createBase58check(sha256);
// BIP38 non-EC-multiplied wire format: 2 type bytes, flag, 4-byte address hash, 32-byte ciphertext.
const TYPE_BYTES = Uint8Array.of(0x01, 0x42);
const FLAG_OFFSET = TYPE_BYTES.length;
const ADDRESS_HASH_OFFSET = FLAG_OFFSET + 1;
const ADDRESS_HASH_BYTES = 4;
const CIPHERTEXT_OFFSET = ADDRESS_HASH_OFFSET + ADDRESS_HASH_BYTES;
const PAYLOAD_BYTES = CIPHERTEXT_OFFSET + 32;
const UNCOMPRESSED_FLAG = 0xc0;
const COMPRESSED_FLAG = 0xe0;

interface Bip38Network {
  p2pkh: number;
}

function addressFor(privateKey: Uint8Array, compressed: boolean, network: Bip38Network): string {
  return encodeP2pkh(hash160(secp256k1.getPublicKey(privateKey, compressed)), network.p2pkh);
}

function addressHash(address: string): Uint8Array {
  const encoded = new TextEncoder().encode(address);
  return sha256(sha256(encoded)).slice(0, ADDRESS_HASH_BYTES);
}

export async function encryptBip38(
  privateKey: Uint8Array,
  compressed: boolean,
  passphrase: string,
  network: Bip38Network,
): Promise<{ encryptedKey: string; address: string }> {
  if (!secp256k1.utils.isValidSecretKey(privateKey))
    throw new Error("BIP38 requires a valid secp256k1 private key.");
  Bip38PasswordMaterial.assertPassphrase(passphrase);
  const address = addressFor(privateKey, compressed, network);
  const salt = addressHash(address);
  try {
    return await Bip38PasswordMaterial.with(passphrase, salt, (material) => {
      const encrypted = material.encrypt(privateKey);
      let payload: Uint8Array | undefined;
      try {
        const flag = compressed ? COMPRESSED_FLAG : UNCOMPRESSED_FLAG;
        payload = concatBytes(TYPE_BYTES, Uint8Array.of(flag), salt, encrypted);
        return { encryptedKey: base58check.encode(payload), address };
      } finally {
        wipe(encrypted, payload);
      }
    });
  } finally {
    wipe(salt);
  }
}

export async function decryptBip38(
  encryptedKey: string,
  passphrase: string,
  network: Bip38Network,
): Promise<{ privateKey: Uint8Array; compressed: boolean; address: string }> {
  Bip38PasswordMaterial.assertPassphrase(passphrase);
  let payload: Uint8Array;
  try {
    payload = base58check.decode(encryptedKey.trim());
  } catch {
    throw new Error("Invalid BIP38 Base58Check value.");
  }
  try {
    if (
      payload.length !== PAYLOAD_BYTES ||
      !TYPE_BYTES.every((value, index) => payload[index] === value)
    )
      throw new Error("Only non-EC-multiplied BIP38 private keys are supported.");
    const flag = payload[FLAG_OFFSET];
    if (flag !== UNCOMPRESSED_FLAG && flag !== COMPRESSED_FLAG)
      throw new Error("Invalid BIP38 compression flag.");
    const compressed = flag === COMPRESSED_FLAG;
    // Views share payload's lifetime; no unowned salt or ciphertext copies survive a failed KDF.
    const salt = payload.subarray(ADDRESS_HASH_OFFSET, CIPHERTEXT_OFFSET);
    return await Bip38PasswordMaterial.with(passphrase, salt, (material) => {
      const privateKey = material.decrypt(payload.subarray(CIPHERTEXT_OFFSET));
      let check: Uint8Array | undefined;
      try {
        if (!secp256k1.utils.isValidSecretKey(privateKey))
          throw new Error("Incorrect BIP38 passphrase or network.");
        const address = addressFor(privateKey, compressed, network);
        check = addressHash(address);
        if (!check.every((value, index) => value === salt[index]))
          throw new Error("Incorrect BIP38 passphrase or network.");
        return { privateKey: privateKey.slice(), compressed, address };
      } finally {
        wipe(privateKey, check);
      }
    });
  } finally {
    wipe(payload);
  }
}
