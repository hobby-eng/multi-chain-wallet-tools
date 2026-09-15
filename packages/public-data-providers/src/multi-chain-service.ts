import { BitcoinPublicDataService } from './bitcoin-service.js';
import { EthereumPublicDataService } from './ethereum-service.js';
import type { EvmAccountBatchView, PublicDataNetwork, RecoveryHistory, UtxoAddressView } from './types.js';

/** Compatibility facade for callers that intentionally ship both public provider modules. */
export class PublicMultiChainDataService {
  readonly #bitcoin = new BitcoinPublicDataService();
  readonly #ethereum = new EthereumPublicDataService();

  async addressHistory(
    coin: 'bitcoin' | 'ethereum',
    network: PublicDataNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    if (coin === 'bitcoin') return await this.#bitcoin.addressHistory(network, address, signal);
    if (coin === 'ethereum') return await this.#ethereum.addressHistory(network, address, signal);
    throw new Error(`Unsupported history coin: ${String(coin)}.`);
  }
  utxoAddresses(network: PublicDataNetwork, addresses: string[], signal?: AbortSignal): Promise<UtxoAddressView[]> {
    return this.#bitcoin.utxoAddresses(network, addresses, signal);
  }
  evmAccounts(network: PublicDataNetwork, addresses: string[], signal?: AbortSignal): Promise<EvmAccountBatchView> {
    return this.#ethereum.evmAccounts(network, addresses, signal);
  }
}
