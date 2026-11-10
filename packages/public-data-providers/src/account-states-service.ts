// The account.states operation: the balances and states of an account coin's addresses, each coin
// read by the provider of its api (account-coins/<api>.ts). The readers come from the caller (a
// composed build passes those of its selected rows), so this module names no coin and no endpoint.
import { exactNetworkPayload } from "@ckd/network-boundary/request-validation.js";
import type { AccountStatesView, AccountStateView } from "@ckd/network-boundary/data-types.js";
import {
  ACCOUNT_COIN_ERRORS,
  accountAnswerChecks,
  assertAccountStatesView,
  type AccountAnswerChecks,
  type AccountCoinFacts,
} from "./account-coin-facts.js";
import type { PublicDataNetwork } from "./types.js";

/**
 * The longest value read as an address before its coin's own check: well above every account
 * coin's address (NEAR's implicit account, 64 hex digits, is the longest), so that a decoder never
 * sees an unbounded string.
 */
const MAX_ADDRESS_LENGTH = 128;

/**
 * The startup known answers of a coin's address form: the public "abandon … about" phrase's first
 * address as a person types it and the account it names, and a typed value the form refuses.
 */
export interface AddressFormVectors {
  /** The check's name, such as "XRP classic address checksum". */
  readonly name: string;
  readonly typed: string;
  readonly canonical: string;
  readonly refused: string;
}

/** What a provider reads with: the coin's row, its answer checks and the caller's abort signal. */
export interface ProviderRead {
  readonly facts: AccountCoinFacts;
  readonly checks: AccountAnswerChecks;
  readonly signal: AbortSignal | undefined;
}

/** What one api's module brings (account-coins/<api>.ts): its coin's address form and its reads. */
export interface AccountProvider {
  /** The typed form's short name in placeholders, such as "r…". */
  readonly addressForm: string;
  readonly addressVectors: AddressFormVectors;
  /** Whether the coin's accounts have a sequence number (XRP, Stellar), which a read returns. */
  readonly sequence: boolean;
  /** What a person types where it is not the account's address, such as "account public key". */
  readonly typedName?: string;
  /**
   * Where a person types something else than the address (NEAR's public key): the sentence that a
   * refusal of private-looking input adds, saying what to enter instead.
   */
  readonly inputNote?: string;
  /** `value` in the coin's canonical address form, or null when it is not an address of the coin. */
  canonical(value: string): string | null;
  /**
   * The canonical account that a typed `value` names, or null; the canonical form itself where the
   * coin has no other typed form.
   */
  account?(value: string): string | null;
  /**
   * The states of `addresses` (canonical, 1 to the row's batch) from the row's endpoint; a
   * malformed or failed answer fails through the read's checks.
   */
  read(addresses: readonly string[], read: ProviderRead): Promise<AccountStatesView>;
}

/** One account coin as the connected tools read it: its row of the table and its api's provider. */
export class AccountStatesReader {
  readonly facts: AccountCoinFacts;
  readonly #provider: AccountProvider;
  readonly #checks: AccountAnswerChecks;

  constructor(facts: AccountCoinFacts, provider: AccountProvider) {
    this.facts = facts;
    this.#provider = provider;
    this.#checks = accountAnswerChecks(facts);
  }

  /** The typed form's short name in placeholders, such as "r…". */
  get addressForm(): string {
    return this.#provider.addressForm;
  }

  /** The startup known answers of the coin's address form. */
  get addressVectors(): AddressFormVectors {
    return this.#provider.addressVectors;
  }

  /** Whether the coin's accounts have a sequence number, which a read returns. */
  get sequence(): boolean {
    return this.#provider.sequence;
  }

  /** What a person types where it is not the account's address, such as "account public key". */
  get typedName(): string | undefined {
    return this.#provider.typedName;
  }

  /** What to enter instead of private-looking input, where the typed form is not the account. */
  get inputNote(): string | undefined {
    return this.#provider.inputNote;
  }

  /** `value` in the coin's canonical address form, or null when it is not an address of the coin. */
  canonical(value: string): string | null {
    return this.#provider.canonical(value);
  }

  /** The canonical account that a typed `value` names, or null when it names none. */
  account(value: string): string | null {
    const { account } = this.#provider;
    return account === undefined ? this.#provider.canonical(value) : account(value);
  }

  /** The states of `addresses` from the coin's endpoint; a malformed or failed answer fails. */
  read(addresses: readonly string[], signal?: AbortSignal): Promise<AccountStatesView> {
    return this.#provider.read(addresses, { facts: this.facts, checks: this.#checks, signal });
  }
}

/** One address's state and the ledger, slot or block it was read at (null where none is given). */
export interface AddressRead {
  readonly state: AccountStateView;
  readonly height: bigint | null;
}

/** The state of an address whose account the network does not hold, as its provider said. */
export const NO_ACCOUNT = (address: string): AccountStateView => ({
  address,
  exists: false,
  used: false,
  balance: "0",
  sequence: null,
});

/**
 * The view of a provider asked one address at a time: `one` runs for each address in order, so
 * that a public provider sees one request at a time; each request honours the read's abort signal
 * (fetchJson refuses an aborted one). The height is the latest one read.
 */
export async function readOneByOne(
  addresses: readonly string[],
  read: ProviderRead,
  one: (address: string, read: ProviderRead) => Promise<AddressRead>,
): Promise<AccountStatesView> {
  const entries: AccountStateView[] = [];
  let height: bigint | null = null;
  for (const address of addresses) {
    const found = await one(address, read);
    entries.push(found.state);
    if (found.height !== null && (height === null || found.height > height)) height = found.height;
  }
  return { coin: read.facts.id, height: height === null ? null : height.toString(), entries };
}

/** The account.states service of the selected account coins. */
export class AccountStatesService {
  readonly #readers: ReadonlyMap<string, AccountStatesReader>;

  constructor(readers: readonly AccountStatesReader[]) {
    this.#readers = new Map(readers.map((reader) => [reader.facts.id, reader]));
  }

  /**
   * Validates the untrusted account.states payload of the network boundary: exactly a coin of this
   * build, Mainnet, and 1 to the coin's batch of addresses, each in the coin's canonical form.
   */
  validatePayload(value: unknown): void {
    const body = exactNetworkPayload(value, ["network", "coin", "addresses"]);
    this.#admit(body.coin, body.network, body.addresses);
  }

  /**
   * The states of `addresses` on the account coin `coin`, read by its provider; the request is
   * refused as validatePayload refuses it, and the answer is checked (assertAccountStatesView).
   */
  async states(
    coin: string,
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<AccountStatesView> {
    const reader = this.#admit(coin, network, addresses);
    return assertAccountStatesView(reader.facts, addresses, await reader.read(addresses, signal));
  }

  #admit(coin: unknown, network: unknown, addresses: unknown): AccountStatesReader {
    const reader = typeof coin === "string" ? this.#readers.get(coin) : undefined;
    if (reader === undefined) throw ACCOUNT_COIN_ERRORS.coin();
    const { label, batch } = reader.facts;
    if (network !== "mainnet") throw ACCOUNT_COIN_ERRORS.network(label);
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > batch)
      throw ACCOUNT_COIN_ERRORS.batch(label, batch);
    for (const address of addresses)
      if (
        typeof address !== "string" ||
        address.length > MAX_ADDRESS_LENGTH ||
        reader.canonical(address) !== address
      )
        throw ACCOUNT_COIN_ERRORS.address(label);
    return reader;
  }
}
