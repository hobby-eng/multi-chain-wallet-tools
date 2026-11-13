// A Cardano root key of CIP-3 (cardano-foundation/CIPs @7720fed CIP-0003): kL ‖ kR ‖ chain code,
// 32 bytes each, with the bits of a BIP32-Ed25519 root (Khovratovich and Law, §V.A) that CIP-3 sets,
// and the Icarus root of a phrase's entropy (CIP-0003/Icarus.md): PBKDF2-HMAC-SHA512 of the
// passphrase, salted with the BIP39 entropy (not the BIP39 seed), 4096 rounds, 96 bytes. Its variant
// Icarus-Trezor (same document; trezor-firmware @433075c core/src/apps/cardano/seed.py L139-144),
// Trezor's for wallets made from 24 words with older firmware, salts with the entropy and the
// phrase's checksum byte, and equals Icarus at every other word count. No word list: the page reads
// a phrase's entropy (cardano-icarus.ts), and the worker's keys (coin-protocols/src/bip32-ed25519.ts)
// and known answers read the same rules here.
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import {
  BIP39_ENTROPY_BYTES,
  bip39ChecksumBits,
  bip39WordCountOfEntropy,
} from "./bip39-parameters.js";
import { concatBytes, wipe } from "./crypto.js";
import { ErrorCatalog } from "./error-catalog.js";
import { orList } from "./listing.js";

/** CIP-3's master keys that come from a phrase's entropy: Icarus, and Trezor's variant of it. */
export type CardanoIcarusMaster = "icarus" | "icarus-trezor";

/** Bytes of each part of a key: kL, kR and the chain code. */
export const CARDANO_KEY_PART_BYTES = 32;
/** Bytes of a root, kL ‖ kR ‖ chain code: CIP-3 Icarus's "outputLen=96". */
export const CARDANO_ROOT_BYTES = 3 * CARDANO_KEY_PART_BYTES;

/** kL's lowest three bits, clear in every key: its scalar is a multiple of the cofactor 8. */
const LOW_BITS = 0b0000_0111;
/** The top three bits of kL's last byte, and the value a root has there: 010. */
const TOP_BITS = 0b1110_0000;
const ROOT_TOP_BITS = 0b0100_0000;
/** Where the top three bits are: kL's last byte. */
const LAST = CARDANO_KEY_PART_BYTES - 1;

/**
 * The third highest bit of kL's last byte, clear in every root (§V.A): CIP-3's Ledger master hashes
 * again while it is set, and Icarus clears it.
 */
export const CARDANO_ROOT_THIRD_BIT = 0b0010_0000;

/**
 * Sets CIP-3's root bits of `key`, whose first 32 bytes are kL, in place. Icarus.md writes them as
 * `data[0] &= 0b1111_1000; data[31] &= 0b0001_1111; data[31] |= 0b0100_0000`. Ledger_BitBox02.md
 * writes `& 0b0111_1111` for the second step, which gives the same byte there: its loop has already
 * left the third highest bit clear.
 */
export function setCardanoRootBits(key: Uint8Array): void {
  key[0] = (key[0] ?? 0) & ~LOW_BITS;
  key[LAST] = ((key[LAST] ?? 0) & ~TOP_BITS) | ROOT_TOP_BITS;
}

/** Whether `key`, whose first 32 bytes are kL, has CIP-3's root bits. */
export function hasCardanoRootBits(key: Uint8Array): boolean {
  return ((key[0] ?? 0) & LOW_BITS) === 0 && ((key[LAST] ?? 0) & TOP_BITS) === ROOT_TOP_BITS;
}

/** CIP-3 Icarus's PBKDF2 rounds ("iter=4096"). */
const ICARUS_ITERATIONS = 4096;
const ERRORS = new ErrorCatalog("cardano.root", {
  entropy: {
    kind: "range",
    text: () =>
      `A CIP-3 root comes from the entropy of a BIP39 phrase: ${orList(BIP39_ENTROPY_BYTES)} bytes.`,
  },
});

/** The one word count whose checksum Trezor's variant adds: there it is a whole byte (8 bits). */
const ICARUS_TREZOR_WORDS = 24;
const CHECKSUM_BYTES = bip39ChecksumBits(ICARUS_TREZOR_WORDS) / 8;

/** The PBKDF2 salt of `master`: the entropy, followed for a 24-word Icarus-Trezor root by its checksum byte. */
function saltOf(entropy: Uint8Array, master: CardanoIcarusMaster): Uint8Array {
  if (master !== "icarus-trezor" || bip39WordCountOfEntropy(entropy.length) !== ICARUS_TREZOR_WORDS)
    return entropy.slice();
  const digest = sha256(entropy);
  try {
    return concatBytes(entropy, digest.subarray(0, CHECKSUM_BYTES));
  } finally {
    wipe(digest);
  }
}

/**
 * The 96-byte CIP-3 root (kL ‖ kR ‖ chain code) under `master` of a phrase's BIP39 `entropy` and the
 * PBKDF2 `password` (the passphrase's bytes); the caller wipes the root and keeps its own inputs.
 * Refuses (cardano.root.entropy) bytes of a length no BIP39 phrase has, such as a BIP39 seed or a
 * TON phrase's entropy given for a phrase's entropy.
 */
export function cardanoIcarusRootOf(
  entropy: Uint8Array,
  password: Uint8Array,
  master: CardanoIcarusMaster,
): Uint8Array {
  if (bip39WordCountOfEntropy(entropy.length) === undefined) throw ERRORS.create("entropy", []);
  const salt = saltOf(entropy, master);
  try {
    const root = pbkdf2(sha512, password, salt, {
      c: ICARUS_ITERATIONS,
      dkLen: CARDANO_ROOT_BYTES,
    });
    setCardanoRootBits(root);
    return root;
  } finally {
    wipe(salt);
  }
}
