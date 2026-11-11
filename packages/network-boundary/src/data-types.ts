import type { NetworkName } from "@ckd/core/types.js";

export type RecoveryNetwork = NetworkName;
export interface RecoveryHistory {
  asset: string;
  atomicUnit: string;
  decimals: number;
  status: "complete" | "partial" | "unavailable" | "unsupported";
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
  /** The EIP-155 chain id that the endpoint reported, in decimal; the provider checked it. */
  chainId: string;
  entries: EvmAccountView[];
  blockNumber: string;
}
/** One address of an account coin as its network holds it now. */
export interface AccountStateView {
  address: string;
  /** Whether the network holds the account: funded, activated or created on chain. */
  exists: boolean;
  /** Whether the address was ever used as far as the provider shows: it exists or has a transaction. */
  used: boolean;
  /** The native balance in atomic units, as decimal text; "0" for an account that does not exist. */
  balance: string;
  /** The account's sequence number as decimal text, where the coin has one; null otherwise. */
  sequence: string | null;
  /**
   * Where the network numbers its accounts apart from the address (Hedera's 0.0.N): the accounts
   * the address finds, in ascending order of their numbers, each with its balance in atomic units
   * (`balance` is their sum), so that a total counts an account that two addresses find once;
   * absent on other coins.
   */
  accounts?: NumberedAccountView[];
}
/** An account a network numbers (Hedera's 0.0.N) and its balance in atomic units, as decimal text. */
export interface NumberedAccountView {
  id: string;
  balance: string;
}
export interface AccountStatesView {
  /** The account coin's id, such as "solana". */
  coin: string;
  /** The ledger, slot or block the provider read, as decimal text; null where it reports none. */
  height: string | null;
  /** One entry per requested address, in the request's order. */
  entries: AccountStateView[];
}
export const RECOVERY_UTXO_ADDRESS_BATCH = 100;
export const RECOVERY_EVM_ACCOUNT_BATCH = 100;
