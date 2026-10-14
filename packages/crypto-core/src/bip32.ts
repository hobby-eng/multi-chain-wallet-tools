import { HDKey } from "@scure/bip32";
import type { Bip32Versions } from "./networks.js";

import { MAX_BATCH_SIZE, MAX_BIP32_INDEX, assertIndex } from "./bip32-limits.js";

// The limits are data of their own (bip32-limits.ts); they are named here too for the callers of
// this module.
export { MAX_BATCH_SIZE, MAX_BIP32_INDEX, assertIndex };

export function assertBatch(start: number, count: number): void {
  assertIndex(start, "Start index");
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
    throw new Error(`Number of results must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  }
  if (start + count - 1 > MAX_BIP32_INDEX) {
    throw new Error("The requested index range exceeds the valid non-hardened range.");
  }
}

export function rootFromSeed(seed: Uint8Array, versions: Bip32Versions): HDKey {
  return HDKey.fromMasterSeed(seed, versions);
}

export function requirePrivate(node: HDKey, path: string): Uint8Array {
  const key = node.privateKey;
  if (key === null) throw new Error(`No private key was derived at ${path}.`);
  return key;
}

export function requirePublic(node: HDKey, path: string): Uint8Array {
  const key = node.publicKey;
  if (key === null) throw new Error(`No public key was derived at ${path}.`);
  return key;
}
