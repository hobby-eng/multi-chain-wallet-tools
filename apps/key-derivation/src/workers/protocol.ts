import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import type { DerivationResult } from '@ckd/core/types.js';
import type { CompactMessageSignature } from '@ckd/core/compact-message.js';
import type { SilentPaymentResult } from './silent-payment.js';
import type { Bip85RequestOptions, Bip85Result } from './bip85-deriver.js';

export interface Bip38EncryptionResult {
  encryptedKey: string;
  address: string;
}

export interface AddressSearchMatch {
  index: number;
  path: string;
  address: string;
}

export type MessageSigningFormat =
  | 'bitcoin-compact'
  | 'dash-compact'
  | 'bitcoin-bip322-legacy'
  | 'bitcoin-bip322-nested'
  | 'bitcoin-bip322-native'
  | 'bitcoin-bip322-taproot';

export type WorkerRequest =
  | { id: number; type: 'derive'; adapterId: string; input: CoinDerivationInput }
  | {
    id: number;
    type: 'search';
    adapterId: string;
    input: Omit<CoinDerivationInput, 'start' | 'count'>;
    expectedAddress: string;
    start: number;
    count: number;
  }
  | {
    id: number;
    type: 'sign-message';
    adapterId: string;
    input: CoinDerivationInput;
    address: string;
    message: string;
    format: MessageSigningFormat;
  }
  | {
    id: number;
    type: 'silent-payment';
    seed: Uint8Array;
    network: 'mainnet' | 'testnet';
    account: number;
    labelIndexes?: readonly number[];
  }
  | { id: number; type: 'bip85'; seed: Uint8Array; options: Bip85RequestOptions }
  | {
    id: number;
    type: 'bip38-encrypt';
    adapterId: string;
    input: CoinDerivationInput;
    address: string;
    passphrase: string;
  }
  | { id: number; type: 'self-test' };

export type WorkerSuccess =
  | { id: number; ok: true; type: 'derive'; result: DerivationResult }
  | { id: number; ok: true; type: 'search'; result: AddressSearchMatch | null }
  | { id: number; ok: true; type: 'sign-message'; result: CompactMessageSignature }
  | { id: number; ok: true; type: 'silent-payment'; result: SilentPaymentResult }
  | { id: number; ok: true; type: 'bip85'; result: Bip85Result }
  | { id: number; ok: true; type: 'bip38-encrypt'; result: Bip38EncryptionResult }
  | { id: number; ok: true; type: 'self-test'; result: CryptoSelfTestReport };

export interface WorkerFailure {
  id: number;
  ok: false;
  error: string;
}

export interface WorkerReady {
  type: 'ready';
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;
export type WorkerMessage = WorkerReady | WorkerResponse;
