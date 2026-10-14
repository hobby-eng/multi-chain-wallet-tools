// Coins that write addresses as Bitcoin does: Base58Check with a version prefix, and for Bitcoin
// and Litecoin also SegWit in Bech32 or Bech32m (BIP173, BIP350). Bitcoin, Litecoin, Dogecoin and
// the transparent addresses of Zcash.
//
// Host-neutral, with @scure/base (test/portable-modules.test.ts).

import { bech32, bech32m } from "@scure/base";
import { HASH160_BYTES, type AddressType } from "./address-types.js";
import { Base58Coin, type Base58CoinDescription } from "./base58.js";
import {
  asciiLowercase,
  startsWithAny,
  type CoinAddress,
  type CoinRules,
  unreadableAddress,
} from "./coin.js";
import { nestedSegwitHash, taprootOutputKey, X_ONLY_KEY_BYTES } from "./taproot.js";
import { Bech32Prefixes, BECH32_SEPARATOR } from "./bech32.js";
import { BITCOIN_P2PKH_VERSION, BITCOIN_P2SH_VERSION } from "./bitcoin-versions.js";

/** The human-readable parts of a coin's SegWit addresses, and whether it has Taproot. */
interface SegwitPrefixes {
  /** Its SegWit strings' prefixes: Bitcoin's testnet and signet too, a coin without one not. */
  readonly prefixes: Bech32Prefixes;
  readonly taproot: boolean;
}

/** BIP173: a SegWit address has at most 90 characters. */
const SEGWIT_MAX_LENGTH = 90;
/** BIP141: witness versions 0 to 16, with programs of 2 to 40 bytes; version 0 has 20 or 32. */
const MAX_WITNESS_VERSION = 16;
const MIN_PROGRAM_BYTES = 2;
const MAX_PROGRAM_BYTES = 40;
const V0_PROGRAM_BYTES: ReadonlySet<number> = new Set([20, 32]);

/**
 * The SegWit kinds of single-key address: what they commit to, the first step of their paths
 * (the BIP of the same number), and what a person calls them.
 */
const SEGWIT_RULES: CoinRules = {
  commitments: { "p2sh-p2wpkh": nestedSegwitHash, p2tr: taprootOutputKey },
  purposes: { "p2sh-p2wpkh": 49, p2wpkh: 84, p2tr: 86 },
};
/**
 * The characters of a P2WPKH address besides its prefix: separator, version, key hash, checksum.
 */
const P2WPKH_CHARACTERS_AFTER_PREFIX = 40;
const TYPE_NAMES: Readonly<Partial<Record<AddressType, string>>> = {
  p2pkh: "legacy",
  "p2sh-p2wpkh": "nested SegWit",
  p2wpkh: "native SegWit",
  p2tr: "Taproot",
};

/** A Bitcoin-like coin with SegWit addresses besides its Base58Check ones. */
class SegwitCoin extends Base58Coin {
  readonly #segwit: SegwitPrefixes;

  constructor(description: Base58CoinDescription & { readonly segwit: SegwitPrefixes }) {
    super({ ...description, ...SEGWIT_RULES });
    this.#segwit = description.segwit;
  }

  /** The SegWit forms of one key: ltc1q with 43 characters, and on Bitcoin bc1p for Taproot. */
  protected override get singleKeyForms(): string {
    const { prefixes, taproot } = this.#segwit;
    const start = `${prefixes.mainnet}${BECH32_SEPARATOR}`;
    const keyHash = `${start}q with ${prefixes.mainnet.length + P2WPKH_CHARACTERS_AFTER_PREFIX} characters`;
    return taproot ? `${keyHash} or ${start}p` : keyHash;
  }

  protected override get ownPrefixes(): readonly string[] {
    return this.#segwit.prefixes.starts;
  }

  /** Such as "nested SegWit (BIP49)". */
  override describe(type: AddressType): string {
    return `${TYPE_NAMES[type]} (BIP${this.purposeOf(type)})`;
  }

  protected override read(text: string): CoinAddress {
    return startsWithAny(text, this.ownPrefixes) ? this.#readSegwit(text) : this.readBase58(text);
  }

  #readSegwit(text: string): CoinAddress {
    const decoded = decodeSegwit(text);
    if (decoded === undefined) throw unreadableAddress();
    const { prefix, version, program } = decoded;
    // BIP173 allows an address all in capitals, as in QR codes; the decoder refused mixed case.
    const testnet = this.#segwit.prefixes.testnetOf(prefix);
    if (testnet === undefined) throw this.notOurs();
    // The single-key programs: version 0 with the key's HASH160, version 1 with a Taproot key.
    let type: AddressType;
    if (version === 0 && program.length === HASH160_BYTES) type = "p2wpkh";
    else if (version === 1 && program.length === X_ONLY_KEY_BYTES && this.#segwit.taproot)
      type = "p2tr";
    else throw this.singleKeyOnly();
    return this.address(type, program, asciiLowercase(text), testnet);
  }
}

/**
 * A SegWit address's lower-case prefix, witness version and program, or undefined (BIP173, BIP350).
 */
function decodeSegwit(
  text: string,
): { readonly prefix: string; readonly version: number; readonly program: Uint8Array } | undefined {
  const withBech32 = bech32.decodeUnsafe(text, SEGWIT_MAX_LENGTH);
  const decoded = withBech32 || bech32m.decodeUnsafe(text, SEGWIT_MAX_LENGTH);
  if (!decoded) return undefined;
  const [version, ...groups] = decoded.words;
  if (version === undefined || version > MAX_WITNESS_VERSION) return undefined;
  // BIP350: version 0 carries a Bech32 checksum, every later version a Bech32m one.
  if ((version === 0) !== Boolean(withBech32)) return undefined;
  // Strict: the padding must be zero and shorter than a group.
  const program = bech32.fromWordsUnsafe(groups);
  if (!program || program.length < MIN_PROGRAM_BYTES || program.length > MAX_PROGRAM_BYTES)
    return undefined;
  if (version === 0 && !V0_PROGRAM_BYTES.has(program.length)) return undefined;
  return { prefix: decoded.prefix, version, program };
}

/**
 * Prefixes of Zcash shielded addresses: Sapling (Bech32), unified (Bech32m) and Sprout (Base58),
 * on mainnet and testnet. Their keys need Zcash's own curves and key tree (ZIP-32), so they are
 * refused with that reason rather than compared in vain.
 */
const ZCASH_SHIELDED_PREFIXES = ["zs1", "ztestsapling1", "u1", "utest1", "zc", "zt"];

/** Zcash, whose transparent addresses are Bitcoin's with a two-byte version. */
class ZcashCoin extends Base58Coin {
  override describe(): string {
    return "transparent";
  }

  protected override read(text: string): CoinAddress {
    if (startsWithAny(text, ZCASH_SHIELDED_PREFIXES)) throw this.shielded("a transparent t1…");
    return this.readBase58(text);
  }
}

// Version bytes from each coin's chain parameters. A "3…" address is taken as nested SegWit, the
// only single-key address of that form.
/**
 * Bitcoin: legacy, nested SegWit, native SegWit and Taproot addresses of one key, on the main
 * network and the test network.
 */
export const BITCOIN = new SegwitCoin({
  id: "bitcoin",
  name: "Bitcoin",
  addressForms: "1…, 3…, bc1q… or bc1p…",
  testnetAddressForms: "m…, n…, 2…, tb1q… or tb1p…",
  coinTypes: [0],
  versions: [
    { prefix: [BITCOIN_P2PKH_VERSION], type: "p2pkh", testnet: false },
    { prefix: [BITCOIN_P2SH_VERSION], type: "p2sh-p2wpkh", testnet: false },
    { prefix: [0x6f], type: "p2pkh", testnet: true },
    { prefix: [0xc4], type: "p2sh-p2wpkh", testnet: true },
  ],
  segwit: { prefixes: new Bech32Prefixes("bc", "tb"), taproot: true },
});

/** Litecoin: legacy, nested SegWit and native SegWit addresses of one key. */
export const LITECOIN = new SegwitCoin({
  id: "litecoin",
  name: "Litecoin",
  addressForms: "L…, M…, 3… or ltc1q…",
  coinTypes: [2],
  // "L…" and "M…", and the "3…" that Litecoin used before "M…".
  versions: [
    { prefix: [0x30], type: "p2pkh", testnet: false },
    { prefix: [0x32], type: "p2sh-p2wpkh", testnet: false },
    { prefix: [BITCOIN_P2SH_VERSION], type: "p2sh-p2wpkh", testnet: false },
  ],
  segwit: { prefixes: new Bech32Prefixes("ltc"), taproot: false },
});

/** Dogecoin: legacy addresses of one key. */
export const DOGECOIN = new Base58Coin({
  id: "dogecoin",
  name: "Dogecoin",
  addressForms: "D…",
  coinTypes: [3],
  versions: [{ prefix: [0x1e], type: "p2pkh", testnet: false }],
});

/** Zcash: transparent addresses of one key (t1…). */
export const ZCASH = new ZcashCoin({
  id: "zcash",
  name: "Zcash",
  addressForms: "t1…",
  coinTypes: [133],
  versions: [{ prefix: [0x1c, 0xb8], type: "p2pkh", testnet: false }],
});
