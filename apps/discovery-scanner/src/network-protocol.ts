import type { RecoveryNetwork } from './types.js';

export const RECOVERY_NETWORK_ATTACH = 'ckd-recovery-network-attach-v1';
export const RECOVERY_NETWORK_READY = 'ckd-recovery-network-ready-v1';
export const RECOVERY_VAULT_CHANNEL = 'ckd-recovery-vault-channel-v1';
export const RECOVERY_NETWORK_FATAL = 'ckd-recovery-network-fatal-v1';
export const RECOVERY_EXPORT_REQUEST = 'ckd-recovery-export-request-v1';
export const RECOVERY_EXPORT_RESULT = 'ckd-recovery-export-result-v1';
// One reviewed source of truth shared by the vault scanners and the isolated
// worker validators. Changing a transport limit now changes both sides.
export const RECOVERY_CORE_ADDRESS_BATCH = 50;
export const RECOVERY_PLATFORM_ADDRESS_BATCH = 100;
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

export interface RecoveryNetworkApi {
  ping(signal?: AbortSignal): Promise<string>;
  coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown>;
  coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown>;
  coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown>;
  platformAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<PlatformAddressBatchView>;
  platformIdentityByPublicKeyHash(network: RecoveryNetwork, publicKeyHashHex: string, signal?: AbortSignal): Promise<IdentityLookupView>;
  shieldedPage(network: RecoveryNetwork, startPosition: string, count: number, signal?: AbortSignal): Promise<ShieldedPageView>;
}

export type RecoveryNetworkRequestInput =
  | { operation: 'ping'; payload: Record<string, never> }
  | { operation: 'core.status'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.tip'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.address-info'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'core.address-history'; payload: { network: RecoveryNetwork; address: string } }
  | { operation: 'platform.addresses'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'platform.identity-by-public-key-hash'; payload: { network: RecoveryNetwork; publicKeyHashHex: string } }
  | { operation: 'shielded.page'; payload: { network: RecoveryNetwork; startPosition: string; count: number } };

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
