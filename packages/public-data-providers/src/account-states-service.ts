// The account.states operation: the balances and states of an account coin's addresses, each coin
// read by the provider of its api (account-coins/<api>.ts). The readers come from the caller (a
// composed build passes those of its selected rows), so this module names no coin and no endpoint.
import { networkCancelledError } from "@ckd/core/error-handling.js";
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
 * coin's address (Hedera's ECDSA alias, 0.0. and a DER public key of 94 hex digits, 98
 * characters, is the longest), so that a decoder never sees an unbounded string.
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

/**
 * What a provider reads with: the coin's row, its answer checks, the caller's abort signal, and
 * the row's pace.
 */
export interface ProviderRead {
  readonly facts: AccountCoinFacts;
  readonly checks: AccountAnswerChecks;
  readonly signal: AbortSignal | undefined;
  /**
   * Runs `request` (one address's read) in its turn: on a row with a pace, alone and at least the
   * pace after the end of the reader's previous paced read; a lookup cancelled while it waits
   * leaves its place at once. Rejects as cancelled when the signal aborts before `request` starts.
   */
  paced<T>(request: () => Promise<T>): Promise<T>;
  /** Waits one pace (none on a row without one), as before a retry; rejects when cancelled. */
  rest(): Promise<void>;
}

/** Resolves after `delay` milliseconds, or rejects as cancelled once `signal` aborts. */
function waitFor(delay: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(networkCancelledError());
      return;
    }
    if (delay <= 0) {
      resolve();
      return;
    }
    const cancel = (): void => {
      clearTimeout(timer);
      reject(networkCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/**
 * The pace of one provider: one read at a time, each starting at least `pace` milliseconds after
 * the previous one ended (a monotonic clock), since a provider's limit counts the requests that
 * reach it, and a slow connection must not bring two of them closer. Reads wait their turn in
 * order; one cancelled while it waits leaves the queue without delaying the others.
 */
class Pacer {
  readonly #pace: number;
  #busy = false;
  readonly #queue: (() => void)[] = [];
  #lastEnd = Number.NEGATIVE_INFINITY;

  constructor(pace: number) {
    this.#pace = pace;
  }

  async run<T>(request: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    await this.#acquire(signal);
    let started = false;
    try {
      await waitFor(this.#lastEnd + this.#pace - performance.now(), signal);
      started = true;
      return await request();
    } finally {
      if (started) this.#lastEnd = performance.now();
      this.#release();
    }
  }

  rest(signal: AbortSignal | undefined): Promise<void> {
    return waitFor(this.#pace, signal);
  }

  #acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) return Promise.reject(networkCancelledError());
    if (!this.#busy) {
      this.#busy = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const grant = (): void => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      };
      const cancel = (): void => {
        const at = this.#queue.indexOf(grant);
        if (at >= 0) this.#queue.splice(at, 1);
        reject(networkCancelledError());
      };
      this.#queue.push(grant);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  /** Hands the turn to the next waiting read, if any. */
  #release(): void {
    const next = this.#queue.shift();
    if (next === undefined) this.#busy = false;
    else next();
  }
}

/** What one api's module brings (account-coins/<api>.ts): its coin's address form and its reads. */
export interface AccountProvider {
  /** The typed form's short name in placeholders, such as "r…". */
  readonly addressForm: string;
  readonly addressVectors: AddressFormVectors;
  /**
   * Whether the coin's accounts have a sequence number (XRP, Stellar, the Cosmos SDK chains, TON's
   * wallets), which a read returns.
   */
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

/**
 * One account coin as the connected tools read it: its row of the table and its api's provider.
 * The reader keeps the row's pace across all of its reads, since a provider's limit counts every
 * request of the client, whichever lookup sent it.
 */
export class AccountStatesReader {
  readonly facts: AccountCoinFacts;
  readonly #provider: AccountProvider;
  readonly #checks: AccountAnswerChecks;
  /** The row's pace, kept across every read of this reader; none where the row has none. */
  readonly #pacer: Pacer | null;

  constructor(facts: AccountCoinFacts, provider: AccountProvider) {
    this.facts = facts;
    this.#provider = provider;
    this.#checks = accountAnswerChecks(facts);
    this.#pacer = facts.pace === undefined ? null : new Pacer(facts.pace);
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
    const pacer = this.#pacer;
    return this.#provider.read(addresses, {
      facts: this.facts,
      checks: this.#checks,
      signal,
      paced: (request) => {
        if (pacer !== null) return pacer.run(request, signal);
        return signal?.aborted ? Promise.reject(networkCancelledError()) : request();
      },
      rest: () => (pacer === null ? Promise.resolve() : pacer.rest(signal)),
    });
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
 * The view of a provider asked one address at a time: `one` runs for each address in order, each
 * in its turn under the row's pace, so that a public provider sees one request at a time; each
 * request honours the read's abort signal (fetchJson refuses an aborted one, and so does a wait
 * for a turn). The height is the latest one read.
 */
export async function readOneByOne(
  addresses: readonly string[],
  read: ProviderRead,
  one: (address: string, read: ProviderRead) => Promise<AddressRead>,
): Promise<AccountStatesView> {
  const entries: AccountStateView[] = [];
  let height: bigint | null = null;
  for (const address of addresses) {
    const found = await read.paced(() => one(address, read));
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
