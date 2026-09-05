export type NetworkName = 'mainnet' | 'testnet';
export type DisplayMode = 'basic' | 'advanced';

export interface ResultField {
  key: string;
  label: string;
  value: string;
  secret: boolean;
  description?: string;
}

export interface ResultFieldGroup {
  key: string;
  title: string;
  description?: string;
  basic: ResultField[];
  advanced: ResultField[];
}

export interface DerivedRow {
  index: number;
  path: string;
  title: string;
  basic: ResultField[];
  advanced: ResultField[];
  /** Related fields rendered together while the row remains the selection/export unit. */
  groups?: ResultFieldGroup[];
}

export interface WatchOnlyExport {
  label: string;
  description: string;
  text: string;
  fileName: string;
  mimeType: 'text/plain' | 'application/json';
  /** Watch-only material cannot spend, but exposes the wallet's address graph or activity. */
  privacySensitive: true;
}

export interface DerivationResult {
  id: string;
  title: string;
  networkLabel: string;
  pathTemplate: string;
  /** Account-scoped fields useful in Basic mode, kept separate from per-address rows. */
  basicSummary: ResultField[];
  /** Additional account/root fields shown in Advanced mode. */
  summary: ResultField[];
  watchOnly?: WatchOnlyExport;
  rows: DerivedRow[];
  notices: string[];
}

export interface Bip32BatchOptions {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  branch: number;
  start: number;
  count: number;
}

export interface ShieldedBatchOptions {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  start: number;
  count: number;
}

export function field(
  key: string,
  label: string,
  value: string,
  secret = false,
  description?: string,
): ResultField {
  return description === undefined
    ? { key, label, value, secret }
    : { key, label, value, secret, description };
}
