import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { createBase58check } from "@scure/base";
import { ADDRESS_HASH_BYTES } from "./address-parameters.js";
import { WifVersion } from "./wif-version.js";

const base58check = createBase58check(sha256);

export { bytesToHex, concatBytes, hexToBytes, secp256k1, sha256 };

export function hash160(bytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(bytes));
}

export function encodeBase58Check(payload: Uint8Array): string {
  return base58check.encode(payload);
}

/** The payload of a base58check `text`, or null when it is not base58 or its checksum fails. */
export function decodeBase58Check(text: string): Uint8Array | null {
  try {
    return base58check.decode(text);
  } catch {
    return null;
  }
}

export function encodeP2pkh(hash: Uint8Array, prefix: number): string {
  if (hash.length !== ADDRESS_HASH_BYTES)
    throw new Error(`P2PKH hash must be ${ADDRESS_HASH_BYTES} bytes.`);
  return encodeBase58Check(concatBytes(Uint8Array.of(prefix), hash));
}

/** The hex scriptPubKey of a P2PKH output: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG. */
export function p2pkhScriptHex(hash: Uint8Array): string {
  if (hash.length !== ADDRESS_HASH_BYTES)
    throw new Error(`P2PKH hash must be ${ADDRESS_HASH_BYTES} bytes.`);
  return `76a914${bytesToHex(hash)}88ac`;
}

export function encodeP2sh(hash: Uint8Array, prefix: number): string {
  if (hash.length !== ADDRESS_HASH_BYTES)
    throw new Error(`P2SH hash must be ${ADDRESS_HASH_BYTES} bytes.`);
  return encodeBase58Check(concatBytes(Uint8Array.of(prefix), hash));
}

export function encodeWif(privateKey: Uint8Array, prefix: number): string {
  if (privateKey.length !== 32) throw new Error("Private key must be 32 bytes.");
  const version = new WifVersion(prefix);
  const payload = concatBytes(Uint8Array.of(version.value), privateKey, Uint8Array.of(1));
  try {
    return encodeBase58Check(payload);
  } finally {
    wipe(payload);
  }
}

export function numberTo32Bytes(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) throw new Error("Value is outside uint256.");
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

export function bytesToNumber(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${bytesToHex(bytes)}`);
}

export function wipe(...arrays: Array<Uint8Array | null | undefined>): void {
  for (const array of arrays) array?.fill(0);
}
