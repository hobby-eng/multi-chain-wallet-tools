import type { RecoveryNetwork } from './types.js';

export const RECOVERY_NETWORK_ATTACH = 'ckd-recovery-network-attach-v1';
export const RECOVERY_NETWORK_READY = 'ckd-recovery-network-ready-v1';
export const RECOVERY_VAULT_CHANNEL = 'ckd-recovery-vault-channel-v1';
export const RECOVERY_NETWORK_FATAL = 'ckd-recovery-network-fatal-v1';
export const RECOVERY_EXPORT_REQUEST = 'ckd-recovery-export-request-v1';
export const RECOVERY_EXPORT_RESULT = 'ckd-recovery-export-result-v1';
// One reviewed source of truth shared by the vault scanners and the isolated
// worker validators. Changing a transport limit now changes both sides.
export const RECOVERY_CORE_ADDRESS_BATCH = 100;
export const RECOVERY_PLATFORM_ADDRESS_BATCH = 100;
// Blockchain.info's lightweight balance endpoint and BlockCypher both accept
// up to 100 addresses, so keep the vault and worker on that shared ceiling.
export const RECOVERY_UTXO_ADDRESS_BATCH = 100;
// One address contributes balance and nonce calls to the JSON-RPC batch.
export const RECOVERY_EVM_ACCOUNT_BATCH = 100;
export const RECOVERY_CORE_ENDPOINTS = {
  mainnet: 'https://dashscan.pshenmic.dev',
  testnet: 'https://testnet.dashscan.pshenmic.dev',
} as const;

export type RecoveryExportBrokerFormat = 'csv' | 'json';

export interface RecoveryExportBrokerRequest {
  type: typeof RECOVERY_EXPORT_REQUEST;
  id: string;
  format: RecoveryExportBrokerFormat;
  text: string;
}

export interface RecoveryExportBrokerResult {
  type: typeof RECOVERY_EXPORT_RESULT;
  id: string;
  ok: boolean;
  filename?: string;
  error?: string;
}

export interface ProofMetadataView {
  height: string;
  coreChainLockedHeight: number;
  protocolVersion: number;
  timeMs: string;
}

export interface PlatformAddressInfoView {
  balance: string;
  nonce: string;
}

export interface PlatformAddressBatchView {
  entries: Array<[string, PlatformAddressInfoView | null]>;
  metadata: ProofMetadataView;
}

export interface PlatformHistorySummaryView {
  resource: string;
  balance: string;
  transactionCount: number;
  incomingCount: number;
  outgoingCount: number;
  totalReceived: string;
  totalSent: string;
  totalFees: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  indexedHeight: number;
  fundingCoreTx?: string;
}

export interface DashCoreTransactionView {
  hash: string;
  type: string;
  timestamp: string | null;
  inputAddresses: string[];
  assetLockCreditOutputs: Array<{
    amount: string;
    publicKeyHash: string;
  }>;
}

export interface IdentityView {
  identifier: string;
  balance: string;
  revision: string;
}

export interface IdentityLookupView {
  identities: IdentityView[];
  metadata: ProofMetadataView;
  proofQueries: number;
  dapiDurationsMs: number[];
}

export interface ShieldedNoteView {
  cmx: Uint8Array;
  nullifier: Uint8Array;
  cvNet: Uint8Array;
  encryptedNote: Uint8Array;
}

export interface ShieldedPageView {
  notes: ShieldedNoteView[];
  metadata: ProofMetadataView;
}

export interface UtxoAddressView {
  address: string;
  balance: string;
  transactionCount: number;
}

export interface EvmAccountView {
  address: string;
  balance: string;
  nonce: string;
}

export interface EvmAccountBatchView {
  entries: EvmAccountView[];
  blockNumber: string;
}

export interface RecoveryNetworkApi {
  ping(signal?: AbortSignal): Promise<string>;
  coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown>;
  coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown>;
  coreTransaction(network: RecoveryNetwork, hash: string, signal?: AbortSignal): Promise<DashCoreTransactionView>;
  platformAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<PlatformAddressBatchView>;
  platformAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView>;
  platformIdentityByPublicKeyHash(network: RecoveryNetwork, publicKeyHashHex: string, signal?: AbortSignal): Promise<IdentityLookupView>;
  platformIdentityHistory(network: RecoveryNetwork, identifier: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView>;
  shieldedPage(network: RecoveryNetwork, startPosition: string, count: number, signal?: AbortSignal): Promise<ShieldedPageView>;
  utxoAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<UtxoAddressView[]>;
  evmAccounts(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<EvmAccountBatchView>;
}

export type RecoveryNetworkRequestInput =
  | { operation: 'ping'; payload: Record<string, never> }
  | { operation: 'core.status'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.tip'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.address-info'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'core.address-history'; payload: { network: RecoveryNetwork; address: string } }
  | { operation: 'core.transaction'; payload: { network: RecoveryNetwork; hash: string } }
  | { operation: 'platform.addresses'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'platform.address-history'; payload: { network: RecoveryNetwork; address: string } }
  | { operation: 'platform.identity-by-public-key-hash'; payload: { network: RecoveryNetwork; publicKeyHashHex: string } }
  | { operation: 'platform.identity-history'; payload: { network: RecoveryNetwork; identifier: string } }
  | { operation: 'shielded.page'; payload: { network: RecoveryNetwork; startPosition: string; count: number } }
  | { operation: 'utxo.addresses'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'evm.accounts'; payload: { network: RecoveryNetwork; addresses: string[] } };

type WithRequestId<T> = T extends RecoveryNetworkRequestInput ? T & { id: string } : never;

export type RecoveryNetworkRequest = WithRequestId<RecoveryNetworkRequestInput>;

export type RecoveryNetworkResponse =
  | { id: string; ok: true; value: unknown }
  | { id: string; ok: false; error: string };

export interface RecoveryNetworkCancel {
  type: 'cancel';
  id: string;
}

export interface RecoveryNetworkInvoke {
  type: 'invoke';
  request: RecoveryNetworkRequest;
}

export type RecoveryNetworkPortMessage = RecoveryNetworkCancel | RecoveryNetworkInvoke;
