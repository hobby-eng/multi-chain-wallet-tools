// The form of a Cardano root key of CIP-3 (cardano-foundation/CIPs @7720fed CIP-0003): kL ‖ kR ‖
// chain code, 32 bytes each, with the bits of a BIP32-Ed25519 root (Khovratovich and Law, §V.A) that
// CIP-3 sets. Data and two bit operations only, so that the page's Icarus root (cardano-icarus.ts)
// and the worker's keys (coin-protocols/src/bip32-ed25519.ts) read one rule without each other's code.

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
