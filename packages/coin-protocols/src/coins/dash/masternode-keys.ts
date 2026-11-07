// The two non-secp256k1 key schemes of a Dash masternode: the operator's BLS12-381 key, derived as
// dashbls's ExtendedPrivateKey derives it ("BLS HD"), and the Evonode's Platform node key, an
// Ed25519 key derived by SLIP-10. Both run on the pinned Noble curves and hashes; neither adds a
// hand-written field or group operation. The BLS secret is a JavaScript big integer, which cannot
// be wiped; its byte form and every chain code are wiped as soon as they are no longer needed.
import { bls12_381, bls12_381_Fr } from "@noble/curves/bls12-381.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { assertIndex } from "@ckd/core/bip32-limits.js";
import { wipe } from "@ckd/core/crypto.js";

/** BIP32's hardened offset, shared by both schemes. */
export const HARDENED_OFFSET = 0x8000_0000;

const BLS_SEED_KEY = new TextEncoder().encode("BLS HD seed");
const ED25519_SEED_KEY = new TextEncoder().encode("ed25519 seed");

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, index >>> 0);
  return out;
}

/** A child number: an index below 2^31, offset when hardened. */
function childNumber(index: number, hardened: boolean): number {
  assertIndex(index, "Child index");
  return hardened ? index + HARDENED_OFFSET : index;
}

/** The compressed G1 point of a BLS secret in both of dashbls's encodings. */
export interface DashBlsPublicKey {
  /** IETF/ZCash encoding: ProRegTx version 2 and later, `protx register`. */
  readonly basic: Uint8Array;
  /** dashbls legacy encoding: ProRegTx version 1, `protx register_legacy`. */
  readonly legacy: Uint8Array;
}

function blsPublicKey(secret: bigint): DashBlsPublicKey {
  const basic = bls12_381.G1.Point.BASE.multiply(secret).toBytes(true);
  // Basic sets 0x80 for compression and 0x20 for the sign of y; legacy sets 0x80 for the sign only.
  const legacy = Uint8Array.from(basic);
  legacy[0] = (basic[0]! & 0x1f) | ((basic[0]! & 0x20) !== 0 ? 0x80 : 0);
  return { basic, legacy };
}

function blsScalar(bytes: Uint8Array): bigint {
  const secret = bytesToNumberBE(bytes) % bls12_381_Fr.ORDER;
  if (secret === 0n) throw new Error("This BLS key index gives an invalid key; use another index.");
  return secret;
}

/**
 * dashbls ExtendedPrivateKey (src/extendedprivatekey.cpp): the master secret and chain code are
 * HMAC-SHA256("BLS HD seed", seed || 0x00 and 0x01). A child hashes the 32-byte secret (hardened,
 * without BIP32's leading zero) or the 48-byte public key (normal, in the legacy encoding that
 * PrivateChild uses by default, as dashj and the Platform wallet derive) followed by ser32(i).
 */
export class DashBlsHdKey {
  readonly #secret: bigint;
  readonly #chainCode: Uint8Array;

  private constructor(secret: bigint, chainCode: Uint8Array) {
    this.#secret = secret;
    this.#chainCode = chainCode;
  }

  static fromSeed(seed: Uint8Array): DashBlsHdKey {
    const left = hmac(sha256, BLS_SEED_KEY, concat(seed, Uint8Array.of(0)));
    try {
      return new DashBlsHdKey(
        blsScalar(left),
        hmac(sha256, BLS_SEED_KEY, concat(seed, Uint8Array.of(1))),
      );
    } finally {
      wipe(left);
    }
  }

  child(index: number, hardened: boolean): DashBlsHdKey {
    const number = childNumber(index, hardened);
    const secret = this.secretKey();
    const data = concat(hardened ? secret : blsPublicKey(this.#secret).legacy, ser32(number));
    const tweak = hmac(sha256, this.#chainCode, concat(data, Uint8Array.of(0)));
    try {
      const childSecret = (this.#secret + blsScalar(tweak)) % bls12_381_Fr.ORDER;
      if (childSecret === 0n) throw new Error("This BLS key index gives an invalid key.");
      return new DashBlsHdKey(
        childSecret,
        hmac(sha256, this.#chainCode, concat(data, Uint8Array.of(1))),
      );
    } finally {
      wipe(secret, data, tweak);
    }
  }

  /** The 32-byte big-endian secret; the caller wipes it. */
  secretKey(): Uint8Array {
    return numberToBytesBE(this.#secret, 32);
  }

  /** A copy of the chain code, for known-answer checks; the caller wipes it. */
  chainCode(): Uint8Array {
    return Uint8Array.from(this.#chainCode);
  }

  publicKey(): DashBlsPublicKey {
    return blsPublicKey(this.#secret);
  }

  wipe(): void {
    wipe(this.#chainCode);
  }
}

/** SLIP-10 for Ed25519: HMAC-SHA512("ed25519 seed", seed), then hardened children only. */
export class Slip10Ed25519Key {
  readonly #privateKey: Uint8Array;
  readonly #chainCode: Uint8Array;

  private constructor(output: Uint8Array) {
    this.#privateKey = output.slice(0, 32);
    this.#chainCode = output.slice(32);
    wipe(output);
  }

  static fromSeed(seed: Uint8Array): Slip10Ed25519Key {
    return new Slip10Ed25519Key(hmac(sha512, ED25519_SEED_KEY, seed));
  }

  /** The hardened child `index'`; SLIP-10 defines no normal Ed25519 child. */
  child(index: number): Slip10Ed25519Key {
    const data = concat(Uint8Array.of(0), this.#privateKey, ser32(childNumber(index, true)));
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

  publicKey(): Uint8Array {
    return ed25519.getPublicKey(this.#privateKey);
  }

  wipe(): void {
    wipe(this.#privateKey, this.#chainCode);
  }
}

/** DIP28's platformNodeID: the first 20 bytes of SHA-256 of the Ed25519 public key, not HASH160. */
export function platformNodeId(publicKey: Uint8Array): Uint8Array {
  return sha256(publicKey).slice(0, 20);
}
