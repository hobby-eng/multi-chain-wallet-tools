import {
  RECOVERY_CORE_ADDRESS_BATCH,
  RECOVERY_EVM_ACCOUNT_BATCH,
  RECOVERY_PLATFORM_ADDRESS_BATCH,
  RECOVERY_UTXO_ADDRESS_BATCH,
  type RecoveryNetworkApi,
  type RecoveryNetworkRequest,
} from '@ckd/network-boundary/protocol.js';
import {
  assertDecimal,
  assertHex,
  assertIntegerRange,
  assertPublicToken,
  assertPublicTokenBatch,
  assertRecoveryNetwork,
  exactNetworkPayload,
  validateNetworkRequest,
  type NetworkOperationValidators,
} from '@ckd/network-boundary/request-validation.js';

const networkOnly = (value: unknown): void => {
  const body = exactNetworkPayload(value, ['network']);
  assertRecoveryNetwork(body.network);
};
const publicField =
  (field: string) =>
  (value: unknown): void => {
    const body = exactNetworkPayload(value, ['network', field]);
    assertRecoveryNetwork(body.network);
    assertPublicToken(body[field], field);
  };
const addressBatch =
  (maximum: number) =>
  (value: unknown): void => {
    const body = exactNetworkPayload(value, ['network', 'addresses']);
    assertRecoveryNetwork(body.network);
    assertPublicTokenBatch(body.addresses, maximum);
  };

const ALL_OPERATION_VALIDATORS: NetworkOperationValidators = {
  ping: (value) => void exactNetworkPayload(value, []),
  'core.status': networkOnly,
  'core.tip': networkOnly,
  'core.address-info': addressBatch(RECOVERY_CORE_ADDRESS_BATCH),
  'core.address-history': publicField('address'),
  'core.transaction': (value) => {
    const body = exactNetworkPayload(value, ['network', 'hash']);
    assertRecoveryNetwork(body.network);
    assertHex(body.hash, 32, 'Transaction hash');
  },
  'platform.addresses': addressBatch(RECOVERY_PLATFORM_ADDRESS_BATCH),
  'platform.address-history': publicField('address'),
  'platform.identity-by-public-key-hash': (value) => {
    const body = exactNetworkPayload(value, ['network', 'publicKeyHashHex']);
    assertRecoveryNetwork(body.network);
    assertHex(body.publicKeyHashHex, 20, 'Platform public-key hash');
  },
  'platform.identity-history': publicField('identifier'),
  'shielded.page': (value) => {
    const body = exactNetworkPayload(value, ['network', 'startPosition', 'count']);
    assertRecoveryNetwork(body.network);
    assertDecimal(body.startPosition, 'Shielded page start position');
    assertIntegerRange(body.count, 1, 8192, 'Shielded page count');
  },
  'address.history': (value) => {
    const body = exactNetworkPayload(value, ['coin', 'network', 'address']);
    if (body.coin !== 'bitcoin' && body.coin !== 'ethereum') throw new Error('Public history coin is invalid.');
    assertRecoveryNetwork(body.network);
    assertPublicToken(body.address, 'Address');
  },
  'utxo.addresses': addressBatch(RECOVERY_UTXO_ADDRESS_BATCH),
  'evm.accounts': addressBatch(RECOVERY_EVM_ACCOUNT_BATCH),
};

/** Reference validator for the unfiltered development worker; release builds generate a smaller allowlist. */
export const validateRecoveryNetworkRequest = (value: unknown): RecoveryNetworkRequest =>
  validateNetworkRequest(value, ALL_OPERATION_VALIDATORS);

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
