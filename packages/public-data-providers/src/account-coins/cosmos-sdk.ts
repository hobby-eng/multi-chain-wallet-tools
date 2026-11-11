// The account states of a Cosmos SDK chain from its REST gateway (gRPC-gateway), shared by the
// Cosmos Hub's and Injective's providers (cosmos-rest.ts, injective-rest.ts): for each address, one
// request at a time, the auth module's account, and where it exists the bank balance of the chain's
// native denomination. An account exists once it received coins, since the bank module creates it
// then; the auth module answers 404 with gRPC's NotFound (code 5), naming the address, for one it
// does not hold, and such an address holds no balance. Staked (delegated) coins are not read.
import { bech32 } from "@scure/base";
import {
  NO_ACCOUNT,
  readOneByOne,
  type AccountProvider,
  type AddressFormVectors,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import type { AccountAnswerChecks } from "../account-coin-facts.js";
import { fetchJson, fetchJsonAnswer } from "../http.js";

/** The gateway's HTTP status and gRPC code of an account the auth module does not hold. */
const NOT_FOUND_STATUS = 404;
const NOT_FOUND_CODE = 5;
/** The account bytes of a key's account (20) and of a module or contract account (32). */
const ACCOUNT_BYTE_LENGTHS = [20, 32];
/** The longest bech32 text a decoder reads (BIP-173's limit). */
const BECH32_LIMIT = 90;

/** The bytes of a bech32 account address of `prefix` in either letter case, or null. */
export function cosmosAccountBytes(value: string, prefix: string): Uint8Array | null {
  if (value.length > BECH32_LIMIT) return null;
  const decoded = bech32.decodeUnsafe(value, BECH32_LIMIT);
  if (decoded === undefined || decoded.prefix !== prefix) return null;
  const bytes = bech32.fromWordsUnsafe(decoded.words);
  return bytes !== undefined && ACCOUNT_BYTE_LENGTHS.includes(bytes.length) ? bytes : null;
}

/** A bech32 account address of `prefix` in its canonical lower-case form, or null. */
export function canonicalCosmosAddress(value: string, prefix: string): string | null {
  return cosmosAccountBytes(value, prefix) === null ? null : value.toLowerCase();
}

/**
 * The base account inside an auth module account: a BaseAccount itself, or the base_account of an
 * account type that wraps one (Injective's EthAccount, a module account), or that of a vesting
 * account's base_vesting_account.
 */
function baseAccount(checks: AccountAnswerChecks, account: Record<string, unknown>) {
  if (typeof account.address === "string") return account;
  if (account.base_account !== undefined)
    return checks.record(account.base_account, "malformed account data");
  const vesting = checks.record(account.base_vesting_account, "an unknown account type");
  return checks.record(vesting.base_account, "malformed account data");
}

/** The state of `address`, read with the chain's native `denom`; the gateway reports no height. */
async function readAccount(
  address: string,
  { facts, checks, signal }: ProviderRead,
  denom: string,
): Promise<AddressRead> {
  // A canonical bech32 address is lower-case letters and digits: it needs no escaping in a path.
  const { status, body } = await fetchJsonAnswer(
    `${facts.endpoint}/cosmos/auth/v1beta1/accounts/${address}`,
    [NOT_FOUND_STATUS],
    signal,
  );
  const answer = checks.record(body, "malformed account data");
  if (status === NOT_FOUND_STATUS) {
    if (
      answer.code !== NOT_FOUND_CODE ||
      typeof answer.message !== "string" ||
      !answer.message.includes(address)
    )
      throw checks.fail("an error");
    return { state: NO_ACCOUNT(address), height: null };
  }
  const base = baseAccount(checks, checks.record(answer.account, "malformed account data"));
  if (base.address !== address) throw checks.fail("the state of another account");
  const sequence = checks.integer(base.sequence, "a sequence");
  const balance = checks.record(
    checks.record(
      await fetchJson(
        `${facts.endpoint}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${encodeURIComponent(denom)}`,
        signal,
      ),
      "malformed balance data",
    ).balance,
    "no balance",
  );
  if (balance.denom !== denom) throw checks.fail("a balance of another denomination");
  return {
    state: {
      address,
      exists: true,
      used: true,
      balance: checks.integer(balance.amount, "a balance"),
      sequence,
    },
    height: null,
  };
}

/** What sets one Cosmos SDK chain's provider apart: its address prefix, denomination and forms. */
export interface CosmosSdkChain {
  /** The bech32 prefix of its accounts, such as "cosmos". */
  readonly prefix: string;
  /** The bank denomination of its native asset, such as "uatom". */
  readonly denom: string;
  readonly addressForm: string;
  readonly addressVectors: AddressFormVectors;
  /** A typed form besides the bech32 address that names the same account, or none. */
  account?(value: string): string | null;
}

/** The provider of the Cosmos SDK chain `chain`. */
export function cosmosSdkProvider(chain: CosmosSdkChain): AccountProvider {
  const canonical = (value: string): string | null =>
    canonicalCosmosAddress(value, chain.prefix) === value ? value : null;
  const other = chain.account;
  return {
    addressForm: chain.addressForm,
    sequence: true,
    addressVectors: chain.addressVectors,
    canonical,
    account: (value) =>
      canonicalCosmosAddress(value, chain.prefix) ?? (other === undefined ? null : other(value)),
    read: (addresses, read) =>
      readOneByOne(addresses, read, (address, each) => readAccount(address, each, chain.denom)),
  };
}
