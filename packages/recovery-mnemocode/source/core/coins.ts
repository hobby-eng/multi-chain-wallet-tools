// The coins whose single-key receiving addresses a recovered phrase can be compared with: twelve
// coins on their standard paths. Bitcoin on BIP44 (legacy), BIP49 (nested SegWit), BIP84 (native
// SegWit) and BIP86 (Taproot), mainnet or testnet; Litecoin likewise without Taproot; BIP44 for
// the others; and Dash Platform payment addresses on DIP17. Multisignature and script addresses,
// shielded Zcash and Dash addresses and other coins' addresses are refused, naming why.
//
// This is the part's entry: the list of coins, a coin by its identifier, and the check of an
// address as typed, which a host runs at once, before any secret is asked. The comparison with a
// phrase is core/wallet-evidence.ts's "coin-address" evidence. Each coin family is a module of
// core/coins/. A coin of a family that is there is added in three places: its entry in the
// family's module, its identifier in CoinId (core/coins/coin.ts), which keeps evidence typed, and
// its place in COINS below.
//
// Host-neutral: it imports only core/coins/, @scure/base, @noble/hashes and @noble/curves
// (test/portable-modules.test.ts).

import { BITCOIN_CASH } from "./coins/bitcoin-cash.js";
import { BITCOIN, DOGECOIN, LITECOIN, ZCASH } from "./coins/bitcoin-like.js";
import { CoinList, type Coin, type CoinId } from "./coins/coin.js";
import { COSMOS, INJECTIVE } from "./coins/cosmos.js";
import { DASH } from "./coins/dash.js";
import { ETHEREUM } from "./coins/ethereum.js";
import { ETHEREUM_CLASSIC, TRON } from "./coins/evm.js";
import { XRP } from "./coins/xrp.js";

export type { AddressType } from "./coins/address-types.js";
export { assertAddressLocation } from "./coins/coin.js";
export type { AddressLocation, Coin, CoinAddress, CoinDescription, CoinId } from "./coins/coin.js";

/**
 * Every coin by its identifier: a record, so that the compiler wants each identifier once. A test
 * checks that each key is its coin's identifier.
 */
export const COIN_OF_ID: Readonly<Record<CoinId, Coin>> = Object.freeze({
  bitcoin: BITCOIN,
  "bitcoin-cash": BITCOIN_CASH,
  cosmos: COSMOS,
  dash: DASH,
  dogecoin: DOGECOIN,
  ethereum: ETHEREUM,
  "ethereum-classic": ETHEREUM_CLASSIC,
  injective: INJECTIVE,
  litecoin: LITECOIN,
  tron: TRON,
  xrp: XRP,
  zcash: ZCASH,
});

/** Every coin, in the alphabetical order of their names, the order a host offers them in. */
export const COINS: readonly Coin[] = Object.freeze(
  Object.values(COIN_OF_ID).sort((left, right) => left.name.localeCompare(right.name, "en")),
);

/** Every coin, each once, which the command line's wallet checks offer. */
const COIN_LIST = new CoinList(COINS);

/** The coin of an identifier such as "bitcoin-cash", in either case; refused when unknown. */
export function coinById(id: string): Coin {
  return COIN_LIST.byId(id);
}

/**
 * An address as typed, in its standard form, when it is a single-key receiving address of `coin`;
 * refused, naming why, otherwise. A host checks an answer with it at once: no secret is needed.
 */
export function parseCoinAddress(coin: string, text: string): string {
  return coinById(coin).parse(text).text;
}
