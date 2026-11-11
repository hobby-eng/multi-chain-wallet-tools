import { ACCOUNT_COIN_READERS } from "./account-coins.js";
import { AccountStatesService } from "./account-states-service.js";
import { BitcoinPublicDataService } from "./bitcoin-service.js";
import { EvmHistoryService } from "./evm-history-service.js";
import { hasEvmHistory } from "./evm-network-facts.js";
import { EvmAccountService } from "./evm-service.js";
import { EVM_NETWORKS } from "./evm-networks.js";
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
  readonly #evmHistory = new EvmHistoryService(EVM_NETWORKS.filter(hasEvmHistory));
  readonly #evm = new EvmAccountService(EVM_NETWORKS);
  readonly #accounts = new AccountStatesService(ACCOUNT_COIN_READERS);

  /** Bitcoin's history, or that of an EVM network whose row names a history endpoint. */
  async addressHistory(
    coin: string,
    network: PublicDataNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    if (coin === "bitcoin") return await this.#bitcoin.addressHistory(network, address, signal);
    return await this.#evmHistory.addressHistory(coin, network, address, signal);
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
