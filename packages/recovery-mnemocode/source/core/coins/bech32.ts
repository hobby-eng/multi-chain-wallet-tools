// Bech32 and Bech32m strings outside SegWit, as Cosmos SDK accounts and Dash Platform addresses
// (DIP18) are written: with BIP173's own limits, where a SegWit decoder holds a string to 90
// characters.
//
// Host-neutral, with @scure/base (test/portable-modules.test.ts).

import type { Bech32, Bech32Decoded } from "@scure/base";
import { BITS_PER_BYTE } from "../bits.js";

/** BIP173: the bits of one group of the data, which one character writes. */
export const BECH32_GROUP_BITS = 5;

/** The groups that `bytes` bytes take in the data, the last one padded with zero bits (BIP173). */
export function bech32Groups(bytes: number): number {
  return Math.ceil((bytes * BITS_PER_BYTE) / BECH32_GROUP_BITS);
}

/** BIP173: the human-readable part has 1 to 83 characters. */
const MAX_PREFIX_LENGTH = 83;
/**
 * BIP173 and BIP350: both checksums are BCH codes of length 1023. A longer string, counted whole,
 * is refused, as a string whose checksum fails.
 */
const MAX_LENGTH = 1023;

/**
 * The human-readable part, in small letters, and the five-bit groups of data of `text`, read with
 * `checksum`, the bech32 or bech32m of @scure/base; undefined when it is not a string of that
 * checksum within BIP173's limits.
 */
export function decodeBech32(text: string, checksum: Bech32): Bech32Decoded | undefined {
  const decoded = checksum.decodeUnsafe(text, MAX_LENGTH);
  return decoded && decoded.prefix.length <= MAX_PREFIX_LENGTH ? decoded : undefined;
}

/** BIP173: the 32 characters that Bech32 writes five-bit groups in, by their value. */
export const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** BIP173: the separator between the human-readable part and the data. */
export const BECH32_SEPARATOR = "1";

/**
 * The human-readable parts of a coin's Bech32 strings, on its main network and on a test network
 * where it has one. A value type, so that every family tells its strings and their network the
 * same way; a prefix that is none of these, the family refuses as another coin's.
 */
export class Bech32Prefixes {
  readonly #mainnet: string;
  readonly #testnet: string | undefined;

  constructor(mainnet: string, testnet?: string) {
    this.#mainnet = mainnet;
    this.#testnet = testnet;
  }

  get mainnet(): string {
    return this.#mainnet;
  }

  /** How strings of these prefixes begin, the separator included: "bc1", "tb1". */
  get starts(): readonly string[] {
    const prefixes = this.#testnet === undefined ? [this.#mainnet] : [this.#mainnet, this.#testnet];
    return prefixes.map((prefix) => `${prefix}${BECH32_SEPARATOR}`);
  }

  /** Whether `prefix`, as a decoder reads it, is the test network's; undefined when it is none. */
  testnetOf(prefix: string): boolean | undefined {
    if (prefix === this.#mainnet) return false;
    return this.#testnet !== undefined && prefix === this.#testnet ? true : undefined;
  }
}
