// Accounts of Cosmos SDK chains, such as "cosmos1…" or "inj1…": a chain's prefix and a 20-byte
// account in Bech32 (BIP173). Cosmos hashes the key with HASH160; Injective takes the Keccak account
// of Ethereum, whose coin type its wallets use.
//
// Host-neutral: it imports only coin.ts, address-types.ts, bech32.ts, keccak-account.ts and
// @scure/base (test/portable-modules.test.ts).

import { bech32 } from "@scure/base";
import { HASH160_BYTES, type AddressType } from "./address-types.js";
import { bech32Groups, decodeBech32, Bech32Prefixes } from "./bech32.js";
import {
  asciiLowercase,
  Coin,
  invalidAddress,
  WRONG_LENGTH,
  type CoinAddress,
  type CoinDescription,
  type CoinRules,
  unreadableAddress,
} from "./coin.js";
import { KECCAK_RULES } from "./keccak-account.js";

/** A 160-bit account is exactly 32 five-bit groups, with no padding. */
const ACCOUNT_GROUPS = bech32Groups(HASH160_BYTES);

/** A Cosmos SDK chain: its account prefix and how its account commits to the key. */
class Bech32AccountCoin extends Coin {
  readonly #prefixes: Bech32Prefixes;
  readonly #type: AddressType;

  constructor(
    description: CoinDescription &
      CoinRules & { readonly prefix: string; readonly type: AddressType },
  ) {
    super(description);
    this.#prefixes = new Bech32Prefixes(description.prefix);
    this.#type = description.type;
  }

  protected override get ownPrefixes(): readonly string[] {
    return this.#prefixes.starts;
  }

  protected read(text: string): CoinAddress {
    // Bech32, never Bech32m: the same data with the other checksum is no account.
    const decoded = decodeBech32(text, bech32);
    if (!decoded) throw unreadableAddress();
    // Its own prefix only: a Cosmos SDK account has no test-network form of its own here.
    if (this.#prefixes.testnetOf(decoded.prefix) === undefined) throw this.notOurs();
    // Counted in groups, so that an extra group under a valid checksum is refused for its length.
    if (decoded.words.length !== ACCOUNT_GROUPS) throw invalidAddress(WRONG_LENGTH);
    return this.address(this.#type, bech32.fromWords(decoded.words), asciiLowercase(text));
  }
}

export const COSMOS = new Bech32AccountCoin({
  id: "cosmos",
  name: "Cosmos",
  addressForms: "cosmos1…",
  coinTypes: [118],
  prefix: "cosmos",
  type: "p2pkh",
});

export const INJECTIVE = new Bech32AccountCoin({
  id: "injective",
  name: "Injective",
  addressForms: "inj1…",
  coinTypes: [60],
  prefix: "inj",
  type: "keccak",
  // Ethereum's account, written as Cosmos accounts are.
  ...KECCAK_RULES,
});
