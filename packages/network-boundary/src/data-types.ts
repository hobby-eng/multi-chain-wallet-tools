import type { NetworkName } from '@ckd/core/types.js';

export type RecoveryNetwork = NetworkName;
export interface RecoveryHistory {
  asset: string;
  atomicUnit: string;
  decimals: number;
  status: 'complete' | 'partial' | 'unavailable' | 'unsupported';
  source: string;
  scope: string;
  note: string;
  totalReceivedAtomic: string | null;
  totalSentAtomic: string | null;
  totalFeesAtomic: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  firstReceived: string | null;
  lastReceived: string | null;
  firstSpent: string | null;
  lastSpent: string | null;
  transactionCount: number | null;
  pendingTransactionCount: number | null;
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
export const RECOVERY_UTXO_ADDRESS_BATCH = 100;
export const RECOVERY_EVM_ACCOUNT_BATCH = 100;
