import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { IdentityLookupView, PlatformAddressBatchView, PlatformHistorySummaryView } from '../../network-protocol.js';
import type { RecoveryNetwork } from '../../types.js';

export class DashPlatformClient {
  constructor(
    readonly network: RecoveryNetwork,
    readonly gateway: RecoveryNetworkGateway,
  ) {}

  addresses(addresses: string[], signal?: AbortSignal): Promise<PlatformAddressBatchView> {
    return this.gateway.runPublic(
      { network: this.network, addresses },
      'platform.addresses',
      () => this.gateway.networkApi.platformAddresses(this.network, addresses, signal),
      signal,
    );
  }

  addressHistory(address: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView> {
    return this.gateway.runPublic(
      { network: this.network, address },
      'platform.address-history',
      () => this.gateway.networkApi.platformAddressHistory(this.network, address, signal),
      signal,
    );
  }

  identity(publicKeyHashHex: string, signal?: AbortSignal): Promise<IdentityLookupView> {
    return this.gateway.runPublic(
      { network: this.network, publicKeyHashHex },
      'platform.identity-by-public-key-hash',
      () => this.gateway.networkApi.platformIdentityByPublicKeyHash(this.network, publicKeyHashHex, signal),
      signal,
    );
  }

  identityHistory(identifier: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView> {
    return this.gateway.runPublic(
      { network: this.network, identifier },
      'platform.identity-history',
      () => this.gateway.networkApi.platformIdentityHistory(this.network, identifier, signal),
      signal,
    );
  }
}
