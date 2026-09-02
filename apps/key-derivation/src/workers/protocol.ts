import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import type { DerivationResult } from '@ckd/core/types.js';

export interface AddressSearchMatch {
  index: number;
  path: string;
  address: string;
}

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
  | { id: number; type: 'self-test' };

export type WorkerSuccess =
  | { id: number; ok: true; type: 'derive'; result: DerivationResult }
  | { id: number; ok: true; type: 'search'; result: AddressSearchMatch | null }
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
