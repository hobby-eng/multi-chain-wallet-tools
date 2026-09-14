import { PublicMultiChainDataService } from '@ckd/public-data-providers/multi-chain-service.js';
import type { EvmAccountBatchView, RecoveryHistory, UtxoAddressView } from '@ckd/public-data-providers/types.js';
import { DirectRecoveryNetworkService } from './network-service.js';
import type { RecoveryNetwork } from '@ckd/network-boundary/protocol.js';

export class MultiChainRecoveryNetworkService extends DirectRecoveryNetworkService {
  readonly #public = new PublicMultiChainDataService();

  override addressHistory(
    coin: 'bitcoin' | 'ethereum',
    network: RecoveryNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    return this.#public.addressHistory(coin, network, address, signal);
  }

  override utxoAddresses(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<UtxoAddressView[]> {
    return this.#public.utxoAddresses(network, addresses, signal);
  }

  override evmAccounts(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    return this.#public.evmAccounts(network, addresses, signal);
  }
}
