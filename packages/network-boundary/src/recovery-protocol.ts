import type {
  DashCoreTransactionView,
  DashRecoveryRequestInput,
  IdentityLookupView,
  PlatformAddressBatchView,
  PlatformHistorySummaryView,
  RecoveryNetwork,
  ShieldedPageView,
} from './dash-recovery-protocol.js';
import type { EvmAccountBatchView, RecoveryHistory, UtxoAddressView } from './data-types.js';
import type { PublicRecoveryRequestInput } from './public-recovery-protocol.js';
import type { NetworkBoundaryPortMessage, NetworkBoundaryResponse } from './transport-protocol.js';

export interface RecoveryNetworkApi {
  ping(signal?: AbortSignal): Promise<string>;
  coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown>;
  coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown>;
  coreTransaction(network: RecoveryNetwork, hash: string, signal?: AbortSignal): Promise<DashCoreTransactionView>;
  platformAddresses(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<PlatformAddressBatchView>;
  platformAddressHistory(
    network: RecoveryNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView>;
  platformIdentityByPublicKeyHash(
    network: RecoveryNetwork,
    publicKeyHashHex: string,
    signal?: AbortSignal,
  ): Promise<IdentityLookupView>;
  platformIdentityHistory(
    network: RecoveryNetwork,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView>;
  shieldedPage(
    network: RecoveryNetwork,
    startPosition: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ShieldedPageView>;
  addressHistory(
    coin: 'bitcoin' | 'ethereum',
    network: RecoveryNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory>;
  utxoAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<UtxoAddressView[]>;
  evmAccounts(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<EvmAccountBatchView>;
}

export type RecoveryNetworkRequestInput =
  | { operation: 'ping'; payload: Record<string, never> }
  | DashRecoveryRequestInput
  | PublicRecoveryRequestInput;

type WithRequestId<T> = T extends RecoveryNetworkRequestInput ? T & { id: string } : never;
export type RecoveryNetworkRequest = WithRequestId<RecoveryNetworkRequestInput>;
export type RecoveryNetworkResponse = NetworkBoundaryResponse;
export type RecoveryNetworkPortMessage = NetworkBoundaryPortMessage<RecoveryNetworkRequest>;
