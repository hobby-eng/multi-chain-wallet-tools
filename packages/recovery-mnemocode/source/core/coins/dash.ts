// Dash: Dash Core addresses "X…" in Base58Check on BIP44 paths, and Dash Platform payment addresses
// "dash1k…" (testnet "tdash1k…") in Bech32m after DIP18's type byte, on DIP17 paths with hardened
// key classes. Orchard shielded addresses and other Platform types are refused with their reason.
//
// Host-neutral: it imports only base58.ts, bech32.ts, coin.ts, address-types.ts and @scure/base
// (test/portable-modules.test.ts).

import { bech32m } from "@scure/base";
import { HASH160_BYTES, type AddressType } from "./address-types.js";
import { Base58Coin } from "./base58.js";
import { BECH32_GROUP_BITS, bech32Groups, decodeBech32, Bech32Prefixes } from "./bech32.js";
import { BITS_PER_BYTE } from "../bits.js";
import {
  asciiLowercase,
  invalidAddress,
  startsWithAny,
  WRONG_LENGTH,
  type AddressLocation,
  type CoinAddress,
  unreadableAddress,
} from "./coin.js";
import { defined } from "../defined.js";

/** DIP18's human-readable parts on the main and the test network. */
const PLATFORM = new Bech32Prefixes("dash", "tdash");
/** DIP18's type bytes: the payment address of one DIP17 key, and an Orchard shielded address. */
const PLATFORM_P2PKH = 0xb0;
const PLATFORM_ORCHARD = 0x10;
/** The type byte and the hash of a payment address. */
const PAYMENT_BYTES = 1 + HASH160_BYTES;
/**
 * The type byte and the hash are 21 bytes, 168 bits: 34 five-bit groups, 170 bits, whose last two
 * are padding and zero (BIP173). Only that encoding is the address; another group at the end, or
 * padding bits set, would read as the same bytes.
 */
const PAYMENT_GROUPS = bech32Groups(PAYMENT_BYTES);
const PADDING_MASK = 2 ** (PAYMENT_GROUPS * BECH32_GROUP_BITS - PAYMENT_BYTES * BITS_PER_BYTE) - 1;
/** DIP9's feature paths begin with 9, and DIP17 is the feature of Platform payment keys. */
const DIP9_PURPOSE = 9;
const DIP17_FEATURE = 17;

class DashCoin extends Base58Coin {
  /** "Core (BIP44)", or "Platform payment (DIP17)". */
  override describe(type: AddressType): string {
    if (type !== "dash-platform") return `Core (BIP${this.purposeOf(type)})`;
    return `Platform payment (DIP${DIP17_FEATURE})`;
  }

  /** DIP17: m/9'/coin'/17'/account' for Platform payment keys, DIP9's purpose and feature. */
  override accountPathOf(type: AddressType, coinType: number, account: number): string {
    if (type !== "dash-platform") return super.accountPathOf(type, coinType, account);
    return `m/${this.purposeOf(type)}'/${coinType}'/${DIP17_FEATURE}'/${account}'`;
  }

  /** DIP17: the account's path, then the key class hardened, m/9'/coin'/17'/account'/class'. */
  override branchPathOf(type: AddressType, coinType: number, location: AddressLocation): string {
    if (type !== "dash-platform") return super.branchPathOf(type, coinType, location);
    return `${this.accountPathOf(type, coinType, location.account)}/${location.branch}'`;
  }

  protected override get ownPrefixes(): readonly string[] {
    return PLATFORM.starts;
  }

  protected override read(text: string): CoinAddress {
    return startsWithAny(text, this.ownPrefixes) ? this.#readPlatform(text) : this.readBase58(text);
  }

  #readPlatform(text: string): CoinAddress {
    const decoded = decodeBech32(text, bech32m);
    if (!decoded) throw unreadableAddress();
    const testnet = PLATFORM.testnetOf(decoded.prefix);
    if (testnet === undefined) throw this.notOurs();
    const [type, ...hash] = bytesOf(decoded.words);
    if (type === PLATFORM_P2PKH) {
      if (hash.length !== HASH160_BYTES) throw invalidAddress(WRONG_LENGTH);
      const last = defined(decoded.words[decoded.words.length - 1]);
      if (decoded.words.length !== PAYMENT_GROUPS || (last & PADDING_MASK) !== 0)
        throw unreadableAddress();
      return this.address("dash-platform", Uint8Array.from(hash), asciiLowercase(text), testnet);
    }
    if (type === PLATFORM_ORCHARD) throw this.shielded("a Dash Core X… or Platform dash1k…");
    throw this.singleKeyOnly();
  }
}

/**
 * The whole bytes that five-bit groups hold, the bits left over ignored: what the address's type
 * byte and length are read from, before its encoding is checked.
 */
function bytesOf(groups: readonly number[]): number[] {
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const group of groups) {
    // At most seven bits wait and five arrive: twelve bits hold them.
    accumulator = ((accumulator << BECH32_GROUP_BITS) | group) & 0xfff;
    bits += BECH32_GROUP_BITS;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Dash: legacy addresses of one key (X…) and Dash Platform addresses (dash1k…). */
export const DASH = new DashCoin({
  id: "dash",
  name: "Dash",
  addressForms: "X… or dash1k…",
  coinTypes: [5],
  versions: [{ prefix: [0x4c], type: "p2pkh", testnet: false }],
  purposes: { "dash-platform": DIP9_PURPOSE },
});
