import type {
  DashCoreTransactionView,
  EvmAccountBatchView,
  IdentityLookupView,
  PlatformAddressBatchView,
  PlatformHistorySummaryView,
  RecoveryNetwork,
  RecoveryNetworkApi,
  ShieldedPageView,
  UtxoAddressView,
} from '@ckd/network-boundary/protocol.js';
import { DashCoreNetworkService } from './dash-core-network.js';
import {
  DashPlatformNetworkService,
  PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS,
  PLATFORM_IDENTITY_HISTORY_TIMEOUT_MS,
} from './dash-platform-network.js';

export { fetchRecoveryJson as fetchJson } from './recovery-http.js';
export {
  platformDecimal as decimal,
  platformRecord as record,
  platformUnsignedInteger as unsignedInteger,
} from './platform-explorer-values.js';
export { assertNetwork } from './network-validation.js';
export { PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS, PLATFORM_IDENTITY_HISTORY_TIMEOUT_MS };

export class DirectRecoveryNetworkService implements RecoveryNetworkApi {
  readonly #core = new DashCoreNetworkService();
  readonly #platform = new DashPlatformNetworkService();

  async ping(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    return 'isolated-network-worker-v1';
  }

  coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    return this.#core.coreStatus(network, signal);
  }
  coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    return this.#core.coreTip(network, signal);
  }
  coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown> {
    return this.#core.coreAddressInfo(network, addresses, signal);
  }
  coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown> {
    return this.#core.coreAddressHistory(network, address, signal);
  }
  coreTransaction(network: RecoveryNetwork, hash: string, signal?: AbortSignal): Promise<DashCoreTransactionView> {
    return this.#core.coreTransaction(network, hash, signal);
  }

  async addressHistory(
    _coin: 'bitcoin' | 'ethereum',
    _network: RecoveryNetwork,
    _address: string,
    _signal?: AbortSignal,
  ): Promise<import('./types.js').RecoveryHistory> {
    throw new Error('This build rejected an unsupported network operation.');
  }

  async utxoAddresses(
    _network: RecoveryNetwork,
    _addresses: string[],
    _signal?: AbortSignal,
  ): Promise<UtxoAddressView[]> {
    throw new Error('This build rejected an unsupported network operation.');
  }

  async evmAccounts(
    _network: RecoveryNetwork,
    _addresses: string[],
    _signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    throw new Error('This build rejected an unsupported network operation.');
  }

  platformAddresses(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<PlatformAddressBatchView> {
    return this.#platform.platformAddresses(network, addresses, signal);
  }
  platformAddressHistory(
    network: RecoveryNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView> {
    return this.#platform.platformAddressHistory(network, address, signal);
  }
  platformIdentityByPublicKeyHash(
    network: RecoveryNetwork,
    publicKeyHashHex: string,
    signal?: AbortSignal,
  ): Promise<IdentityLookupView> {
    return this.#platform.platformIdentityByPublicKeyHash(network, publicKeyHashHex, signal);
  }
  platformIdentityHistory(
    network: RecoveryNetwork,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView> {
    return this.#platform.platformIdentityHistory(network, identifier, signal);
  }
  shieldedPage(
    network: RecoveryNetwork,
    startPosition: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ShieldedPageView> {
    return this.#platform.shieldedPage(network, startPosition, count, signal);
  }
}
