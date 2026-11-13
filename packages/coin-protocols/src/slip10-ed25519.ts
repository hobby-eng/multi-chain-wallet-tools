// SLIP-10 for Ed25519 (https://github.com/satoshilabs/slips/blob/master/slip-0010.md): the master
// key and chain code are HMAC-SHA512("ed25519 seed", seed), and every child is hardened. Dash's
// Evonode Platform node key and the Ed25519 coins derive by it; it runs on the pinned Noble curves
// and hashes.
import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, wipe } from "@ckd/core/crypto.js";
import { childNumber, ED25519_SEED_KEY } from "./ed25519-hd-common.js";

/** A child number as BIP32 serializes it: four bytes, big-endian. */
export function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, index >>> 0);
  return out;
}

/** An Ed25519 key of SLIP-10: its 32-byte private key (the Ed25519 seed) and chain code. */
export class Slip10Ed25519Key {
  readonly #privateKey: Uint8Array;
  readonly #chainCode: Uint8Array;

  private constructor(output: Uint8Array) {
    this.#privateKey = output.slice(0, 32);
    this.#chainCode = output.slice(32);
    wipe(output);
  }

  /** The master key of `seed`, the BIP39 seed of a phrase. */
  static fromSeed(seed: Uint8Array): Slip10Ed25519Key {
    return new Slip10Ed25519Key(hmac(sha512, ED25519_SEED_KEY, seed));
  }

  /** The key at the hardened `indexes` below the master of `seed`; the caller wipes it. */
  static atPath(seed: Uint8Array, indexes: readonly number[]): Slip10Ed25519Key {
    let key = Slip10Ed25519Key.fromSeed(seed);
    for (const index of indexes) {
      const parent = key;
      try {
        key = parent.child(index);
      } finally {
        parent.wipe();
      }
    }
    return key;
  }

  /** The hardened child `index'`; SLIP-10 defines no normal Ed25519 child. */
  child(index: number): Slip10Ed25519Key {
    const data = concatBytes(Uint8Array.of(0), this.#privateKey, ser32(childNumber(index, true)));
    try {
      return new Slip10Ed25519Key(hmac(sha512, this.#chainCode, data));
    } finally {
      wipe(data);
    }
  }

  /** A copy of the 32-byte private key; the caller wipes it. */
  privateKey(): Uint8Array {
    return Uint8Array.from(this.#privateKey);
  }

  /** A copy of the chain code, for known-answer checks; the caller wipes it. */
  chainCode(): Uint8Array {
    return Uint8Array.from(this.#chainCode);
  }

  /** The key's 32-byte Ed25519 public key. */
  publicKey(): Uint8Array {
    return ed25519.getPublicKey(this.#privateKey);
  }

  /** Erases the private key and chain code, as far as the runtime allows. */
  wipe(): void {
    wipe(this.#privateKey, this.#chainCode);
  }
}
