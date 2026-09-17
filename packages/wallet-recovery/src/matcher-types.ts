import type { NetworkName } from '@ckd/core/types.js';

export interface WalletMatcherTarget {
  readonly id: string;
  readonly input: string;
  readonly normalized: string;
  readonly network: NetworkName;
  readonly adapterIds: readonly string[];
  /** When present, compare these derived public fields instead of a payment address. */
  readonly fieldKeys?: readonly string[];
}

export type WalletMatcherTargetDetector = (
  input: string,
  network: NetworkName,
  forceAllProfiles: boolean,
) => WalletMatcherTarget[];
