import type { RecoveryNetworkApi, RecoveryNetworkRequest } from '@ckd/network-boundary/protocol.js';

export async function executeRecoveryNetworkRequest(
  service: RecoveryNetworkApi,
  request: RecoveryNetworkRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (request.operation) {
    case 'ping':
      return service.ping(signal);
    case 'core.status':
      return service.coreStatus(request.payload.network, signal);
    case 'core.tip':
      return service.coreTip(request.payload.network, signal);
    case 'core.address-info':
      return service.coreAddressInfo(request.payload.network, request.payload.addresses, signal);
    case 'core.address-history':
      return service.coreAddressHistory(request.payload.network, request.payload.address, signal);
    case 'core.transaction':
      return service.coreTransaction(request.payload.network, request.payload.hash, signal);
    case 'platform.addresses':
      return service.platformAddresses(request.payload.network, request.payload.addresses, signal);
    case 'platform.address-history':
      return service.platformAddressHistory(request.payload.network, request.payload.address, signal);
    case 'platform.identity-by-public-key-hash':
      return service.platformIdentityByPublicKeyHash(request.payload.network, request.payload.publicKeyHashHex, signal);
    case 'platform.identity-history':
      return service.platformIdentityHistory(request.payload.network, request.payload.identifier, signal);
    case 'shielded.page':
      return service.shieldedPage(
        request.payload.network,
        request.payload.startPosition,
        request.payload.count,
        signal,
      );
    case 'address.history':
      return service.addressHistory(request.payload.coin, request.payload.network, request.payload.address, signal);
    case 'utxo.addresses':
      return service.utxoAddresses(request.payload.network, request.payload.addresses, signal);
    case 'evm.accounts':
      return service.evmAccounts(request.payload.network, request.payload.addresses, signal);
    default:
      throw new Error('Recovery Network Worker rejected an unsupported operation.');
  }
}
