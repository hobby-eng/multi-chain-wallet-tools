// Base58Check addresses, as Bitcoin writes them: a version prefix and a 20-byte hash, followed by
// the first four bytes of their double SHA-256, in Bitcoin's alphabet or a coin's own. The coins
// that write all their addresses so are instances of Base58Coin; the families that write some in
// another form extend it.
//
// Host-neutral, with @scure/base (test/portable-modules.test.ts).

import { base58, type BytesCoder } from "@scure/base";
import { HASH160_BYTES, type AddressType } from "./address-types.js";
import { checkedData } from "./base58-check.js";
import {
  Coin,
  invalidAddress,
  WRONG_LENGTH,
  type CoinAddress,
  type CoinDescription,
  type CoinRules,
  unreadableAddress,
} from "./coin.js";
import { equalBytes } from "../bits.js";

/** One version prefix of a coin's addresses, and what it names. */
export interface Base58Version {
  readonly prefix: readonly number[];
  readonly type: AddressType;
  /** A Bitcoin test network address, on coin type 1. */
  readonly testnet: boolean;
}

export interface Base58CoinDescription extends CoinDescription, CoinRules {
  /** In the order they are tried: the first prefix that the decoded bytes start with names them. */
  readonly versions: readonly Base58Version[];
  /** The coin's Base58 alphabet; Bitcoin's when it has none of its own. */
  readonly alphabet?: BytesCoder;
}

/** A coin whose addresses, or some of them, are Base58Check. */
export class Base58Coin extends Coin {
  readonly #versions: readonly Base58Version[];
  readonly #alphabet: BytesCoder;

  constructor(description: Base58CoinDescription) {
    super(description);
    this.#versions = description.versions;
    this.#alphabet = description.alphabet ?? base58;
  }

  protected read(text: string): CoinAddress {
    return this.readBase58(text);
  }

  /** `text` as a Base58Check address of one of the coin's versions. */
  protected readBase58(text: string): CoinAddress {
    const data = checkedData(text, this.#alphabet);
    if (data === undefined) throw unreadableAddress();
    const version = this.#versions.find(({ prefix }) =>
      equalBytes(data.subarray(0, prefix.length), prefix),
    );
    if (version === undefined) throw this.notOurs();
    const hash = data.subarray(version.prefix.length);
    // Every Base58Check address commits to 20 bytes: a HASH160, or Tron's Keccak account.
    if (hash.length !== HASH160_BYTES) throw invalidAddress(WRONG_LENGTH);
    // Base58 writes given bytes in one way only, so the address as typed is its standard form.
    return this.address(version.type, hash, text, version.testnet);
  }
}
