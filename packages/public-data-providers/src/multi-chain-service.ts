import { ACCOUNT_COIN_READERS } from "./account-coins.js";
import { AccountStatesService } from "./account-states-service.js";
import { BitcoinPublicDataService } from "./bitcoin-service.js";
import { EthereumPublicDataService } from "./ethereum-service.js";
import { EvmAccountService } from "./evm-service.js";
import { EVM_NETWORKS, evmNetwork } from "./evm-networks.js";
import type {
  AccountStatesView,
  EvmAccountBatchView,
  PublicDataNetwork,
  RecoveryHistory,
  UtxoAddressView,
} from "./types.js";

/**
 * Compatibility facade for callers that intentionally ship every public provider module, every EVM
 * network of the EVM network table and every account coin of the account coin table: the
 * development builds and tests.
 */
export class PublicMultiChainDataService {
  readonly #bitcoin = new BitcoinPublicDataService();
  readonly #ethereum = new EthereumPublicDataService(evmNetwork("ethereum"));
  readonly #evm = new EvmAccountService(EVM_NETWORKS);
  readonly #accounts = new AccountStatesService(ACCOUNT_COIN_READERS);

  async addressHistory(
    coin: "bitcoin" | "ethereum",
    network: PublicDataNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    if (coin === "bitcoin") return await this.#bitcoin.addressHistory(network, address, signal);
    if (coin === "ethereum") return await this.#ethereum.addressHistory(network, address, signal);
    throw new Error(`Unsupported history coin: ${String(coin)}.`);
  }
  utxoAddresses(
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<UtxoAddressView[]> {
    return this.#bitcoin.utxoAddresses(network, addresses, signal);
  }
  evmAccounts(
    coin: string,
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    return this.#evm.accounts(coin, network, addresses, signal);
  }
  accountStates(
    coin: string,
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<AccountStatesView> {
    return this.#accounts.states(coin, network, addresses, signal);
  }
}
