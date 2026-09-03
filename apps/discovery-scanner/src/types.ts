import type { NetworkName } from '@ckd/core/types.js';
import type { RecoveryTaskLimiter } from './concurrency.js';
import type { RecoveryNetworkApi } from './network-protocol.js';
import type { SecretEgressGuard } from './secret-guard.js';

export type RecoveryNetwork = NetworkName;
export type RecoveryInputMode = 'single' | 'batch';

export interface RecoverySeedInput {
  id: string;
  label: string;
  mnemonic: string;
  passphrase: string;
}

export interface RecoveryScanConfig {
  network: RecoveryNetwork;
  account: number;
  scanCore: boolean;
  coreReceiveCount: number;
  coreChangeCount: number;
  scanPlatformAddresses: boolean;
  platformAddressCount: number;
  scanPlatformIdentities: boolean;
  identityStartIndex: number;
  identityGapLimit: number;
  identityScanLimit: number;
  includeUsedZeroBalance: boolean;
  scanShieldedPool: boolean;
}

export type RecoverySectionId = 'core' | 'platform' | 'identity' | 'shielded';
export type RecoverySectionState = 'complete' | 'partial' | 'skipped' | 'failed';

export interface RecoveryMetric {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

export interface RecoveryField {
  label: string;
  value: string;
  copyable?: boolean;
}

export interface RecoveryFinding {
  id: string;
  title: string;
  subtitle: string;
  balanceAtomic: bigint;
  balanceLabel: string;
  fields: RecoveryField[];
}

export interface RecoverySection {
  id: RecoverySectionId;
  title: string;
  description: string;
  state: RecoverySectionState;
  metrics: RecoveryMetric[];
  findings: RecoveryFinding[];
  scanned: number | bigint;
  source: string;
  proof: string;
  warning?: string;
}

export interface RecoveryWalletResult {
  inputId: string;
  label: string;
  coinId: string;
  coinLabel: string;
  network: RecoveryNetwork;
  startedAt: string;
  completedAt: string;
  /** Coin-specific, unit-safe aggregate values rendered above the sections. */
  overview: RecoveryMetric[];
  sections: RecoverySection[];
  warnings: string[];
}

export interface RecoveryProgress {
  inputId: string;
  section: RecoverySectionId | 'prepare';
  message: string;
  completed: number;
  total: number | null;
}

export interface RecoveryScanContext {
  signal: AbortSignal;
  /** Narrow RPC client. Its implementation owns every network-capable dependency. */
  networkApi: RecoveryNetworkApi;
  networkLimiter?: RecoveryTaskLimiter;
  /** Per-run tripwire used to prevalidate public exports before secrets are discarded. */
  sessionSecretGuard?: SecretEgressGuard;
  /** Optional one-pass batch preparation, such as shared streaming Orchard scan. */
  preparedSections?: Promise<ReadonlyMap<string, RecoverySection>>;
  onProgress(progress: RecoveryProgress): void;
  onFinding(inputId: string, section: RecoverySectionId, finding: RecoveryFinding): void;
}

export interface RecoveryCoinAdapter {
  readonly id: string;
  readonly label: string;
  readonly networks: readonly RecoveryNetwork[];
  prepareBatch?(
    inputs: readonly RecoverySeedInput[],
    config: RecoveryScanConfig,
    context: Omit<RecoveryScanContext, 'preparedSections'>,
  ): Promise<ReadonlyMap<string, RecoverySection>>;
  scan(input: RecoverySeedInput, config: RecoveryScanConfig, context: RecoveryScanContext): Promise<RecoveryWalletResult>;
}

/**
 * Public projection of the report. These types are the enforced export
 * contract: anything absent here cannot reach a file without a deliberate
 * type change. Exact integers cross as decimal strings.
 */
export interface RecoveryExportFinding {
  id: string;
  title: string;
  subtitle: string;
  balanceAtomic: string;
  balanceLabel: string;
  fields: RecoveryField[];
}

export interface RecoveryExportSection {
  id: RecoverySectionId;
  title: string;
  description: string;
  state: RecoverySectionState;
  scanned: string;
  source: string;
  proof: string;
  warning?: string;
  metrics: RecoveryMetric[];
  findings: RecoveryExportFinding[];
}

export interface RecoveryExportResult {
  inputId: string;
  label: string;
  coinId: string;
  coinLabel: string;
  network: RecoveryNetwork;
  startedAt: string;
  completedAt: string;
  overview: RecoveryMetric[];
  warnings: string[];
  sections: RecoveryExportSection[];
}

export interface RecoveryExportEnvelope {
  format: 'wallet-discovery-report';
  version: 1;
  createdAt: string;
  containsSecrets: false;
  safetyNotice: string;
  results: RecoveryExportResult[];
}
