import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { isUint256Decimal } from "@ckd/core/numeric-limits.js";
import { AtomicAmount } from "@ckd/core/atomic-amount.js";
import type { EvmAccountView } from "@ckd/network-boundary/protocol.js";
import type { AddressSource } from "../../address-book.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";
import type { RecoveryNetwork } from "../../types.js";

/**
 * BIP32 extended-key version bytes this tool uses for Ethereum, regardless of
 * the selected network: Ethereum has no separate testnet xpub convention in
 * common wallet software, so both mainnet and Sepolia use the same
 * mainnet-style Bitcoin version bytes many EVM wallets already share.
 */
export const ETHEREUM_VERSIONS = BIP32_MAINNET_VERSIONS;

export function formatEther(wei: bigint): string {
  return `${AtomicAmount.format(wei, 18, { whole: (value) => value.toLocaleString("en-US") })} ETH`;
}

/** The JSON-RPC endpoint an Ethereum section names as its source. */
export const ETHEREUM_SOURCES: Readonly<Record<RecoveryNetwork, string>> = {
  mainnet: "https://ethereum-rpc.publicnode.com",
  testnet: "https://ethereum-sepolia-rpc.publicnode.com",
};

/** The chain an Ethereum section's proof names. */
export function ethereumChainLabel(network: RecoveryNetwork): string {
  return network === "mainnet" ? "Ethereum mainnet" : "Sepolia testnet";
}

/**
 * The Ethereum JSON-RPC as the source of an address book: its answers checked, and the block
 * heights they were read at remembered for the section's proof.
 */
export class EthereumAccounts implements AddressSource<EvmAccountView> {
  readonly #gateway: RecoveryNetworkGateway;
  readonly #network: RecoveryNetwork;
  readonly #signal: AbortSignal;
  #lowest: bigint | null = null;
  #highest: bigint | null = null;
  #latest: bigint | null = null;

  constructor(gateway: RecoveryNetworkGateway, network: RecoveryNetwork, signal: AbortSignal) {
    this.#gateway = gateway;
    this.#network = network;
    this.#signal = signal;
  }

  async lookUp(addresses: readonly string[]): Promise<EvmAccountView[]> {
    const response = await this.#gateway.runPublic(
      { network: this.#network, addresses },
      "evm.accounts",
      () => this.#gateway.networkApi.evmAccounts(this.#network, [...addresses], this.#signal),
      this.#signal,
    );
    if (
      !isUint256Decimal(response.blockNumber) ||
      !Array.isArray(response.entries) ||
      response.entries.length !== addresses.length
    )
      throw new Error("Ethereum RPC returned an incomplete account batch.");
    response.entries.forEach((entry, index) => {
      if (
        entry.address !== addresses[index] ||
        !isUint256Decimal(entry.balance) ||
        !isUint256Decimal(entry.nonce)
      )
        throw new Error("Ethereum RPC returned malformed account data.");
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

  /** An account is used once it holds ether or has sent a transaction. */
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
