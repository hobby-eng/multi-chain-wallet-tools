// The account bytes of a secp256k1 key as Ethereum defines them: the last 20 bytes of Keccak-256 of
// the uncompressed point without its 0x04 tag. Every EVM network, Ethereum Classic, Tron and
// Injective encode these same bytes, each in its own form.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, secp256k1 } from "@ckd/core/crypto.js";
import { EthereumAddress } from "@ckd/core/eip55.js";

/** The 20 account bytes of a public key in either SEC1 form. */
export function keccakAccount(publicKey: Uint8Array): Uint8Array {
  const uncompressed =
    publicKey.length === 65
      ? publicKey
      : secp256k1.Point.fromHex(bytesToHex(publicKey)).toBytes(false);
  // The 0x04 tag of the SEC1 uncompressed form is not hashed.
  return keccak_256(uncompressed.subarray(1)).slice(-20);
}

/** The EIP-55 address of a public key in either SEC1 form, as every EVM network writes it. */
export function evmAddressOfKey(publicKey: Uint8Array): string {
  return EthereumAddress.fromHex(bytesToHex(keccakAccount(publicKey))).checksummed;
}
