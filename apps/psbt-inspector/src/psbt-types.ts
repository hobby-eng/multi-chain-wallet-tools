import type { PsbtPair } from './psbt-binary.js';
import type { ParsedTransaction } from './transaction.js';

export type PsbtChain = 'bitcoin' | 'dash';
export type PsbtNetwork = 'mainnet' | 'testnet' | 'regtest';

export interface SuppliedUtxo {
  readonly value: bigint;
  readonly script: Uint8Array;
  readonly binding: 'non-witness' | 'witness-only';
  readonly previousTransaction: ParsedTransaction | null;
}

export type VerificationStatus = 'verified' | 'failed' | 'not-verified' | 'not-applicable';

export interface PsbtVerificationCheck {
  readonly relationship: string;
  readonly status: VerificationStatus;
  readonly detail: string;
}

export interface ParsedPsbt {
  readonly chain: PsbtChain;
  readonly version: number;
  readonly global: readonly PsbtPair[];
  readonly inputs: readonly (readonly PsbtPair[])[];
  readonly outputs: readonly (readonly PsbtPair[])[];
  readonly transaction: ParsedTransaction | null;
  readonly inputUtxos: readonly (SuppliedUtxo | null)[];
  readonly inputValues: readonly (bigint | null)[];
  readonly outputValues: readonly bigint[];
  readonly fee: bigint | null;
  readonly globalVerification: readonly PsbtVerificationCheck[];
  readonly inputVerification: readonly (readonly PsbtVerificationCheck[])[];
}
