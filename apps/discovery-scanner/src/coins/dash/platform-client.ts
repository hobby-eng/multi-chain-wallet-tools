import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { IdentityLookupView, PlatformAddressBatchView } from '../../network-protocol.js';
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

  identity(publicKeyHashHex: string, signal?: AbortSignal): Promise<IdentityLookupView> {
    return this.gateway.runPublic(
      { network: this.network, publicKeyHashHex },
      'platform.identity-by-public-key-hash',
      () => this.gateway.networkApi.platformIdentityByPublicKeyHash(this.network, publicKeyHashHex, signal),
      signal,
    );
  }
}
