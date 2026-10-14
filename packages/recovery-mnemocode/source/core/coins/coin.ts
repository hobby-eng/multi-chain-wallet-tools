// What the coin families of this folder share: a coin, which reads its single-key receiving
// addresses, and an address so read, reduced to what identifies it, with the paths where wallets
// put it and its comparison with a public key. Each family module writes its coins' addresses in
// its own way on top of the Coin class; core/coins.ts lists the coins.
//
// Every coin uses secp256k1 keys on BIP44-style paths m/purpose'/coin'/account'/branch/index, or,
// for Dash Platform, on DIP17 paths m/9'/coin'/17'/account'/key_class'/index; they differ only in
// how a public key becomes an address. A key's HASH160 on BIP44's paths is the rule; a family that
// writes other kinds gives their commitments and purposes (CoinRules), so that a host of one coin
// carries no other coin's.
//
// Host-neutral (test/portable-modules.test.ts).

import { NORMAL_INDEX_RANGE } from "../bip32-limits.js";
import { inWholeRange, integerRefusal } from "../typed-number.js";
import { hash160, type AddressType } from "./address-types.js";
import { writtenAsAnAddress } from "./other-forms.js";
import { trimWhiteSpace, asciiLowercase } from "../white-space.js";
import { equalBytes } from "../bits.js";

/** The identifier of each coin, as a host names it, such as "bitcoin-cash". */
export type CoinId =
  | "bitcoin"
  | "bitcoin-cash"
  | "cosmos"
  | "dash"
  | "dogecoin"
  | "ethereum"
  | "ethereum-classic"
  | "injective"
  | "litecoin"
  | "tron"
  | "xrp"
  | "zcash";

/** Where in a wallet an address sits: the account, the branch (DIP17's key class) and the index. */
export interface AddressLocation {
  readonly account: number;
  readonly branch: number;
  readonly index: number;
}

/** What a person and a host know a coin by. */
export interface CoinDescription {
  readonly id: CoinId;
  /** The name a person knows it by, such as "Bitcoin Cash". */
  readonly name: string;
  /** How its supported addresses begin, such as "1…, 3…, bc1q… or bc1p…". */
  readonly addressForms: string;
  /**
   * The SLIP-44 coin types of its main network's paths. A coin that forked from another, such as
   * Bitcoin Cash from Bitcoin, has its own first and the other's second: its wallets use either.
   */
  readonly coinTypes: readonly number[];
}

/** How an address commits to a compressed secp256k1 public key, where not by its HASH160. */
export type KeyCommitment = (publicKey: Uint8Array) => Uint8Array;

/** What a family adds for its address types that are not BIP44's legacy kind. */
export interface CoinRules {
  /** The types that commit otherwise than to the key's HASH160, and how. */
  readonly commitments?: Readonly<Partial<Record<AddressType, KeyCommitment>>>;
  /** The types whose paths begin otherwise than with BIP44's 44, and with what. */
  readonly purposes?: Readonly<Partial<Record<AddressType, number>>>;
}

/** SLIP-44: every test network uses coin type 1. */
const TESTNET_COIN_TYPE = 1;
/** BIP44: the first step of the paths of legacy single-key addresses. */
const BIP44_PURPOSE = 44;

/** Why an address is refused, as the reasons below say it. */
export function invalidAddress(reason: string, kind: AddressRefusalKind = "other"): AddressRefusal {
  return new AddressRefusal(reason, kind);
}

/**
 * What an address refusal is about: an address of a script or of several keys; text that this
 * coin cannot read, which parse calls another coin's address when it is written as one; or another.
 */
export type AddressRefusalKind = "not-single-key" | "unreadable" | "other";

/**
 * The refusal of an address, with its `reason`, one of the reasons below or a family's own, so
 * that a caller tells the reasons apart by it and never by the words of the message.
 */
export class AddressRefusal extends Error {
  readonly reason: string;
  readonly kind: AddressRefusalKind;

  constructor(reason: string, kind: AddressRefusalKind = "other") {
    super(`The address cannot be used for the check: ${reason}.`);
    this.name = "AddressRefusal";
    this.reason = reason;
    this.kind = kind;
  }
}

/** The reasons that several families give. */
export const DAMAGED = "its checksum or format is wrong";

/**
 * A refusal of text that this coin cannot read, damaged (`reason` DAMAGED) or of a form it does not
 * allow: parse makes it the address of another coin where the text is written as one.
 */
export function unreadableAddress(reason: string = DAMAGED): AddressRefusal {
  return invalidAddress(reason, "unreadable");
}
export const WRONG_LENGTH = "it has the wrong length";

/**
 * A coin whose single-key receiving addresses can be compared with a phrase's keys. A class
 * because a coin owns what describes it and the reading of its addresses; each family adds only
 * how its addresses are written.
 */
export abstract class Coin implements CoinDescription {
  readonly id: CoinId;
  readonly name: string;
  readonly addressForms: string;
  readonly coinTypes: readonly number[];
  readonly #commitments: Readonly<Partial<Record<AddressType, KeyCommitment>>>;
  readonly #purposes: Readonly<Partial<Record<AddressType, number>>>;

  constructor(description: CoinDescription & CoinRules) {
    this.id = description.id;
    this.name = description.name;
    this.addressForms = description.addressForms;
    this.coinTypes = Object.freeze([...description.coinTypes]);
    this.#commitments = Object.freeze({ ...description.commitments });
    this.#purposes = Object.freeze({ ...description.purposes });
  }

  /** What an address of `type` commits to for `publicKey`: its HASH160 unless the family says. */
  commitmentOf(type: AddressType, publicKey: Uint8Array): Uint8Array {
    return (this.#commitments[type] ?? hash160)(publicKey);
  }

  /**
   * The path of the branch that holds an address of `type` at `location`, with `coinType`: BIP44's
   * shape, its first step the purpose of the type (BIP44's 44 unless the family says).
   */
  branchPathOf(type: AddressType, coinType: number, location: AddressLocation): string {
    return `${this.accountPathOf(type, coinType, location.account)}/${location.branch}`;
  }

  /**
   * The path of the account `account` that holds addresses of `type`, with `coinType`:
   * m/purpose'/coin'/account', the purpose of the type (BIP44's 44 unless the family says).
   */
  accountPathOf(type: AddressType, coinType: number, account: number): string {
    return `m/${this.purposeOf(type)}'/${coinType}'/${account}'`;
  }

  /** The coin types of the coin's paths: its own, or coin type 1 on every test network. */
  coinTypesOn(testnet: boolean): readonly number[] {
    return testnet ? [TESTNET_COIN_TYPE] : this.coinTypes;
  }

  /** The paths of the branch at `location` for addresses of `type`, one for each coin type. */
  branchPathsOf(type: AddressType, testnet: boolean, location: AddressLocation): string[] {
    return this.coinTypesOn(testnet).map((coinType) => this.branchPathOf(type, coinType, location));
  }

  /** The paths of the account `account` for addresses of `type`, one for each coin type. */
  accountPathsOf(type: AddressType, testnet: boolean, account: number): string[] {
    return this.coinTypesOn(testnet).map((coinType) => this.accountPathOf(type, coinType, account));
  }

  /** The first step of the paths of addresses of `type`: BIP44's 44 unless the family says. */
  purposeOf(type: AddressType): number {
    return this.#purposes[type] ?? BIP44_PURPOSE;
  }

  /**
   * `text` as a single-key receiving address of this coin; refused, naming why, when it belongs
   * to another coin, to a script or to several keys, is damaged, or is out of reach (shielded).
   * A host checks an answer with it at once: no secret is needed.
   */
  parse(text: string): CoinAddress {
    const trimmed = trimWhiteSpace(text);
    try {
      return this.read(trimmed);
    } catch (error) {
      // What this coin cannot read but is valid in another coin's form is that coin's address;
      // with this coin's own prefix it is this coin's, damaged.
      if (
        error instanceof AddressRefusal &&
        error.kind === "unreadable" &&
        !startsWithAny(trimmed, this.ownPrefixes) &&
        writtenAsAnAddress(trimmed)
      )
        throw this.notOurs();
      throw error;
    }
  }

  /**
   * How the coin's addresses in a form with a prefix begin, such as "bc1" or "bitcoincash:": an
   * address so written that cannot be read is this coin's, damaged, not another coin's.
   */
  protected get ownPrefixes(): readonly string[] {
    return [];
  }

  /**
   * What a person calls an address of `type`, where the coin has several kinds; none here. The
   * network is the address's to name (CoinAddress.description).
   */
  describe(_type: AddressType): string | undefined {
    return undefined;
  }

  /** The refusal of a shielded address, which no key of the wallet's paths gives: use `instead`. */
  protected shielded(instead: string): Error {
    return invalidAddress(`it is shielded; use ${instead} address of the same wallet`);
  }

  /** Reads the trimmed `text`, as the family writes its addresses. */
  protected abstract read(text: string): CoinAddress;

  /** The address of this coin that `text`, its standard form, names. */
  protected address(
    type: AddressType,
    commitment: Uint8Array,
    text: string,
    testnet = false,
  ): CoinAddress {
    return new CoinAddress(this, type, commitment, text, testnet);
  }

  /** The refusal of an address that is not this coin's. */
  protected notOurs(): Error {
    return invalidAddress(`it is not an address of ${this.name} (${this.addressForms})`);
  }

  /** The forms of the coin's addresses of one key, which singleKeyOnly names: its address forms. */
  protected get singleKeyForms(): string {
    return this.addressForms;
  }

  /**
   * The refusal of an address of this coin that no single key gives, such as a script's, in one
   * wording for every coin and every entry, with the coin's own forms of one key.
   */
  protected singleKeyOnly(): Error {
    return invalidAddress(
      `it is not the address of a single key; only ${this.singleKeyForms} can be checked`,
      "not-single-key",
    );
  }
}

/**
 * A receiving address reduced to what identifies it: its coin, whether it is a test network
 * address, its type, and the 20-byte hash or 32-byte Taproot key it commits to, which stays inside.
 * Made by a coin's parse, which refuses everything else, so it always names a real single-key
 * address.
 */
export class CoinAddress {
  readonly coin: Coin;
  readonly type: AddressType;
  /** A Bitcoin testnet or signet address, or a Dash Platform testnet one: coin type 1. */
  readonly testnet: boolean;
  /** The address in its standard form, such as lower case for Bech32 and EIP-55 for Ethereum. */
  readonly text: string;
  readonly #commitment: Uint8Array;

  constructor(
    coin: Coin,
    type: AddressType,
    commitment: Uint8Array,
    text: string,
    testnet: boolean,
  ) {
    this.coin = coin;
    this.type = type;
    this.#commitment = Uint8Array.from(commitment);
    this.text = text;
    this.testnet = testnet;
  }

  /**
   * Its type, for a person, where its coin has several: "nested SegWit (BIP49)", "testnet,
   * Taproot (BIP86)", "Platform payment (DIP17)" or, for Zcash, "transparent".
   */
  get description(): string | undefined {
    const kind = this.coin.describe(this.type);
    return kind === undefined || !this.testnet ? kind : `testnet, ${kind}`;
  }

  /**
   * The paths where wallets put it at `location`: one for each coin type of its coin, or coin
   * type 1 on a test network. Every step down to the account is hardened, and on DIP17 the key
   * class too.
   */
  pathsAt(location: AddressLocation): string[] {
    return this.branchPathsAt(location).map((path) => `${path}/${location.index}`);
  }

  /**
   * The paths of the branch that holds the address at `location`, as pathsAt gives them without
   * the last step: the index, which is never hardened, so that the addresses that follow it are
   * derived from the branch's key one step each.
   */
  branchPathsAt(location: AddressLocation): string[] {
    assertAddressLocation(location);
    return this.coin.branchPathsOf(this.type, this.testnet, location);
  }

  /** Whether `publicKey`, a compressed secp256k1 key, is the key of this address. */
  isAddressOf(publicKey: Uint8Array): boolean {
    const derived = this.coin.commitmentOf(this.type, publicKey);
    return equalBytes(derived, this.#commitment);
  }
}

/**
 * Refuses a location that names no BIP32 path: each of its numbers is an index below 2^31, which
 * the path hardens itself where it must.
 */
export function assertAddressLocation(location: AddressLocation): void {
  for (const name of ["account", "branch", "index"] as const) {
    const value = location[name];
    if (!inWholeRange(value, NORMAL_INDEX_RANGE))
      throw new Error(integerRefusal(name, NORMAL_INDEX_RANGE));
  }
}

// The rules of typed text (white-space.ts), here too for the coin families that take them with the
// coin.
export { asciiLowercase, asciiUppercase, trimWhiteSpace } from "../white-space.js";

/**
 * The coins that a host offers, each once, and the one lookup of a coin by its identifier. A host
 * passes the coins it builds in, so that a check of one coin needs no list of every coin
 * (core/coins.ts).
 */
export class CoinList {
  readonly #coins: readonly Coin[];

  /** Refuses anything that is not a coin of this folder, and a coin given twice. */
  constructor(coins: readonly Coin[]) {
    const owned = Array.from(coins);
    if (!owned.every((coin) => coin instanceof Coin))
      throw new TypeError("The coins of a wallet check must be coins of core/coins/.");
    if (new Set(owned.map((coin) => coin.id)).size !== owned.length)
      throw new Error("The coins of a wallet check must each be given once.");
    this.#coins = Object.freeze(owned);
  }

  /** The coins, in the order given. */
  get all(): readonly Coin[] {
    return this.#coins;
  }

  /**
   * The coin whose identifier is `id`, such as "bitcoin-cash", in either case; refused, naming the
   * coins there are, when none has it.
   */
  byId(id: string): Coin {
    const wanted = asciiLowercase(trimWhiteSpace(String(id)));
    const coin = this.#coins.find((candidate) => candidate.id === wanted);
    if (coin === undefined)
      throw new Error(
        `Unknown coin "${id}"; the coins are ${this.#coins.map((known) => known.id).join(", ")}.`,
      );
    return coin;
  }
}

/** Whether `text` starts with one of `prefixes`, in either case. */
export function startsWithAny(text: string, prefixes: readonly string[]): boolean {
  const lowercase = asciiLowercase(text);
  return prefixes.some((prefix) => lowercase.startsWith(prefix));
}
