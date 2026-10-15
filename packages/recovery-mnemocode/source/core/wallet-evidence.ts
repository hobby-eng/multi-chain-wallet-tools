// Wallet evidence: whether a BIP39 phrase, with its BIP39 passphrase, is the wallet that one piece
// of evidence names, and the BIP32 master fingerprint of a phrase. The evidence is a master
// fingerprint, a master extended public key in any of its forms (xpub, ypub, zpub, Ypub, Zpub and
// the testnet tpub, upub, vpub, Upub, Vpub), or, in one or more of the four single-key Bitcoin
// profiles, an account extended public key at an account, or an address, a compressed public key
// or a WIF private key at an account, branch and index; on mainnet or testnet. Or it is a
// receiving address of one of the coins that the host offers, which it always names (every coin
// of core/coins.ts on the command line) at an account, branch and index, compared on the paths
// where that coin's wallets put it. The host passes its coins, so that a build of a few coins
// carries no other coin's code. An address, a public key or a WIF may also be
// compared with several addresses in a row, from its index on, such as the first 20 of a wallet,
// when the person does not know which one it is. A program that checks wallets takes this module
// alone: it needs nothing about Seedshift, shares or cards.
//
// From the host it needs one function, PBKDF2-HMAC-SHA512, with which BIP39 turns a phrase into
// its seed. It may answer at once or with a promise: the command line passes node:crypto's
// pbkdf2Sync (bitcoin-evidence.ts) and calls match and fingerprint; a page passes WebCrypto's
// PBKDF2, which answers later, and calls matchAsync and fingerprintAsync, or the pbkdf2 of
// @noble/hashes/pbkdf2.js, which answers at once but is several times slower. The phrase and the
// passphrase are checked and normalized here (AUD-008-API005), so the host function gets only
// NFKD text, and the BIP39 constants stay here.
//
// It checks one phrase at a time and searches nothing; it does not contact a node or a block
// explorer, reads no file (a WIF comes as its value) and keeps nothing: every seed and private
// key it derives is wiped before it returns.
//
// The BIP39 seed rule, the master fingerprint and its check live in core/master-fingerprint.ts,
// which a host that tells wallets by their fingerprint alone takes without this module.
//
// Bitcoin's addresses are read, and their profiles' paths written, by Bitcoin's coin
// (core/coins/bitcoin-like.ts), as every coin address is; @scure/btc-signer writes only WIF keys.
//
// Host-neutral, with @scure/bip32, @scure/btc-signer and @noble/curves
// (test/portable-modules.test.ts).

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { HDKey, type Versions } from "@scure/bip32";
import { NETWORK, TEST_NETWORK, WIF } from "@scure/btc-signer";
import { addressCount, matchAtPath, scanBranch, type KeyMatch } from "./address-scan.js";
import {
  CoinAddressComparison,
  type CoinAddressEvidence,
  type CoinAddressMatch,
} from "./coin-address-evidence.js";
import type { AddressType } from "./coins/address-types.js";
import {
  checkedAddressLocation,
  Coin,
  CoinList,
  type AddressLocation,
  type CoinAddress,
  type CoinId,
  AddressRefusalError,
} from "./coins/coin.js";
import { BITCOIN } from "./coins/bitcoin-like.js";
import {
  Bip39Seed,
  fingerprintMatch,
  fingerprintOfKey,
  MasterFingerprintCheck,
  parseMasterFingerprint,
  type Pbkdf2HmacSha512,
} from "./master-fingerprint.js";
import { trimWhiteSpace } from "./white-space.js";
import { MASTER_KEY_PATH, type MatchedBy } from "./wallet-check.js";
import { hexOfBytes, bytesOfHex, equalBytes, HEX_DIGITS_PER_BYTE } from "./bits.js";
import { listInWords } from "./places.js";
import { defined } from "./defined.js";
import { ERRORS } from "./wallet-evidence-errors.js";

// What every caller of this module used here before the split keeps working.
export { parseMasterFingerprint, type Pbkdf2HmacSha512 };
// What a caller needs to write coin-address evidence.
export type { AddressLocation, CoinId };

/** The networks that evidence is compared on, mainnet first as the default. */
export const BITCOIN_NETWORKS = Object.freeze(["mainnet", "testnet"] as const);
/** A network that evidence is compared on (BITCOIN_NETWORKS). */
export type BitcoinNetworkName = (typeof BITCOIN_NETWORKS)[number];
/** The networks as a refusal names them: "mainnet or testnet". */
export const BITCOIN_NETWORKS_TEXT = listInWords(BITCOIN_NETWORKS, "or");
/**
 * The Bitcoin address profiles that an address is checked across: legacy, nested SegWit, native
 * SegWit and Taproot.
 */
export const bitcoinProfiles = Object.freeze([
  "legacy",
  "nested-segwit",
  "native-segwit",
  "taproot",
] as const);
/** One of the Bitcoin address profiles (bitcoinProfiles). */
export type BitcoinProfile = (typeof bitcoinProfiles)[number];

/** Whether `value` names a network that the evidence is compared on. A host words its refusal. */
export function isBitcoinNetwork(value: unknown): value is BitcoinNetworkName {
  return (BITCOIN_NETWORKS as readonly unknown[]).includes(value);
}

/** Whether `value` names one of the four profiles. A host words its refusal. */
export function isBitcoinProfile(value: unknown): value is BitcoinProfile {
  return typeof value === "string" && (bitcoinProfiles as readonly string[]).includes(value);
}

/**
 * The first receiving address of the first account on mainnet, m/…'/0'/0'/0/0: where a wallet is
 * looked for when nothing says otherwise.
 */
export const FIRST_RECEIVING_LOCATION = Object.freeze({
  network: BITCOIN_NETWORKS[0],
  account: 0,
  branch: 0,
  index: 0,
}) satisfies DerivationLocation;

/** Whether `location` is the first receiving address of the first account, on any network. */
export function isFirstReceiving(location: AddressLocation): boolean {
  const { account, branch, index } = FIRST_RECEIVING_LOCATION;
  return location.account === account && location.branch === branch && location.index === index;
}

/** A place of an address on a network: its account, branch and index. */
export interface DerivationLocation extends AddressLocation {
  readonly network: BitcoinNetworkName;
}

// The scan's limits, under the names every caller of this module has used.
export { DEFAULT_ADDRESS_COUNT, defaultAddressCount, MAX_ADDRESS_COUNT } from "./address-scan.js";

/** A key or an address of kind `K` at a place of a wallet, in its profiles. */
interface KeyAtPlace<K extends string> {
  readonly kind: K;
  readonly value: string;
  readonly profiles: readonly BitcoinProfile[];
  readonly location: DerivationLocation;
}

/** A key or an address of kind `K` looked for among addresses from its place on. */
interface ScannedKey<K extends string> extends KeyAtPlace<K> {
  /** How many addresses are compared, from the location's index on: one when left out. */
  readonly addresses?: number;
}

/** A key of kind `K` of the whole wallet, on a network. */
interface NetworkKey<K extends string> {
  readonly kind: K;
  readonly value: string;
  readonly network: BitcoinNetworkName;
}

/** Evidence of a Bitcoin wallet, in the forms that Bitcoin wallets show. */
export type BitcoinEvidence =
  | ScannedKey<"address">
  | ScannedKey<"compressed-public-key">
  | ScannedKey<"wif">
  | NetworkKey<"master-xpub">
  | KeyAtPlace<"account-xpub">
  | NetworkKey<"master-fingerprint">;

/**
 * Every kind of evidence: Bitcoin's, and a receiving address of a coin that the host offers,
 * Bitcoin included, whose address names its type and network.
 */
export type WalletEvidence =
  | BitcoinEvidence
  | (Omit<CoinAddressEvidence, "coin"> & { readonly kind: "coin-address"; readonly coin: CoinId });

/** What a comparison with evidence says: a wallet match, with the kind and what was derived. */
export interface EvidenceMatch extends CoinAddressMatch {
  readonly kind: WalletEvidence["kind"];
}

/** BIP32 and SLIP-132 version bytes of the root keys that the comparison derives. */
const mainnetVersions: Versions = { private: 0x0488ade4, public: 0x0488b21e };
const testnetVersions: Versions = { private: 0x04358394, public: 0x043587cf };

/**
 * The facts of each Bitcoin network that the comparison needs: whether it is a test network, as
 * a coin's paths say it (Coin.coinTypesOn), the version bytes of its root key, and its WIF.
 */
const NETWORK_FACTS = Object.freeze({
  mainnet: { testnet: false, versions: mainnetVersions, wif: NETWORK },
  testnet: { testnet: true, versions: testnetVersions, wif: TEST_NETWORK },
}) satisfies Readonly<
  Record<
    BitcoinNetworkName,
    { readonly testnet: boolean; readonly versions: Versions; readonly wif: typeof NETWORK }
  >
>;

/** The network that a coin's test-network flag names. */
function networkNamed(testnet: boolean): BitcoinNetworkName {
  return defined(BITCOIN_NETWORKS.find((network) => NETWORK_FACTS[network].testnet === testnet));
}

/** The SLIP-132 forms of an extended public key, by their four-character prefix. */
const extendedKeyVersions: Readonly<
  Record<string, { readonly versions: Versions; readonly network: BitcoinNetworkName }>
> = {
  xpub: { versions: mainnetVersions, network: "mainnet" },
  ypub: { versions: { private: 0x049d7878, public: 0x049d7cb2 }, network: "mainnet" },
  zpub: { versions: { private: 0x04b2430c, public: 0x04b24746 }, network: "mainnet" },
  Ypub: { versions: { private: 0x0295b005, public: 0x0295b43f }, network: "mainnet" },
  Zpub: { versions: { private: 0x02aa7a99, public: 0x02aa7ed3 }, network: "mainnet" },
  tpub: { versions: testnetVersions, network: "testnet" },
  upub: { versions: { private: 0x044a4e28, public: 0x044a5262 }, network: "testnet" },
  vpub: { versions: { private: 0x045f18bc, public: 0x045f1cf6 }, network: "testnet" },
  Upub: { versions: { private: 0x024285b5, public: 0x024289ef }, network: "testnet" },
  Vpub: { versions: { private: 0x02575048, public: 0x02575483 }, network: "testnet" },
};

/** The prefixes of the extended public keys accepted on `network`: xpub, ypub, … on mainnet. */
export function extendedPublicKeyPrefixes(network: BitcoinNetworkName): string[] {
  return Object.entries(extendedKeyVersions).flatMap(([prefix, metadata]) =>
    metadata.network === network ? [prefix] : [],
  );
}

/**
 * The kind of address that each profile writes. Bitcoin's coin owns the rest: the purpose of the
 * paths (BIP44, BIP49, BIP84, BIP86), what each kind commits to, and the reading of addresses.
 */
const PROFILE_TYPES: Readonly<Record<BitcoinProfile, AddressType>> = {
  legacy: "p2pkh",
  "nested-segwit": "p2sh-p2wpkh",
  "native-segwit": "p2wpkh",
  taproot: "p2tr",
};

/** The BIP whose paths a profile's addresses follow, as Bitcoin's coin says: 44 for legacy. */
export function bitcoinProfilePurpose(profile: BitcoinProfile): number {
  return BITCOIN.purposeOf(PROFILE_TYPES[profile]);
}

/** A compressed secp256k1 public key: a 02 or 03 byte and the 32 bytes of x. */
export const COMPRESSED_KEY_BYTES = 33;

/**
 * Compares BIP39 phrases with wallet evidence and gives their master fingerprints. A class because
 * the host's PBKDF2 and the coins it offers are bound once and every comparison uses them; it
 * holds nothing else, so one instance serves every phrase and every caller. Each operation has two
 * forms: match and fingerprint for a PBKDF2 that answers at once, matchAsync and fingerprintAsync
 * for one that may answer later.
 */
export class WalletEvidenceCheck {
  readonly #seed: Bip39Seed;
  readonly #fingerprints: MasterFingerprintCheck;
  readonly #coins: CoinList;

  /**
   * `coins` are those whose addresses "coin-address" evidence may name, which the host always
   * names: every coin of core/coins.ts on the command line, the coins of its build on a page.
   */
  constructor(pbkdf2: Pbkdf2HmacSha512, coins: readonly Coin[]) {
    this.#coins = new CoinList(coins);
    this.#seed = new Bip39Seed(pbkdf2);
    this.#fingerprints = new MasterFingerprintCheck(pbkdf2);
  }

  /**
   * Refuses evidence that no wallet can match, or that names a coin this check does not offer,
   * before any secret is asked. Needs no seed phrase.
   */
  assert(evidence: WalletEvidence): void {
    evidenceOf(evidence, this.#coins).wipe();
  }

  /**
   * Compares a recovered phrase with `evidence` locally. Evidence that no wallet can match is
   * refused before the seed is derived, as `assert` refuses it.
   */
  match(mnemonic: string, evidence: WalletEvidence, passphrase = ""): EvidenceMatch {
    const expected = evidenceOf(evidence, this.#coins);
    try {
      return this.#seed.withRoot(
        mnemonic,
        passphrase,
        (root) => expected.compare(root),
        versionsOf(expected.network),
      );
    } finally {
      expected.wipe();
    }
  }

  /** The same as match, with a PBKDF2 that may answer later. */
  async matchAsync(
    mnemonic: string,
    evidence: WalletEvidence,
    passphrase = "",
  ): Promise<EvidenceMatch> {
    const expected = evidenceOf(evidence, this.#coins);
    try {
      return await this.#seed.withRootLater(
        mnemonic,
        passphrase,
        (root) => expected.compare(root),
        versionsOf(expected.network),
      );
    } finally {
      expected.wipe();
    }
  }

  /** The standard four-byte BIP32 master fingerprint as lowercase hexadecimal. */
  fingerprint(mnemonic: string, passphrase = ""): string {
    return this.#fingerprints.fingerprint(mnemonic, passphrase);
  }

  /** The same as fingerprint, with a PBKDF2 that may answer later. */
  async fingerprintAsync(mnemonic: string, passphrase = ""): Promise<string> {
    return this.#fingerprints.fingerprintAsync(mnemonic, passphrase);
  }
}

/** The version bytes of the root key on `network`. */
function versionsOf(network: BitcoinNetworkName): Versions {
  return NETWORK_FACTS[network].versions;
}

/** The first key that `find` finds at one of `paths`, tried in their order. */
function firstFound<T>(
  paths: readonly string[],
  find: (path: string) => T | undefined,
): T | undefined {
  for (const path of paths) {
    const found = find(path);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * An address as typed, in its standard form on `network`; refused, naming why, unless it is an
 * address that one key of a seed phrase gives (P2PKH, P2SH-P2WPKH, P2WPKH or P2TR). A host checks
 * an answer with it at once: no secret is needed.
 */
export function parseBitcoinAddress(value: string, network: BitcoinNetworkName): string {
  return bitcoinAddressOn(value, network).text;
}

/**
 * An address as Bitcoin's coin reads it, refused unless it is on `network`: an address that is not
 * valid, or is of the other network, in the words that the evidence has always used; the address of
 * a script, which no single key gives, in the coin's own words.
 */
function bitcoinAddressOn(value: string, network: BitcoinNetworkName): CoinAddress {
  assertNetwork(network);
  let address: CoinAddress;
  try {
    address = BITCOIN.parse(value);
  } catch (error) {
    // An address of a script is Bitcoin's, only of no single key: said as the coin says it.
    if (error instanceof AddressRefusalError && error.code === "not-single-key") throw error;
    throw ERRORS.create("address-not-valid-bitcoin", [`${network}`]);
  }
  const on = networkNamed(address.testnet);
  if (on !== network)
    throw ERRORS.create("address-not-valid-bitcoin-address", [`${network}`, `${on}`]);
  return address;
}

/**
 * Refuses evidence that no wallet can match, before any secret is asked: everything that a
 * comparison would refuse at its first candidate, which may come only after the secrets were typed
 * and a long search ran. A "coin-address" names one of `coins`, the host's, as
 * WalletEvidenceCheck's `assert` takes its own. Needs no seed phrase.
 */
export function assertWalletEvidence(evidence: WalletEvidence, coins: readonly Coin[]): void {
  evidenceOf(evidence, new CoinList(coins)).wipe();
}

/** One piece of evidence, refused when it is built unless some wallet can match it. */
interface Evidence {
  /** The network whose versions the wallet's root key is built with. */
  readonly network: BitcoinNetworkName;
  /** The comparison with the wallet whose master key is `root`; wipes every key it derives. */
  compare(root: HDKey): EvidenceMatch;
  /** Wipes the secret that the evidence holds, a WIF's key (TS-07); public evidence holds none. */
  wipe(): void;
}

/**
 * Where the key that each kind of evidence names sits: the master key, an account key, or the key
 * of one address. Every fact of a kind follows from it and from EVIDENCE_MATCHED_BY, so that a new
 * kind is one more row in each.
 */
export type EvidenceLevel = "master" | "account" | "address";
const EVIDENCE_LEVELS = Object.freeze({
  "master-fingerprint": "master",
  "master-xpub": "master",
  "account-xpub": "account",
  address: "address",
  "compressed-public-key": "address",
  wif: "address",
  "coin-address": "address",
} satisfies Record<WalletEvidence["kind"], EvidenceLevel>);

/** The kinds whose key is one address's: compared with several addresses in a row. */
export type ScannedKind = {
  [K in keyof typeof EVIDENCE_LEVELS]: (typeof EVIDENCE_LEVELS)[K] extends "address" ? K : never;
}[keyof typeof EVIDENCE_LEVELS];

/** Whether evidence of `kind` names one key among several addresses in a row (`addresses`). */
export function isScannedKind(kind: string): kind is ScannedKind {
  return evidenceLevel(kind) === "address";
}

function evidenceLevel(kind: unknown): EvidenceLevel | undefined {
  if (typeof kind !== "string" || !Object.hasOwn(EVIDENCE_LEVELS, kind)) return undefined;
  // Membership was checked against the own keys of the static table.
  return EVIDENCE_LEVELS[kind as keyof typeof EVIDENCE_LEVELS];
}

/** Whether `evidence` names one key among several addresses in a row, as isScannedKind says. */
export function isScannedEvidence(
  evidence: WalletEvidence,
): evidence is Extract<WalletEvidence, { kind: ScannedKind }> {
  return isScannedKind(evidence.kind);
}

/** Whether evidence of `kind` sits at a place of an account; a master key has none. */
export function isPlacedKind(kind: string): boolean {
  const level = evidenceLevel(kind);
  return level !== undefined && level !== "master";
}

/**
 * What evidence of each kind compares the phrase with, as a line about its match names it, such
 * as ReEncoding's confirmationLine: an address, the fingerprint, or else a key, a WIF included.
 */
export const EVIDENCE_MATCHED_BY = Object.freeze({
  "master-fingerprint": "fingerprint",
  "master-xpub": "key",
  "account-xpub": "key",
  address: "address",
  "compressed-public-key": "key",
  wif: "key",
  "coin-address": "address",
} satisfies Record<WalletEvidence["kind"], MatchedBy>);

/**
 * The checked evidence of `evidence`, a coin address naming one of `coins`: the one place that
 * tells the kinds apart.
 */
function evidenceOf(evidence: WalletEvidence, coins: CoinList): Evidence {
  // A JavaScript caller or parsed configuration can pass any kind; an unknown one is an error, not
  // a comparison that failed, which would read as evidence against the wallet.
  if (
    !isScannedKind(evidence.kind) &&
    (evidence as { addresses?: unknown }).addresses !== undefined
  )
    throw ERRORS.create("only-address-address-another-coin-compressed-public-key", []);
  switch (evidence.kind) {
    case "master-fingerprint":
      return new MasterFingerprintEvidence(evidence.value, evidence.network);
    case "master-xpub":
      return new MasterKeyEvidence(evidence.value, evidence.network);
    case "address":
      return new AddressEvidence(evidence);
    case "compressed-public-key":
      return new PublicKeyEvidence(evidence);
    case "wif":
      return new WifEvidence(evidence);
    case "account-xpub":
      return new AccountKeyEvidence(evidence);
    case "coin-address":
      return new CoinEvidence(evidence, coins);
    default:
      throw ERRORS.create("unsupported-bitcoin-evidence-kind", []);
  }
}

/** The BIP32 master fingerprint: a filter of 32 bits, so a match carries a warning. */
class MasterFingerprintEvidence implements Evidence {
  readonly network: BitcoinNetworkName;
  readonly #expected: string;

  constructor(value: string, network: BitcoinNetworkName) {
    assertNetwork(network);
    this.#expected = parseMasterFingerprint(value);
    this.network = network;
  }

  compare(root: HDKey): EvidenceMatch {
    const derived = fingerprintOfKey(root);
    return { ...fingerprintMatch(derived, this.#expected), kind: "master-fingerprint", derived };
  }

  /** Holds no secret: nothing to wipe. */
  wipe(): void {}
}

/** The master extended public key, in any of its forms: only the key itself is compared. */
class MasterKeyEvidence implements Evidence {
  readonly network: BitcoinNetworkName;
  readonly #expected: HDKey;

  constructor(value: string, network: BitcoinNetworkName) {
    assertNetwork(network);
    this.#expected = extendedPublicKeyOn(value, network);
    this.network = network;
  }

  compare(root: HDKey): EvidenceMatch {
    return {
      matched: sameExtendedKey(root, this.#expected),
      kind: "master-xpub",
      derived: root.publicExtendedKey,
      path: MASTER_KEY_PATH,
    };
  }

  /** Holds no secret: nothing to wipe. */
  wipe(): void {}
}

type LocatedBitcoinEvidence = Exclude<
  BitcoinEvidence,
  { kind: "master-xpub" | "master-fingerprint" }
>;

/** Where in a profile the key that a located kind names sits. */
type KeyLevel = Exclude<EvidenceLevel, "master">;

/**
 * Evidence of one key at a place of the wallet: the account key, or the key at an account, branch
 * and index, in each of the profiles given. A base class because every such kind is placed,
 * checked and searched through the profiles in the same way; a kind adds only its comparison.
 */
abstract class LocatedEvidence implements Evidence {
  readonly network: BitcoinNetworkName;
  readonly #kind: LocatedBitcoinEvidence["kind"];
  readonly #location: DerivationLocation;
  readonly #addresses: number;
  readonly #profiles: readonly BitcoinProfile[];
  readonly #level: KeyLevel;

  /** Checks the place and the profiles, before the kind checks its value. */
  constructor(evidence: LocatedBitcoinEvidence, level: KeyLevel) {
    const source = evidence.location;
    const network = source.network;
    assertNetwork(network);
    const { account, branch, index } = checkedAddressLocation(source);
    this.#profiles = checkedBitcoinProfiles(evidence.profiles);
    this.#location = { network, account, branch, index };
    this.#addresses = isScannedEvidence(evidence) ? addressCount(evidence.addresses, index) : 1;
    this.#kind = evidence.kind;
    this.#level = level;
    this.network = network;
  }

  compare(root: HDKey): EvidenceMatch {
    for (const profile of this.#profiles) {
      const matchOf: KeyMatch = (node, publicKey) => this.derivedFrom(node, publicKey, profile);
      const found =
        this.#level === "account"
          ? firstFound(this.#accountPaths(profile), (path) => matchAtPath(root, path, matchOf))
          : firstFound(this.#branchPaths(profile), (path) =>
              scanBranch(
                root,
                path,
                { first: this.#location.index, count: this.#addresses },
                matchOf,
              ),
            );
      if (found !== undefined) return { matched: true, kind: this.#kind, ...found };
    }
    return { matched: false, kind: this.#kind };
  }

  /** A public key, address or account key: nothing to wipe; a WIF wipes its key. */
  wipe(): void {}

  /** The derived value to show when `node`, in `profile`, is the key of the evidence. */
  protected abstract derivedFrom(
    node: HDKey,
    publicKey: Uint8Array,
    profile: BitcoinProfile,
  ): string | undefined;

  /** The account's paths in `profile`, as Bitcoin's coin writes them on the evidence's network. */
  #accountPaths(profile: BitcoinProfile): string[] {
    const { network, account } = this.#location;
    return BITCOIN.accountPathsOf(PROFILE_TYPES[profile], NETWORK_FACTS[network].testnet, account);
  }

  /**
   * The paths of the branch at the evidence's place in `profile`, as Bitcoin's coin writes them.
   */
  #branchPaths(profile: BitcoinProfile): string[] {
    const location = this.#location;
    return BITCOIN.branchPathsOf(
      PROFILE_TYPES[profile],
      NETWORK_FACTS[location.network].testnet,
      location,
    );
  }
}

/**
 * A receiving or change address of one key, compared as Bitcoin's coin compares it: in a profile
 * that writes its kind, with what it commits to.
 */
class AddressEvidence extends LocatedEvidence {
  readonly #expected: CoinAddress;

  constructor(evidence: Extract<BitcoinEvidence, { kind: "address" }>) {
    super(evidence, "address");
    this.#expected = bitcoinAddressOn(evidence.value, evidence.location.network);
  }

  protected derivedFrom(_node: HDKey, publicKey: Uint8Array, profile: BitcoinProfile) {
    const address = this.#expected;
    return PROFILE_TYPES[profile] === address.type && address.isAddressOf(publicKey)
      ? address.text
      : undefined;
  }
}

/** A compressed public key, 33 bytes in hexadecimal. */
class PublicKeyEvidence extends LocatedEvidence {
  readonly #expected: Uint8Array;

  constructor(evidence: Extract<BitcoinEvidence, { kind: "compressed-public-key" }>) {
    super(evidence, "address");
    this.#expected = parseCompressedPublicKey(evidence.value);
  }

  protected derivedFrom(_node: HDKey, publicKey: Uint8Array) {
    return equalBytes(publicKey, this.#expected) ? hexOfBytes(publicKey) : undefined;
  }
}

/**
 * A WIF private key, given as its value. Its key is decoded into bytes at once and the text is not
 * kept (TS-07); the owner of the evidence wipes the key (WalletEvidenceCheck), as each derived key
 * it is compared with is wiped at once.
 */
class WifEvidence extends LocatedEvidence {
  readonly #key: Uint8Array;

  constructor(evidence: Extract<BitcoinEvidence, { kind: "wif" }>) {
    super(evidence, "address");
    this.#key = wifKey(evidence.value, this.network);
  }

  protected derivedFrom(node: HDKey) {
    // A copy of the node's key, which node.wipePrivateData() does not reach.
    const derivedKey = node.privateKey;
    if (derivedKey === null) throw ERRORS.create("unable-derive-private-key-wif-comparison", []);
    try {
      return equalBytes(derivedKey, this.#key)
        ? WIF(networkParameters(this.network)).encode(derivedKey)
        : undefined;
    } finally {
      derivedKey.fill(0);
    }
  }

  override wipe(): void {
    this.#key.fill(0);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** The extended public key of an account, in any of its forms. */
class AccountKeyEvidence extends LocatedEvidence {
  readonly #expected: HDKey;

  constructor(evidence: Extract<BitcoinEvidence, { kind: "account-xpub" }>) {
    super(evidence, "account");
    this.#expected = extendedPublicKeyOn(evidence.value, evidence.location.network);
  }

  protected derivedFrom(node: HDKey) {
    return sameExtendedKey(node, this.#expected) ? node.publicExtendedKey : undefined;
  }
}

/**
 * A receiving address of one of the host's coins, by its name, compared as core/coin-address-
 * evidence.ts compares an address of a coin given itself.
 */
class CoinEvidence implements Evidence {
  readonly network: BitcoinNetworkName;
  readonly #comparison: CoinAddressComparison;

  constructor(evidence: Extract<WalletEvidence, { kind: "coin-address" }>, coins: CoinList) {
    this.#comparison = new CoinAddressComparison({
      coin: coins.byId(evidence.coin),
      value: evidence.value,
      location: evidence.location,
      addresses: evidence.addresses,
    });
    this.network = networkNamed(this.#comparison.testnet);
  }

  compare(root: HDKey): EvidenceMatch {
    return { ...this.#comparison.compare(root), kind: "coin-address" };
  }

  /** Holds no secret: nothing to wipe. */
  wipe(): void {}
}

function assertNetwork(network: BitcoinNetworkName): void {
  if (!isBitcoinNetwork(network))
    throw ERRORS.create("bitcoin-network", [`${BITCOIN_NETWORKS_TEXT}`]);
}

/**
 * `profiles` copied, then checked: at least one, each one of the four (isBitcoinProfile). A hole
 * of a sparse list is copied as undefined and refused (AUD-012-API007). The evidence checks its
 * profiles with it, and the command line its list, after reading "auto" or the names given.
 */
export function checkedBitcoinProfiles(profiles: readonly unknown[]): readonly BitcoinProfile[] {
  const owned = Array.from(profiles);
  if (owned.length === 0) throw ERRORS.create("at-least-one-bitcoin-address-profile-selected", []);
  if (!owned.every(isBitcoinProfile)) throw ERRORS.create("unknown-bitcoin-address-profile", []);
  return Object.freeze(owned);
}

function networkParameters(network: BitcoinNetworkName): typeof NETWORK {
  return NETWORK_FACTS[network].wif;
}

/** equalBytes for the keys of an HDKey, which may be missing; a missing key matches nothing. */
function equalKeyBytes(left: Uint8Array | null, right: Uint8Array | null): boolean {
  return left !== null && right !== null && equalBytes(left, right);
}

function parseCompressedPublicKey(value: string): Uint8Array {
  const normalized = trimWhiteSpace(value).toLowerCase();
  const digits = COMPRESSED_KEY_BYTES * HEX_DIGITS_PER_BYTE;
  if (!new RegExp(`^[0-9a-f]{${digits}}$`, "u").test(normalized))
    throw ERRORS.create("compressed-public-key-exactly-bytes-encoded-as-hexadecimal", [
      `${COMPRESSED_KEY_BYTES}`,
      `${digits}`,
    ]);
  const bytes = bytesOfHex(normalized);
  if (bytes[0] !== 0x02 && bytes[0] !== 0x03)
    throw ERRORS.create("compressed-public-key-start-02-03", []);
  // Without this, a key that no wallet can have would only fail to match (AUD-008-API002).
  if (!secp256k1.utils.isValidPublicKey(bytes, true))
    throw ERRORS.create("compressed-public-key-not-point-secp256k1-curve", []);
  return bytes;
}

/** A WIF's private key, refused unless it is a valid secp256k1 secret: 1 to the group order − 1. */
function wifKey(value: string, network: BitcoinNetworkName): Uint8Array {
  let key: Uint8Array;
  try {
    key = WIF(networkParameters(network)).decode(trimWhiteSpace(value));
  } catch {
    throw ERRORS.create("wif-not-valid-bitcoin", [`${network}`]);
  }
  if (!secp256k1.utils.isValidSecretKey(key)) {
    key.fill(0);
    throw ERRORS.create("wif-holds-no-valid-secp256k1-private-key", []);
  }
  return key;
}

/**
 * An extended public key, refused unless its prefix is known and names `network`. Only public
 * versions are accepted, so the parsed key never holds a private key.
 */
function extendedPublicKeyOn(value: string, network: BitcoinNetworkName): HDKey {
  const prefix = trimWhiteSpace(value).slice(0, 4);
  const metadata = extendedKeyVersions[prefix];
  if (metadata === undefined)
    throw ERRORS.create("unsupported-extended-key-prefix-supported-public-forms-include", [
      `${listInWords(BITCOIN_NETWORKS.flatMap(extendedPublicKeyPrefixes))}`,
    ]);
  if (metadata.network !== network)
    throw ERRORS.create("extended-key-prefix-does-not-match-selected-bitcoin", []);
  try {
    return HDKey.fromExtendedKey(trimWhiteSpace(value), metadata.versions);
  } catch {
    throw ERRORS.create("extended-public-key-not-valid", []);
  }
}

/** Whether two extended keys are the same key, whatever versions they were written with. */
function sameExtendedKey(left: HDKey, right: HDKey): boolean {
  return (
    left.depth === right.depth &&
    left.index === right.index &&
    left.parentFingerprint === right.parentFingerprint &&
    equalKeyBytes(left.publicKey, right.publicKey) &&
    equalKeyBytes(left.chainCode, right.chainCode)
  );
}
