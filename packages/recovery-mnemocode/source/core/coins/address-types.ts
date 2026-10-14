// The kinds of single-key receiving address that the coins of core/coins.ts read, and the HASH160
// that most of them commit to. What the other kinds commit to belongs to the family that writes
// them (taproot.ts for Bitcoin's, keccak-account.ts for Ethereum's), so that a host of one coin,
// such as Dash, carries no other coin's code. Only public keys enter here.
//
// Host-neutral: it imports only @noble/hashes (test/portable-modules.test.ts).

import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { HASH160_BYTES } from "./address-sizes.js";

/**
 * How an address commits to a public key. p2pkh: HASH160 of the key, as legacy addresses ("1…",
 * "L…", "D…", "X…", "t1…", a Bitcoin Cash "q…"), XRP and Cosmos have it; p2sh-p2wpkh: nested
 * SegWit, "3…" or "M…"; p2wpkh: native SegWit, "bc1q…" or "ltc1q…"; p2tr: Taproot, "bc1p…"; keccak:
 * the account of Ethereum, its networks, Ethereum Classic, Tron and Injective; dash-platform: a
 * Dash Platform payment address, "dash1k…", HASH160 of the key written after DIP18's type byte.
 */
export type AddressType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr" | "keccak" | "dash-platform";

// The size of a HASH160 is address-sizes.ts's; here too for the families that take it with it.
export { HASH160_BYTES };

/** RIPEMD-160 of SHA-256, Bitcoin's hash of keys and scripts. */
export function hash160(bytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(bytes));
}
