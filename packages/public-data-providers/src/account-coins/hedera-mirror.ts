// Hedera's account states from the public mainnet mirror node's REST API, one request at a time.
// Hedera numbers its accounts (0.0.N) when it creates them, so a lookup finds the accounts its
// value names: an account number reads that account (GET /api/v1/accounts/0.0.N), an EVM address
// the account whose alias or long-zero form it is (GET /api/v1/accounts/0x…), and a key's alias
// every account the key alone controls (GET /api/v1/accounts?account.publickey=…, one page of at
// most 100; the filter takes an Ed25519 key's 32 bytes or a compressed secp256k1 key's 33 bytes in
// hex, not their DER). An ECDSA key's alias also reads the account of its EVM address alias, which
// an account created by a transfer to that address holds before it ever signs, so it has no key
// yet. The mirror node answers 404 for a number or an address it does not hold. A state lists the
// accounts it found with their balances and sums them; a deleted account counts as used and holds
// nothing. Staking rewards not yet paid and tokens are not read.
import {
  hederaLongZeroAddress,
  hederaLookupOf,
  hederaTypedLookup,
  type HederaLookup,
} from "@ckd/coins/hedera/account.js";
import {
  ACCOUNT_COIN_ERRORS,
  MAX_NUMBERED_ACCOUNTS,
  type AccountAnswerChecks,
} from "../account-coin-facts.js";
import {
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJsonAnswer } from "../http.js";

/** The mirror node's HTTP status of a number or an address it holds no account of. */
const NOT_FOUND_STATUS = 404;
/** The mirror node's key types of an account that one Ed25519 or one ECDSA key controls. */
const KEY_TYPES = { key: "ED25519", "ecdsa-key": "ECDSA_SECP256K1" } as const;

/** One account of a mirror node answer: its number, whether deleted, balance and EVM address. */
interface MirrorAccount {
  readonly id: string;
  readonly deleted: boolean;
  readonly balance: string;
  readonly evmAddress: unknown;
  readonly key: unknown;
}

/** The account `value` of an answer; refuses one without a canonical number or a balance. */
function mirrorAccount(checks: AccountAnswerChecks, value: unknown): MirrorAccount {
  const account = checks.record(value, "malformed account data");
  const id = account.account;
  if (typeof id !== "string" || hederaLookupOf(id)?.kind !== "account")
    throw checks.fail("malformed account data");
  if (typeof account.deleted !== "boolean") throw checks.fail("malformed account data");
  const balance = checks.integer(checks.record(account.balance, "no balance").balance, "a balance");
  // A deleted account's balance went to its transfer account when it was deleted.
  if (account.deleted && balance !== "0") throw checks.fail("a deleted account with a balance");
  return {
    id,
    deleted: account.deleted,
    balance,
    evmAddress: account.evm_address,
    key: account.key,
  };
}

/** The number of a canonical account ID, for ordering. */
const numberOf = (id: string): bigint => BigInt(id.slice("0.0.".length));

/**
 * The state of `address` from the accounts it found: the live ones in ascending order of their
 * numbers, each with its balance, and their sum; an account found twice is listed once.
 */
function stateOf(address: string, found: readonly MirrorAccount[]): AddressRead {
  const live = new Map(
    found.filter(({ deleted }) => !deleted).map((account) => [account.id, account]),
  );
  const accounts = [...live.values()]
    .sort((left, right) => {
      const difference = numberOf(left.id) - numberOf(right.id);
      return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    })
    .map(({ id, balance }) => ({ id, balance }));
  return {
    state: {
      address,
      exists: accounts.length > 0,
      used: found.length > 0,
      balance: accounts.reduce((sum, { balance }) => sum + BigInt(balance), 0n).toString(),
      sequence: null,
      accounts,
    },
    height: null,
  };
}

/** Whether `account` is the one that `lookup`, a number or an EVM address, names. */
function isNamed(
  account: MirrorAccount,
  lookup: Extract<HederaLookup, { kind: "account" | "evm" }>,
): boolean {
  if (lookup.kind === "account") return account.id === lookup.id;
  return (
    (typeof account.evmAddress === "string" &&
      account.evmAddress.toLowerCase() === lookup.address) ||
    hederaLongZeroAddress(account.id) === lookup.address
  );
}

/** The account a number or an EVM address names, by the mirror node's account path, or none. */
async function readNamed(
  lookup: Extract<HederaLookup, { kind: "account" | "evm" }>,
  { facts, checks, signal }: ProviderRead,
): Promise<MirrorAccount[]> {
  const path = lookup.kind === "account" ? lookup.id : lookup.address;
  // A number is digits and dots, an EVM address 0x and hex: neither needs escaping in a path.
  const { status, body } = await fetchJsonAnswer(
    `${facts.endpoint}/api/v1/accounts/${path}?transactions=false`,
    [NOT_FOUND_STATUS],
    signal,
  );
  const answer = checks.record(body, "malformed account data");
  if (status === NOT_FOUND_STATUS) {
    const messages = checks.record(answer._status, "an error").messages;
    if (!Array.isArray(messages) || messages.length !== 1) throw checks.fail("an error");
    if (checks.record(messages[0], "an error").message !== "Not found")
      throw checks.fail("an error");
    return [];
  }
  const account = mirrorAccount(checks, answer);
  if (!isNamed(account, lookup)) throw checks.fail("the state of another account");
  return [account];
}

/** The accounts that the key `publicKey` of `type` alone controls: one page of them. */
async function readKey(
  publicKey: string,
  type: (typeof KEY_TYPES)[keyof typeof KEY_TYPES],
  { facts, checks, signal }: ProviderRead,
): Promise<MirrorAccount[]> {
  const { body } = await fetchJsonAnswer(
    `${facts.endpoint}/api/v1/accounts?account.publickey=${publicKey}&balance=true&limit=${MAX_NUMBERED_ACCOUNTS}&order=asc`,
    [],
    signal,
  );
  const answer = checks.record(body, "malformed account data");
  if (!Array.isArray(answer.accounts)) throw checks.fail("malformed account data");
  if (checks.record(answer.links, "malformed account data").next !== null)
    throw checks.fail(`more than ${MAX_NUMBERED_ACCOUNTS} accounts of one key`);
  const found = answer.accounts.map((value: unknown) => mirrorAccount(checks, value));
  for (const account of found) {
    const key = checks.record(account.key, "malformed account data");
    // A key list or a threshold key is "ProtobufEncoded"; the tools read accounts of one key only.
    if (key._type === "ProtobufEncoded")
      throw checks.fail("an account whose key is not a single key the tools read");
    if (key._type !== type || key.key !== publicKey)
      throw checks.fail("the state of another account");
  }
  return found;
}

/** The state of `address`, by what it names; the mirror node reports no height. */
async function readAccount(address: string, read: ProviderRead): Promise<AddressRead> {
  const lookup = hederaLookupOf(address);
  // The service admitted canonical addresses only.
  if (lookup === null) throw ACCOUNT_COIN_ERRORS.address(read.facts.label);
  switch (lookup.kind) {
    case "key":
      return stateOf(address, await readKey(lookup.publicKey, KEY_TYPES.key, read));
    case "ecdsa-key": {
      const byKey = await readKey(lookup.publicKey, KEY_TYPES["ecdsa-key"], read);
      const byAlias = await readNamed({ kind: "evm", address: lookup.evmAddress }, read);
      // The alias's account, read last, is the later state of an account both found.
      return stateOf(address, [...byKey, ...byAlias]);
    }
    default:
      return stateOf(address, await readNamed(lookup, read));
  }
}

/** Hedera's provider (api "hedera-mirror"). */
export const HEDERA_MIRROR_PROVIDER: AccountProvider = {
  addressForm: "0.0.N, 0x… or DER public key",
  sequence: false,
  typedName: "account",
  // The public-input guard refuses 64 hex digits, a raw key's form, since they cannot be told from
  // a private key: a person enters the key in its DER form instead.
  inputNote:
    "Hedera lookups take an account ID (0.0.N), an EVM address (0x…) or a public key in DER form (302a… or 302d…), since 64 hex digits cannot be told from a private key.",
  // The account that the network gives the public phrase's first Ed25519 key (m/44'/3030'/0'/0'/0',
  // probed 2026-11-10) with its mainnet HIP-15 checksum, its number, and the same number with its
  // testnet checksum, which mainnet refuses.
  addressVectors: {
    name: "Hedera account ID checksum (HIP-15)",
    typed: "0.0.163372-giukq",
    canonical: "0.0.163372",
    refused: "0.0.163372-pwfrz",
  },
  canonical: (value) => (hederaLookupOf(value) === null ? null : value),
  account: hederaTypedLookup,
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};
