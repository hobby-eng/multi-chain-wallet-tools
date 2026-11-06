/** Provider-reported DPNS alias metadata; timestamps are UTC milliseconds. */
export interface IdentityAliasHistory {
  name: string;
  status: string;
  contested: boolean;
  timestampMs: number | null;
  transactionHash: string | null;
  documentId: string | null;
}

/** Indexed transition and address-relative credit flow; timestamps are UTC milliseconds. */
export interface IdentityActivityEvent {
  transactionHash: string;
  type: string;
  batchType: string | null;
  status: string | null;
  error: string | null;
  timestampMs: number | null;
  blockHeight: number | null;
  blockHash: string | null;
  gasUsedCredits: bigint | null;
  direction: "incoming" | "outgoing" | "self" | "related";
  netAmountCredits: bigint | null;
  transfers: IdentityTransferMovement[];
}

/** Indexed transfer leg relative to the queried Identity; amounts are credits. */
export interface IdentityTransferMovement {
  direction: "incoming" | "outgoing" | "self" | "related";
  amountCredits: bigint;
  sender: string | null;
  recipient: string | null;
}

/** Indexed public document metadata; timestamps are UTC milliseconds. */
export interface IdentityDocumentHistory {
  identifier: string;
  dataContractIdentifier: string | null;
  documentTypeName: string | null;
  revision: number | null;
  transactionHash: string | null;
  timestampMs: number | null;
  deleted: boolean;
  system: boolean;
}

/** Indexed data-contract metadata with optional document and token counts. */
export interface IdentityDataContractHistory {
  identifier: string;
  name: string | null;
  version: number | null;
  transactionHash: string | null;
  timestampMs: number | null;
  system: boolean;
  documentsCount: number | null;
  tokensCount: number | null;
  description: string | null;
  keywords: string[];
}

/** Indexed withdrawal with an amount in credits and a UTC-millisecond timestamp. */
export interface IdentityWithdrawalHistory {
  documentId: string;
  status: string;
  amountCredits: bigint;
  timestampMs: number | null;
  withdrawalAddress: string | null;
  coreTransactionHash: string | null;
}

/** Indexed token metadata; supplies are atomic token units interpreted with decimals. */
export interface IdentityTokenHistory {
  identifier: string;
  dataContractIdentifier: string | null;
  position: number | null;
  name: string | null;
  description: string | null;
  baseSupply: bigint | null;
  totalSupply: bigint | null;
  maxSupply: bigint | null;
  decimals: number | null;
  mintable: boolean | null;
  burnable: boolean | null;
  freezable: boolean | null;
  destroyable: boolean | null;
  timestampMs: number | null;
}

/** Auxiliary indexed history, credit accounting and explicit coverage warnings, separate from DAPI proof state. */
export interface PlatformIdentityHistorySnapshot {
  provider: string;
  identifier: string;
  owner: string | null;
  explorerRevision: bigint;
  explorerBalanceCredits: bigint;
  explorerNonce: bigint | null;
  registeredAtMs: number | null;
  registrationType: string | null;
  registrationTransactionHash: string | null;
  registrationFundingSource: "core-asset-lock" | "platform-addresses" | "shielded-pool" | "unknown";
  fundingCoreTransactionHash: string | null;
  fundingCoreTransactionOutputIndex: number | null;
  fundingCoreTransactionError: string | null;
  systemIdentity: boolean;
  aliases: IdentityAliasHistory[];
  totalTransactions: number;
  totalTransfers: number;
  totalDocuments: number;
  totalDataContracts: number;
  totalGasSpentCredits: bigint | null;
  averageGasSpentCredits: bigint | null;
  totalTopUps: number | null;
  totalTopUpsCredits: bigint | null;
  totalWithdrawals: number | null;
  totalWithdrawalsCredits: bigint | null;
  lastWithdrawalHash: string | null;
  lastWithdrawalTimestampMs: number | null;
  activity: IdentityActivityEvent[];
  documents: IdentityDocumentHistory[];
  dataContracts: IdentityDataContractHistory[];
  withdrawals: IdentityWithdrawalHistory[];
  tokens: IdentityTokenHistory[];
  historyLimit: number;
  historyWarnings?: string[];
  endpoint: string;
  indexStatus: "synced";
  indexedHeight: number;
  indexedTimeMs: number;
  requests: number;
}

/** One auxiliary-history result or explicit failure alongside separately acquired proof state. */
export interface PlatformIdentityHistoryResult {
  identifier: string;
  history: PlatformIdentityHistorySnapshot | null;
  error: string | null;
}
