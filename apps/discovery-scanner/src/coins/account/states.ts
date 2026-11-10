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

  balance(state: AccountStateView): bigint {
    return BigInt(state.balance);
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
