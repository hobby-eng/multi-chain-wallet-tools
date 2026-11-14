// Zcash's transparent P2PKH address of a public key hash: "t1…", Base58Check under zcashd's
// two-byte version (profiles.ts). The transparent rows and the transparent receivers of the
// Sapling rows' unified addresses write it alike.
import { concatBytes, encodeBase58Check } from "@ckd/core/crypto.js";
import { ZCASH_ADDRESS } from "./profiles.js";

/** The t1 address of a 20-byte public key hash (HASH160 of the compressed public key). */
export function zcashTransparentAddress(publicKeyHash: Uint8Array): string {
  return encodeBase58Check(concatBytes(Uint8Array.from(ZCASH_ADDRESS.t1), publicKeyHash));
}
