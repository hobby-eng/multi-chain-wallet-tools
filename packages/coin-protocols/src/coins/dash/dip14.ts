// DIP14's extension of BIP32 to 256-bit child indexes, which DashPay (DIP15) uses to put two
// identity IDs into a path. Only the normal private step is needed: DashPay's IDs and its payment
// index are normal children. An index below 2^32 is BIP32's ser32 step (DIP14's compatibility mode).
import type { HDKey } from "@scure/bip32";
import { bytesToNumber, concatBytes, numberTo32Bytes, secp256k1, wipe } from "@ckd/core/crypto.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";

const CURVE_ORDER = secp256k1.Point.CURVE().n;

/** A 32-byte child index whose first 28 bytes are zero is a 32-bit index in DIP14. */
export function isCompatibilityIndex(index: Uint8Array): boolean {
  return index.length === 32 && index.subarray(0, 28).every((byte) => byte === 0);
}

/** A private node of a DIP14 path; it copies what it is given and wipes it on request. */
export class Dip14PrivateNode {
  readonly #privateKey: Uint8Array;
  readonly #chainCode: Uint8Array;

  private constructor(privateKey: Uint8Array, chainCode: Uint8Array) {
    this.#privateKey = privateKey;
    this.#chainCode = chainCode;
  }

  /** Starts from a BIP32 node with its private key, such as `m/9'/coin_type'/15'/account'`. */
  static fromBip32(node: HDKey): Dip14PrivateNode {
    if (node.privateKey === null || node.chainCode === null)
      throw new Error("A DIP14 path needs a private BIP32 node.");
    return new Dip14PrivateNode(Uint8Array.from(node.privateKey), Uint8Array.from(node.chainCode));
  }

  /**
   * The normal child at `index`: four bytes for a 32-bit index below 2^31, or a 256-bit index
   * whose first 28 bytes are not all zero. Dash Core reads such a 256-bit index as a 32-bit one,
   * while the Platform wallet library does not, so that index is refused rather than guessed.
   */
  normalChild(index: Uint8Array): Dip14PrivateNode {
    if (index.length === 4) {
      if ((index[0]! & 0x80) !== 0) throw new Error("A normal 32-bit index must be below 2^31.");
    } else if (index.length !== 32 || isCompatibilityIndex(index)) {
      throw new Error("A DIP14 256-bit index must not start with 28 zero bytes.");
    }
    const publicKey = this.publicKey();
    const data = concatBytes(publicKey, index);
    const output = hmac(sha512, this.#chainCode, data);
    try {
      const tweak = bytesToNumber(output.subarray(0, 32));
      if (tweak >= CURVE_ORDER) throw new Error("This DIP14 index gives an invalid key.");
      const child = (tweak + bytesToNumber(this.#privateKey)) % CURVE_ORDER;
      if (child === 0n) throw new Error("This DIP14 index gives an invalid key.");
      return new Dip14PrivateNode(numberTo32Bytes(child), output.slice(32));
    } finally {
      wipe(publicKey, data, output);
    }
  }

  /** The compressed public key. */
  publicKey(): Uint8Array {
    return secp256k1.getPublicKey(this.#privateKey, true);
  }

  /** A copy of the 32-byte private key; the caller wipes it. */
  privateKey(): Uint8Array {
    return Uint8Array.from(this.#privateKey);
  }

  /** A copy of the chain code; the caller wipes it. */
  chainCode(): Uint8Array {
    return Uint8Array.from(this.#chainCode);
  }

  wipe(): void {
    wipe(this.#privateKey, this.#chainCode);
  }
}

/** ser32 of a normal index. */
export function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, index >>> 0);
  return out;
}
