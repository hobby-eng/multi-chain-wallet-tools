// What an Ethereum-style account commits to: the last 20 bytes of the Keccak-256 of the key, and
// the rule of the keccak address type that says so. Ethereum and its networks (ethereum.ts), the
// other coins of evm.ts and Injective (cosmos.ts) take it.
//
// Host-neutral: it imports only @noble/curves and @noble/hashes (test/portable-modules.test.ts).

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { HEX_ACCOUNT_BYTES } from "./address-sizes.js";

// The size of an account is address-sizes.ts's; here under its name of the hash that gives it.
export { HEX_ACCOUNT_BYTES as KECCAK_ACCOUNT_BYTES };

/** The last 20 bytes of Keccak-256 of the 64 bytes of the uncompressed key, without its 04 byte. */
export function keccakAccount(publicKey: Uint8Array): Uint8Array {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return keccak_256(uncompressed.subarray(1)).subarray(-HEX_ACCOUNT_BYTES);
}

/**
 * The commitment rule of the keccak address type, which every coin of these accounts takes. Typed
 * where it is spread into a coin's rules (CoinRules of coin.ts), which this module does not import,
 * so that a host of one such coin takes no other coin's code.
 */
export const KECCAK_RULES = Object.freeze({
  commitments: Object.freeze({ keccak: keccakAccount }),
});
