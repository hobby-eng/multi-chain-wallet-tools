// BIP32-Ed25519, the hierarchical keys of Cardano's wallets: D. Khovratovich and J. Law,
// "BIP32-Ed25519: Hierarchical Deterministic Keys over a Non-linear Keyspace"
// (https://input-output-hk.github.io/adrestia/static/Ed25519_BIP.pdf, read 2026-11-13), in the
// "V2" form that cardano-serialization-lib and Trezor derive by (typed-io/rust-ed25519-bip32
// @2066bbf src/derivation/mod.rs L40-99; trezor-firmware @433075c crypto/cardano.c L98-143). A key
// is an extended Ed25519 key kL ‖ kR with a chain code. Children come from HMAC-SHA512 over
// little-endian indexes, normal and hardened. A signature is made with kL and kR directly, since
// these keys have no 32-byte Ed25519 seed. The roots are CIP-3's: Icarus and Icarus-Trezor from
// @ckd/core/cardano-icarus.js, Ledger's from a BIP39 seed here, both with the root bits of
// @ckd/core/cardano-root.js. It runs on the pinned Noble curves and hashes; every key and copy is
// wiped when its work ends.
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { BIP39_SEED_BYTES } from "@ckd/core/bip39-parameters.js";
import {
  CARDANO_KEY_PART_BYTES as PART_BYTES,
  CARDANO_ROOT_BYTES,
  CARDANO_ROOT_THIRD_BIT,
  hasCardanoRootBits,
  setCardanoRootBits,
} from "@ckd/core/cardano-root.js";
import { concatBytes, wipe } from "@ckd/core/crypto.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { childNumber, ED25519_SEED_KEY } from "./ed25519-hd-common.js";

/** Bytes of Z's left half that a child adds to kL, times 8 (paper §V.C). */
const ZL_BYTES = 28;
/** The order n of Ed25519's base point, which a key's scalar is reduced by. */
const BASE_ORDER = ed25519.Point.Fn.ORDER;

/**
 * The deepest key below a root: the paper's limit of 2^20 levels (§IV item 5), within which kL stays
 * below 2^255 (§V.F), so that no child's kL overflows and none is a multiple of n. Trezor keeps the
 * same limit (CARDANO_MAX_NODE_DEPTH, cardano.c L40).
 */
export const BIP32_ED25519_MAX_DEPTH = 2 ** 20;

/** The byte before the BIP39 seed in the HMAC-SHA256 of CIP-3's Ledger chain code. */
const LEDGER_CHAIN_CODE_PREFIX = 0x01;

/** The first byte of each HMAC of a child: its key half (Z) and its chain code (paper §V.C). */
const CHILD_PREFIX = Object.freeze({
  hardened: Object.freeze({ key: 0x00, chainCode: 0x01 }),
  normal: Object.freeze({ key: 0x02, chainCode: 0x03 }),
});

const ERRORS = new ErrorCatalog("cardano.key", {
  root: {
    kind: "range",
    text: () => `A Cardano root key has ${CARDANO_ROOT_BYTES} bytes with the bits that CIP-3 sets.`,
  },
  seed: {
    kind: "range",
    text: () => `CIP-3's Ledger root comes from a ${BIP39_SEED_BYTES}-byte BIP39 seed.`,
  },
  depth: {
    kind: "range",
    text: () => `A BIP32-Ed25519 key is at most ${BIP32_ED25519_MAX_DEPTH} levels below its root.`,
  },
});

/** One level of a path: an index below 2^31, and whether it is hardened. */
export interface Bip32Ed25519Level {
  readonly index: number;
  readonly hardened: boolean;
}

/** A level admitted by derive(): its child number and whether it is hardened. */
interface ChildStep {
  readonly number: number;
  readonly hardened: boolean;
}

/** A child number as four little-endian bytes, as BIP32-Ed25519 serializes it (unlike BIP32). */
function le32(childNumber: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, childNumber, true);
  return out;
}

/**
 * `base` + `addend` · 2^`shift`, little-endian over 32 bytes, a carry past 256 bits dropped, byte by
 * byte as ed25519-bip32's add_28_mul8_v2 (shift 3) and add_256bits_v2 (shift 0) compute it. The
 * depth limit keeps such a carry from arising for kL; for kR it is part of the scheme.
 */
function addShifted(base: Uint8Array, addend: Uint8Array, shift: number): Uint8Array {
  const out = new Uint8Array(PART_BYTES);
  let carry = 0;
  for (let at = 0; at < PART_BYTES; at += 1) {
    // A shorter addend (Z's 28-byte left half) has no bytes from its length on.
    const sum = (base[at] ?? 0) + ((addend[at] ?? 0) << shift) + carry;
    out[at] = sum & 0xff;
    carry = sum >> 8;
  }
  return out;
}

/**
 * The scalar of `kL` modulo n. A key's kL is a multiple of 8 between 2^254 and 2^255 (its root bits
 * and the depth limit, paper §V.F), while 8n exceeds 2^255, so it is never a multiple of n: the
 * paper's rule to discard such a child (§V.C) has nothing to discard here.
 */
function scalarOf(kL: Uint8Array): bigint {
  return bytesToNumberLE(kL) % BASE_ORDER;
}

/** An extended Ed25519 key of BIP32-Ed25519 at some depth below its root: kL, kR and a chain code. */
export class Bip32Ed25519Key implements Disposable {
  readonly #kL: Uint8Array;
  readonly #kR: Uint8Array;
  readonly #chainCode: Uint8Array;
  readonly #depth: number;
  #publicKey: Uint8Array | undefined;

  /** Takes ownership of the three parts; `publicKey`, when known, is [kL]B. */
  private constructor(
    kL: Uint8Array,
    kR: Uint8Array,
    chainCode: Uint8Array,
    depth: number,
    publicKey?: Uint8Array,
  ) {
    this.#kL = kL;
    this.#kR = kR;
    this.#chainCode = chainCode;
    this.#depth = depth;
    this.#publicKey = publicKey;
  }

  /**
   * The key of a CIP-3 root, kL ‖ kR ‖ chain code (@ckd/core/cardano-icarus.js), which is copied:
   * the caller wipes its own. Refuses (cardano.key.root) any other length, or a kL without the root
   * bits, such as a BIP39 seed given for a root.
   */
  static fromRoot(root: Uint8Array): Bip32Ed25519Key {
    if (root.length !== CARDANO_ROOT_BYTES || !hasCardanoRootBits(root))
      throw ERRORS.create("root", []);
    return new Bip32Ed25519Key(
      root.slice(0, PART_BYTES),
      root.slice(PART_BYTES, 2 * PART_BYTES),
      root.slice(2 * PART_BYTES),
      0,
    );
  }

  /**
   * CIP-3's Ledger and BitBox02 root of a BIP39 `seed` (cardano-foundation/CIPs @7720fed
   * CIP-0003/Ledger_BitBox02.md): HMAC-SHA512 keyed "ed25519 seed", hashed again while the third
   * highest bit of kL's last byte is set, kL's bits then set as CIP-3 writes them, and the chain
   * code HMAC-SHA256 of 0x01 and the original seed. The caller wipes its seed. Refuses
   * (cardano.key.seed) a seed of another length than BIP39's, such as a root given for a seed.
   */
  static fromLedgerSeed(seed: Uint8Array): Bip32Ed25519Key {
    if (seed.length !== BIP39_SEED_BYTES) throw ERRORS.create("seed", []);
    let digest = hmac(sha512, ED25519_SEED_KEY, seed);
    // Each round passes with probability one half; CIP-3 and Ledger's reference loop without a
    // bound, as does this.
    while (((digest[PART_BYTES - 1] ?? 0) & CARDANO_ROOT_THIRD_BIT) !== 0) {
      const again = hmac(sha512, ED25519_SEED_KEY, digest);
      wipe(digest);
      digest = again;
    }
    const prefixed = concatBytes(Uint8Array.of(LEDGER_CHAIN_CODE_PREFIX), seed);
    try {
      const kL = digest.slice(0, PART_BYTES);
      setCardanoRootBits(kL);
      const chainCode = hmac(sha256, ED25519_SEED_KEY, prefixed);
      return new Bip32Ed25519Key(kL, digest.slice(PART_BYTES), chainCode, 0);
    } finally {
      wipe(digest, prefixed);
    }
  }

  /**
   * The key `levels` below this one, a new key the caller wipes; this key is left as it is, and every
   * key between them is wiped. Before anything is derived, refuses an index outside 0 to 2^31 − 1
   * at any level, and (cardano.key.depth) a path that would end more than BIP32_ED25519_MAX_DEPTH
   * levels below the root.
   */
  derive(levels: readonly Bip32Ed25519Level[]): Bip32Ed25519Key {
    if (this.#depth + levels.length > BIP32_ED25519_MAX_DEPTH) throw ERRORS.create("depth", []);
    const steps: ChildStep[] = levels.map(({ index, hardened }) => ({
      number: childNumber(index, hardened),
      hardened,
    }));
    let key = new Bip32Ed25519Key(
      this.#kL.slice(),
      this.#kR.slice(),
      this.#chainCode.slice(),
      this.#depth,
      this.#publicKey,
    );
    for (const step of steps) {
      const parent = key;
      try {
        key = parent.#child(step);
      } finally {
        parent.wipe();
      }
    }
    return key;
  }

  /** The child of `step` (paper §V.C): Z from the private key when hardened, the public key when not. */
  #child(step: ChildStep): Bip32Ed25519Key {
    const prefix = step.hardened ? CHILD_PREFIX.hardened : CHILD_PREFIX.normal;
    const data = step.hardened
      ? concatBytes(Uint8Array.of(prefix.key), this.#kL, this.#kR, le32(step.number))
      : concatBytes(Uint8Array.of(prefix.key), this.publicKey(), le32(step.number));
    const z = hmac(sha512, this.#chainCode, data);
    data[0] = prefix.chainCode;
    const chain = hmac(sha512, this.#chainCode, data);
    try {
      return new Bip32Ed25519Key(
        addShifted(this.#kL, z.subarray(0, ZL_BYTES), 3),
        addShifted(this.#kR, z.subarray(PART_BYTES), 0),
        chain.slice(PART_BYTES),
        this.#depth + 1,
      );
    } finally {
      wipe(data, z, chain);
    }
  }

  /** The 32-byte Ed25519 public key, [kL]B (paper §III.B). */
  publicKey(): Uint8Array {
    this.#publicKey ??= ed25519.Point.BASE.multiply(scalarOf(this.#kL)).toBytes();
    return this.#publicKey.slice();
  }

  /** The extended public key, the public key and the chain code (CIP-5's xvk forms). */
  extendedPublicKey(): Uint8Array {
    return concatBytes(this.publicKey(), this.#chainCode);
  }

  /** A copy of kL ‖ kR, the 64 bytes that sign; the caller wipes it. */
  privateKey(): Uint8Array {
    return concatBytes(this.#kL, this.#kR);
  }

  /** A copy of the chain code, which a public key without it cannot derive below; the caller wipes it. */
  chainCode(): Uint8Array {
    return this.#chainCode.slice();
  }

  /**
   * The Ed25519 signature R ‖ S of `message` by this key (paper §III.B): r = SHA-512(kR ‖ M) mod n,
   * R = [r]B, S = r + SHA-512(R ‖ A ‖ M) · kL mod n. It verifies by RFC 8032 against publicKey(), as
   * any Ed25519 signature does; only the nonce's source differs from a seed's.
   */
  sign(message: Uint8Array): Uint8Array {
    const publicKey = this.publicKey();
    const nonceDigest = sha512.create().update(this.#kR).update(message).digest();
    try {
      const nonce = bytesToNumberLE(nonceDigest) % BASE_ORDER;
      const commitment = ed25519.Point.BASE.multiply(nonce).toBytes();
      const challenge =
        bytesToNumberLE(
          sha512.create().update(commitment).update(publicKey).update(message).digest(),
        ) % BASE_ORDER;
      const response = (nonce + challenge * scalarOf(this.#kL)) % BASE_ORDER;
      return concatBytes(commitment, numberToBytesLE(response, PART_BYTES));
    } finally {
      wipe(nonceDigest);
    }
  }

  /** Erases kL, kR and the chain code, as far as the runtime allows. */
  wipe(): void {
    wipe(this.#kL, this.#kR, this.#chainCode);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
