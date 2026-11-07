import type { HDKey } from "@scure/bip32";
import { Bip32Key } from "@ckd/core/bip32-key.js";
import { hash160, wipe } from "@ckd/core/crypto.js";

/** Copies of one secp256k1 key's bytes; the caller wipes them. */
export interface Secp256k1PathKey {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly publicKeyHash: Uint8Array;
}

/**
 * The secp256k1 key at `path` below `root`, as copies the caller owns: the SDK node is disposed
 * here, and nothing is left unwiped when a step fails.
 */
export function secp256k1PathKey(root: HDKey, path: string): Secp256k1PathKey {
  let privateKey: Uint8Array | undefined;
  let publicKey: Uint8Array | undefined;
  try {
    using node = Bip32Key.take(root.derive(path));
    privateKey = Uint8Array.from(node.privateKey(path));
    publicKey = Uint8Array.from(node.publicKey(path));
    return { privateKey, publicKey, publicKeyHash: hash160(publicKey) };
  } catch (cause) {
    wipe(privateKey, publicKey);
    throw cause;
  }
}
