// The two non-secp256k1 key schemes of a Dash masternode: the operator's BLS12-381 key, derived as
// dashbls's ExtendedPrivateKey derives it ("BLS HD"), and the Evonode's Platform node key, an
// Ed25519 key derived by SLIP-10 (../../slip10-ed25519.ts, shared with the Ed25519 coins). Both run
// on the pinned Noble curves and hashes; neither adds a hand-written field or group operation. The
// BLS secret is a JavaScript big integer, which cannot be wiped; its byte form and every chain code
// are wiped as soon as they are no longer needed.
import { bls12_381, bls12_381_Fr } from "@noble/curves/bls12-381.js";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes as concat, wipe } from "@ckd/core/crypto.js";
import { childNumber } from "../../ed25519-hd-common.js";
import { ser32 } from "../../slip10-ed25519.js";

const BLS_SEED_KEY = new TextEncoder().encode("BLS HD seed");

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
  const [tag = 0] = basic;
  legacy[0] = (tag & 0x1f) | ((tag & 0x20) !== 0 ? 0x80 : 0);
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
    const leftInput = concat(seed, Uint8Array.of(0));
    const rightInput = concat(seed, Uint8Array.of(1));
    const left = hmac(sha256, BLS_SEED_KEY, leftInput);
    try {
      return new DashBlsHdKey(blsScalar(left), hmac(sha256, BLS_SEED_KEY, rightInput));
    } finally {
      wipe(left, leftInput, rightInput);
    }
  }

  child(index: number, hardened: boolean): DashBlsHdKey {
    const number = childNumber(index, hardened);
    const secret = this.secretKey();
    const data = concat(hardened ? secret : blsPublicKey(this.#secret).legacy, ser32(number));
    const tweakInput = concat(data, Uint8Array.of(0));
    const chainInput = concat(data, Uint8Array.of(1));
    const tweak = hmac(sha256, this.#chainCode, tweakInput);
    try {
      const childSecret = (this.#secret + blsScalar(tweak)) % bls12_381_Fr.ORDER;
      if (childSecret === 0n) throw new Error("This BLS key index gives an invalid key.");
      return new DashBlsHdKey(childSecret, hmac(sha256, this.#chainCode, chainInput));
    } finally {
      wipe(secret, data, tweak, tweakInput, chainInput);
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

/** DIP28's platformNodeID: the first 20 bytes of SHA-256 of the Ed25519 public key, not HASH160. */
export function platformNodeId(publicKey: Uint8Array): Uint8Array {
  return sha256(publicKey).slice(0, 20);
}
