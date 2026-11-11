// An account coin's provider as the source of an address book: the account.states answers that
// cross the network boundary checked again, and the heights they were read at remembered for the
// section's proof.
import type { AccountStateView } from "@ckd/network-boundary/protocol.js";
import {
  assertAccountStatesView,
  type AccountCoinFacts,
} from "@ckd/public-data-providers/account-coin-facts.js";
import type { AddressSource } from "../../address-book.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";

/** The only network of the account coins. */
const NETWORK = "mainnet";

export class AccountStates implements AddressSource<AccountStateView> {
  readonly #gateway: RecoveryNetworkGateway;
  readonly #facts: AccountCoinFacts;
  readonly #signal: AbortSignal;
  #lowest: bigint | null = null;
  #highest: bigint | null = null;
  /** The numbered accounts (Hedera's) whose balances this scan has counted, by number. */
  readonly #counted = new Set<string>();
  /** Each state's balance as this scan counts it, fixed the first time it is asked. */
  readonly #balances = new WeakMap<AccountStateView, bigint>();

  constructor(gateway: RecoveryNetworkGateway, facts: AccountCoinFacts, signal: AbortSignal) {
    this.#gateway = gateway;
    this.#facts = facts;
    this.#signal = signal;
  }

  async lookUp(addresses: readonly string[]): Promise<AccountStateView[]> {
    const coin = this.#facts.id;
    const response = await this.#gateway.runPublic(
      { network: NETWORK, coin, addresses },
      "account.states",
      () => this.#gateway.networkApi.accountStates(coin, NETWORK, [...addresses], this.#signal),
      this.#signal,
    );
    // The worker checked the answer already; what crossed the boundary is checked again.
    const view = assertAccountStatesView(this.#facts, addresses, response);
    if (view.height !== null) {
      const height = BigInt(view.height);
      if (this.#lowest === null || height < this.#lowest) this.#lowest = height;
      if (this.#highest === null || height > this.#highest) this.#highest = height;
    }
    return view.entries;
  }

  /**
   * The balance `state` adds to the scan's total: its own, or on a coin that numbers its accounts
   * the balances of the accounts no address before it found, so that an account two addresses
   * reach counts once. Two keys of one seed reach one account only after a key was changed to
   * another key of the seed (an alias account's key, say); the address book asks for each state's
   * balance first in lookup order, and the answer is kept for every later question.
   */
  balance(state: AccountStateView): bigint {
    const { accounts } = state;
    if (accounts === undefined) return BigInt(state.balance);
    const held = this.#balances.get(state);
    if (held !== undefined) return held;
    let counted = 0n;
    for (const { id, balance } of accounts) {
      if (this.#counted.has(id)) continue;
      this.#counted.add(id);
      counted += BigInt(balance);
    }
    this.#balances.set(state, counted);
    return counted;
  }

  /** An address is used once its account exists or the provider shows a transaction of it. */
  used(state: AccountStateView): boolean {
    return state.used;
  }

  /** The lowest and highest ledger, slot or block of the answers; null where none was reported. */
  get heights(): { lowest: bigint | null; highest: bigint | null } {
    return { lowest: this.#lowest, highest: this.#highest };
  }
}
