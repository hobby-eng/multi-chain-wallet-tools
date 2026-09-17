import type { NetworkName } from '@ckd/core/types.js';

type RecoveryWatchOnlyKind =
  | 'bitcoin-descriptor'
  | 'bitcoin-xpub'
  | 'ethereum-xpub'
  | 'dash-legacy-xpub'
  | 'dash-core-xpub'
  | 'dash-coinjoin-xpub'
  | 'dash-platform-xpub'
  | 'public-key'
  | 'identity'
  | 'orchard-fvk'
  | 'orchard-ivk'
  | 'orchard-ovk';

export interface DetectedWatchOnlyMaterial {
  coinId: string;
  kind: RecoveryWatchOnlyKind;
  value: string;
  detectionLabel?: string;
  descriptorPath?: string;
  bundleNetwork?: 'mainnet' | 'testnet';
}

export interface RecoveryWatchOnlyInput extends DetectedWatchOnlyMaterial {
  id: string;
  label: string;
}

export interface RecoveryWatchOnlyScanConfig {
  network: NetworkName;
  minimumCount: number;
  includeUsedZeroBalance: boolean;
}

export interface WatchOnlyAdapterLike {
  readonly id: string;
  readonly label: string;
  detectWatchOnly?(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial;
}

export interface ResolvedWatchOnlyTarget {
  adapterId: string;
  material: DetectedWatchOnlyMaterial;
  network?: 'mainnet' | 'testnet';
  ambiguity?: { kind: 'bip32' | 'sec1'; depth?: number };
}
