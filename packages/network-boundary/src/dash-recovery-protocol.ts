import type { NetworkName } from '@ckd/core/types.js';

export type RecoveryNetwork = NetworkName;

export const RECOVERY_CORE_ADDRESS_BATCH = 100;
export const RECOVERY_PLATFORM_ADDRESS_BATCH = 100;

export interface ProofMetadataView {
  height: string;
  coreChainLockedHeight: number;
  protocolVersion: number;
  timeMs: string;
}
interface PlatformAddressInfoView {
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
  assetLockCreditOutputs: Array<{ amount: string; publicKeyHash: string }>;
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
interface ShieldedNoteView {
  cmx: Uint8Array;
  nullifier: Uint8Array;
  cvNet: Uint8Array;
  encryptedNote: Uint8Array;
}
export interface ShieldedPageView {
  notes: ShieldedNoteView[];
  metadata: ProofMetadataView;
}

export type DashRecoveryRequestInput =
  | { operation: 'core.status'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.tip'; payload: { network: RecoveryNetwork } }
  | { operation: 'core.address-info'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'core.address-history'; payload: { network: RecoveryNetwork; address: string } }
  | { operation: 'core.transaction'; payload: { network: RecoveryNetwork; hash: string } }
  | { operation: 'platform.addresses'; payload: { network: RecoveryNetwork; addresses: string[] } }
  | { operation: 'platform.address-history'; payload: { network: RecoveryNetwork; address: string } }
  | {
      operation: 'platform.identity-by-public-key-hash';
      payload: { network: RecoveryNetwork; publicKeyHashHex: string };
    }
  | { operation: 'platform.identity-history'; payload: { network: RecoveryNetwork; identifier: string } }
  | { operation: 'shielded.page'; payload: { network: RecoveryNetwork; startPosition: string; count: number } };
