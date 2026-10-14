// Bitcoin Cash: CashAddr addresses, with or without their "bitcoincash:" prefix, and the legacy
// Base58Check form "1…" that it shares with Bitcoin. Its wallets use its own coin type or, as the
// chain it forked from, Bitcoin's.
//
// Host-neutral, with @scure/base; it takes Bitcoin's version bytes from bitcoin-versions.ts, not
// Bitcoin's coin (test/portable-modules.test.ts).

import { base58, bech32 } from "@scure/base";
import { HASH160_BYTES } from "./address-types.js";
import { Base58Coin } from "./base58.js";
import { checkedData } from "./base58-check.js";
import { CASHADDR_CHECKSUM_GROUPS } from "./other-forms.js";
import { asciiLowercase, asciiUppercase, type CoinAddress, unreadableAddress } from "./coin.js";
import { BECH32_ALPHABET } from "./bech32.js";
import { BITCOIN_P2PKH_VERSION, BITCOIN_P2SH_VERSION } from "./bitcoin-versions.js";

/** The prefix of CashAddr addresses on Bitcoin Cash's main network. */
const CASHADDR_PREFIX = "bitcoincash";
/** The version byte of a P2PKH address with a 160-bit hash; any other is a script or a size. */
const P2PKH_160_VERSION = 0;
/** The Base58Check version of a script address, "3…", which Bitcoin Cash has as Bitcoin does. */
const P2SH_VERSION = BITCOIN_P2SH_VERSION;
/** The generators of the CashAddr checksum, a BCH code over five-bit groups. */
const POLYMOD_GENERATORS = [
  0x98f2bc8e61n,
  0x79b76d99e2n,
  0xf33e5fb3c4n,
  0xae2eabe2a8n,
  0x1e4f43e470n,
];
/** The checksum is kept in 40 bits; the top five leave before each group enters. */
const POLYMOD_TOP_SHIFT = 35n;
const POLYMOD_KEPT_BITS = 0x07ffffffffn;

class BitcoinCashCoin extends Base58Coin {
  protected override get ownPrefixes(): readonly string[] {
    return [`${CASHADDR_PREFIX}:`];
  }

  protected override read(text: string): CoinAddress {
    // A valid Base58Check address is read as one, so that "3…" or another coin's is not taken
    // for a CashAddr in mixed case.
    const legacy = checkedData(text, base58);
    if (text.startsWith("1") || legacy !== undefined) {
      if (legacy?.[0] === P2SH_VERSION) throw this.singleKeyOnly();
      return this.readBase58(text);
    }
    return this.#readCashAddr(text);
  }

  /** A CashAddr address in either case; only P2PKH with a 160-bit hash ("q…") is single-key. */
  #readCashAddr(text: string): CoinAddress {
    const lowercase = asciiLowercase(text);
    const separator = lowercase.indexOf(":");
    if (separator >= 0 && lowercase.slice(0, separator) !== CASHADDR_PREFIX) throw this.notOurs();
    const payload = lowercase.slice(separator + 1);
    const groups = [...payload].map((character) => BECH32_ALPHABET.indexOf(character));
    if (groups.includes(-1)) throw this.notOurs();
    // Only what could be a CashAddr is held to its rule of one case; an address of another coin,
    // such as an XRP or EIP-55 one whose letters all fit the alphabet, is not this coin's.
    if (lowercase !== text && asciiUppercase(text) !== text)
      throw unreadableAddress("it mixes capital and small letters, which CashAddr does not allow");
    // The prefix enters the checksum as the low five bits of each character, then a zero.
    const prefixGroups = [...CASHADDR_PREFIX].map((character) => character.charCodeAt(0) & 0x1f);
    if (
      groups.length <= CASHADDR_CHECKSUM_GROUPS ||
      polymod([...prefixGroups, 0, ...groups]) !== 0n
    )
      throw unreadableAddress();
    // Strict: the padding must be zero and shorter than a group.
    const data = bech32.fromWordsUnsafe(groups.slice(0, -CASHADDR_CHECKSUM_GROUPS));
    if (!data) throw unreadableAddress();
    const [version, ...hash] = data;
    if (version !== P2PKH_160_VERSION || hash.length !== HASH160_BYTES) throw this.singleKeyOnly();
    return this.address("p2pkh", Uint8Array.from(hash), `${CASHADDR_PREFIX}:${payload}`);
  }
}

/** The CashAddr checksum function: zero for a valid address. */
function polymod(groups: readonly number[]): bigint {
  let checksum = 1n;
  for (const group of groups) {
    const top = checksum >> POLYMOD_TOP_SHIFT;
    checksum = ((checksum & POLYMOD_KEPT_BITS) << 5n) ^ BigInt(group);
    POLYMOD_GENERATORS.forEach((generator, bit) => {
      if ((top >> BigInt(bit)) & 1n) checksum ^= generator;
    });
  }
  return checksum ^ 1n;
}

export const BITCOIN_CASH = new BitcoinCashCoin({
  id: "bitcoin-cash",
  name: "Bitcoin Cash",
  addressForms: "bitcoincash:q… or 1…",
  coinTypes: [145, 0],
  // The legacy form "1…", the same as Bitcoin's.
  versions: [{ prefix: [BITCOIN_P2PKH_VERSION], type: "p2pkh", testnet: false }],
});
