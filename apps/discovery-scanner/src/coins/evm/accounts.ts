// The account side of every EVM network's scans: its JSON-RPC as the source of an address book, the
// amounts in its own asset and the BIP32 versions of its extended keys.
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { isUint256Decimal } from "@ckd/core/numeric-limits.js";
import { AtomicAmount } from "@ckd/core/atomic-amount.js";
import {
  EVM_DECIMALS,
  EVM_NETWORK_ERRORS,
  evmChain,
  type EvmChainFacts,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import type { EvmAccountView } from "@ckd/network-boundary/protocol.js";
import type { AddressSource } from "../../address-book.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";
import type { RecoveryNetwork } from "../../types.js";

/**
 * BIP32 extended-key version bytes of every EVM network, regardless of the selected network: EVM
 * wallets have no separate testnet xpub convention, so mainnet and testnet keys share the
 * mainnet-style Bitcoin version bytes many EVM wallets already use.
 */
export const EVM_VERSIONS = BIP32_MAINNET_VERSIONS;

/** An amount of the network's native asset in wei, written in whole units with its ticker. */
export function evmAmountFormatter(facts: Pick<EvmNetworkFacts, "asset">) {
  return (wei: bigint): string =>
    `${AtomicAmount.format(wei, EVM_DECIMALS, { whole: (value) => value.toLocaleString("en-US") })} ${facts.asset}`;
}

/**
 * One EVM network's JSON-RPC as the source of an address book: its answers checked, the chain id
 * the provider proved compared with the EVM network table's, and the block heights they were read at
 * remembered for the section's proof.
 */
export class EvmAccounts implements AddressSource<EvmAccountView> {
  readonly #gateway: RecoveryNetworkGateway;
  readonly #facts: EvmNetworkFacts;
  readonly #chain: EvmChainFacts;
  readonly #network: RecoveryNetwork;
  readonly #signal: AbortSignal;
  #lowest: bigint | null = null;
  #highest: bigint | null = null;
  #latest: bigint | null = null;

  constructor(
    gateway: RecoveryNetworkGateway,
    facts: EvmNetworkFacts,
    network: RecoveryNetwork,
    signal: AbortSignal,
  ) {
    this.#gateway = gateway;
    this.#facts = facts;
    this.#chain = evmChain(facts, network);
    this.#network = network;
    this.#signal = signal;
  }

  /** The chain these accounts are read from: its name, chain id and endpoint. */
  get chain(): EvmChainFacts {
    return this.#chain;
  }

  async lookUp(addresses: readonly string[]): Promise<EvmAccountView[]> {
    const coin = this.#facts.id;
    const { label } = this.#facts;
    const response = await this.#gateway.runPublic(
      { network: this.#network, coin, addresses },
      "evm.accounts",
      () => this.#gateway.networkApi.evmAccounts(coin, this.#network, [...addresses], this.#signal),
      this.#signal,
    );
    // The worker already refused another chain; a reply of another chain still fails the section.
    if (response.chainId !== String(this.#chain.chainId))
      throw EVM_NETWORK_ERRORS.chainId(label, String(response.chainId), this.#chain.chainId);
    if (
      !isUint256Decimal(response.blockNumber) ||
      !Array.isArray(response.entries) ||
      response.entries.length !== addresses.length
    )
      throw EVM_NETWORK_ERRORS.response(label, "an incomplete account batch");
    response.entries.forEach((entry, index) => {
      if (
        entry.address !== addresses[index] ||
        !isUint256Decimal(entry.balance) ||
        !isUint256Decimal(entry.nonce)
      )
        throw EVM_NETWORK_ERRORS.response(label, "malformed account data");
    });
    const block = BigInt(response.blockNumber);
    this.#lowest = this.#lowest === null || block < this.#lowest ? block : this.#lowest;
    this.#highest = this.#highest === null || block > this.#highest ? block : this.#highest;
    this.#latest = block;
    return response.entries;
  }

  balance(entry: EvmAccountView): bigint {
    return BigInt(entry.balance);
  }

  /** An account is used once it holds the native asset or has sent a transaction. */
  used(entry: EvmAccountView): boolean {
    return BigInt(entry.balance) > 0n || BigInt(entry.nonce) > 0n;
  }

  /** Checksummed and lowercase spellings name the same account. */
  key(address: string): string {
    return address.toLowerCase();
  }

  /** The lowest, highest and latest block of the answers; null before the first. */
  get blocks(): { lowest: bigint | null; highest: bigint | null; latest: bigint | null } {
    return { lowest: this.#lowest, highest: this.#highest, latest: this.#latest };
  }
}
