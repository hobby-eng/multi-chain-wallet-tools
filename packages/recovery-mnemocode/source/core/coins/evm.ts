// The other coins of Ethereum-style accounts: Ethereum Classic, written as Ethereum's are (its
// reader is ethereum.ts's), and Tron, which writes the account in Base58Check. Injective, a Cosmos
// SDK chain with the same keys, writes it as Cosmos accounts are written (cosmos.ts).
//
// Host-neutral: it imports only base58.ts, ethereum.ts, keccak-account.ts and what they import
// (test/portable-modules.test.ts).

import { Base58Coin } from "./base58.js";
import { HexCoin } from "./ethereum.js";
import { KECCAK_RULES } from "./keccak-account.js";

/** Ethereum Classic: Ethereum's addresses (0x…), on its own coin type and on Ethereum's. */
export const ETHEREUM_CLASSIC = new HexCoin({
  id: "ethereum-classic",
  name: "Ethereum Classic",
  addressForms: "0x…",
  // Its own coin type, and Ethereum's, from which it forked.
  coinTypes: [61, 60],
  ...KECCAK_RULES,
});

/** Tron: Base58Check addresses (T…) of the Keccak-256 hash of one key, as Ethereum's. */
export const TRON = new Base58Coin({
  id: "tron",
  name: "Tron",
  addressForms: "T…",
  coinTypes: [195],
  // Tron's address prefix 0x41 before the Keccak account.
  versions: [{ prefix: [0x41], type: "keccak", testnet: false }],
  ...KECCAK_RULES,
});
