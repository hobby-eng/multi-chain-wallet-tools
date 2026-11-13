// What SLIP-10's Ed25519 keys (slip10-ed25519.ts) and BIP32-Ed25519's Cardano keys
// (bip32-ed25519.ts) share: the HMAC key of an Ed25519 master and BIP32's child numbers. A leaf
// module, so that a build of either family holds none of the other's code.
import { assertIndex, BIP32_HARDENED_OFFSET } from "@ckd/core/bip32-limits.js";

/**
 * SLIP-10's HMAC key of an Ed25519 master ("ed25519 seed"), which CIP-3's Ledger master of Cardano
 * uses too; read-only by convention, as every caller only passes it to HMAC.
 */
export const ED25519_SEED_KEY = new TextEncoder().encode("ed25519 seed");

/** A child number: an index below 2^31, offset when hardened; refuses any other index. */
export function childNumber(index: number, hardened: boolean): number {
  assertIndex(index, "Child index");
  return hardened ? index + BIP32_HARDENED_OFFSET : index;
}
