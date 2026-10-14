// What Bitcoin's newer single-key addresses commit to: the BIP86 Taproot output key, and the
// HASH160 of the P2WPKH script that nested SegWit wraps. Only the Bitcoin-like family takes them.
//
// Host-neutral: it imports only address-types.ts and @noble/curves
// (test/portable-modules.test.ts).

import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { hash160 } from "./address-types.js";
import { ErrorCatalog } from "../error-catalog.js";

const ERRORS = new ErrorCatalog("core.coins.taproot", {
  "bip341-gives-no-taproot-output-key-key": () =>
    "BIP341 gives no Taproot output key for this key.",
});

/** BIP340: a Taproot key is written as its x coordinate alone, 32 bytes. */
export const X_ONLY_KEY_BYTES = 32;
/**
 * BIP141: the redeem script of nested SegWit is OP_0, a push of 20 bytes, and the key's HASH160.
 */
const WITNESS_KEY_HASH_PREFIX = [0x00, 0x14];
/** BIP341: the tag of the hash that tweaks a Taproot internal key. */
const TAP_TWEAK_TAG = "TapTweak";

/** The HASH160 of the P2WPKH script of `publicKey`, which a nested SegWit address holds. */
export function nestedSegwitHash(publicKey: Uint8Array): Uint8Array {
  return hash160(Uint8Array.of(...WITNESS_KEY_HASH_PREFIX, ...hash160(publicKey)));
}

/**
 * BIP86: the key-path-only Taproot output key Q = P + t·G, where P is the key with an even Y and t
 * the BIP340 tagged hash "TapTweak" of its x (BIP341). Public values only, so the faster scalar
 * multiplication that is not constant-time is fine.
 */
export function taprootOutputKey(publicKey: Uint8Array): Uint8Array {
  const { Point } = secp256k1;
  const point = Point.fromBytes(publicKey);
  const internal = point.y % 2n === 0n ? point : point.negate();
  const xOnly = schnorr.utils.pointToBytes(internal);
  const tweak = bigEndian(schnorr.utils.taggedHash(TAP_TWEAK_TAG, xOnly));
  // BIP341 fails when t is not below the group order or Q is the point at infinity: about 2^-128.
  if (tweak >= Point.Fn.ORDER) throw ERRORS.create("bip341-gives-no-taproot-output-key-key", []);
  const output = internal.add(Point.BASE.multiplyUnsafe(tweak));
  if (output.is0()) throw ERRORS.create("bip341-gives-no-taproot-output-key-key", []);
  return schnorr.utils.pointToBytes(output);
}

function bigEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}
