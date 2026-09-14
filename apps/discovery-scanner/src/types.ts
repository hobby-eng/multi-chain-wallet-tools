import type { NetworkName } from '@ckd/core/types.js';
import type { RecoveryTaskLimiter } from './concurrency.js';
import type { RecoveryNetworkApi } from '@ckd/network-boundary/protocol.js';
import type { SecretEgressGuard } from '@ckd/secret-boundary/secret-guard.js';
import type { RecoveryInputSnapshot, DiscoveryScannerView } from './view.js';
import type {
  DetectedWatchOnlyMaterial,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from '@ckd/recovery/watch-only/types.js';
export type {
  DetectedWatchOnlyMaterial,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from '@ckd/recovery/watch-only/types.js';

export type RecoveryNetwork = NetworkName;
export type RecoveryInputMode = 'single' | 'batch';
export type RecoverySourceMode = 'seed' | 'public';

export interface RecoverySeedInput {
  id: string;
  label: string;
  mnemonic: string;
  passphrase: string;
}

export interface AddressSearchRunnerContext {
  inputMode: RecoveryInputMode;
  recoveryInputs: (snapshot: RecoveryInputSnapshot) => RecoverySeedInput[];
  wipeInputObjects: (inputs: RecoverySeedInput[]) => void;
  sessionSecretGuard: Pick<SecretEgressGuard, 'registerString' | 'registerBytes' | 'clear'>;
  view: Pick<
    DiscoveryScannerView,
    'resetResults' | 'resetAddressSearch' | 'setStatus' | 'renderAddressSearch' | 'showError'
  >;
  resetState: () => void;
  prepareRun: () => { controller: AbortController; generation: number };
  isCurrentRun: (generation: number) => boolean;
  finishRun: (generation: number) => void;
  describeUnknownError: (cause: unknown) => string;
}

export type AddressSearchRunner = (snapshot: RecoveryInputSnapshot, context: AddressSearchRunnerContext) => void;

export type RecoverySectionId =
  | 'core'
  | 'legacyCore'
  | 'coinjoin'
  | 'providerCollateral'
  | 'platform'
  | 'identity'
  | 'shielded';
export type RecoverySectionState = 'complete' | 'partial' | 'skipped' | 'failed';

export interface RecoveryScanConfig {
  network: RecoveryNetwork;
  account: number;
  scanCore: boolean;
  coreReceiveCount: number;
  coreChangeCount: number;
  scanCustomPath?: boolean;
  customPathTemplate?: string;
  customPathRangeEnd?: string;
  customPathFormat?: string;
  customPathCount?: number;
  scanLegacyCore: boolean;
  legacyCoreCount: number;
  scanCoinJoin: boolean;
  coinJoinExternalCount: number;
  coinJoinInternalCount: number;
  scanIdentityFunding: boolean;
  identityFundingCount: number;
  identityTopUpIdentityCount: number;
  identityTopUpCount: number;
  scanProviderCollateral: boolean;
  providerCollateralCount: number;
  scanPlatformAddresses: boolean;
  platformAddressCount: number;
  scanPlatformIdentities: boolean;
  identityStartIndex: number;
  identityGapLimit: number;
  identityScanLimit: number;
  includeUsedZeroBalance: boolean;
  scanShieldedPool: boolean;
}

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

/** Exact, unit-aware history shared by every coin adapter and both input modes.
 * Null means unavailable, never zero. Completeness applies only to `scope`.
 */
export interface RecoveryAmountUnit {
  asset: string;
  atomicUnit: string;
  decimals: number;
}

export interface RecoveryHistory extends RecoveryAmountUnit {
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

export interface RecoveryFinding {
  id: string;
  title: string;
  subtitle: string;
  /** null means current balance cannot be established from this observation. */
  balanceAtomic: bigint | null;
  balanceLabel: string;
  balanceUnit?: RecoveryAmountUnit;
  fields: RecoveryField[];
  history?: RecoveryHistory;
}

export interface RecoverySection {
  id: RecoverySectionId;
  title: string;
  description: string;
  state: RecoverySectionState;
  balanceAvailable?: boolean;
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
  /** Native balance units, independent of optional history availability. */
  amountUnit?(section: RecoverySectionId): RecoveryAmountUnit;
  /** Optional public-resource enrichment. The common runner handles failures,
   * presentation and exports; future adapters only implement this capability.
   * Never accept seed phrases, extended keys or arbitrary URLs here. */
  getHistory?(
    finding: RecoveryFinding,
    section: RecoverySectionId,
    network: RecoveryNetwork,
    context: RecoveryScanContext,
  ): Promise<RecoveryHistory>;
  readonly customPath?: {
    readonly description: string;
    readonly placeholder: string;
    readonly defaultTemplate?: (network: RecoveryNetwork) => string;
    readonly formats: ReadonlyArray<{ id: string; label: string }>;
  };
  prepareBatch?(
    inputs: readonly RecoverySeedInput[],
    config: RecoveryScanConfig,
    context: Omit<RecoveryScanContext, 'preparedSections'>,
  ): Promise<ReadonlyMap<string, RecoverySection>>;
  scan(
    input: RecoverySeedInput,
    config: RecoveryScanConfig,
    context: RecoveryScanContext,
  ): Promise<RecoveryWalletResult>;
  /**
   * Local, offline shape detection for one pasted watch-only line. Throws
   * `WatchOnlyNotRecognizedError` (see `../watch-only.js`) when this coin does
   * not own the input at all, so the caller can either try the next adapter
   * (Auto mode) or report a clear "not recognized"/conflict error (explicit
   * coin mode). Never performs a network request.
   */
  detectWatchOnly?(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial;
  /**
   * Derives every candidate public address/hash locally from the already
   * public `input.value`, then queries only that public data. No extended or
   * viewing key ever reaches `context.networkApi`.
   */
  scanWatchOnly?(
    input: RecoveryWatchOnlyInput,
    config: RecoveryWatchOnlyScanConfig,
    context: RecoveryScanContext,
  ): Promise<RecoveryWalletResult>;
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
  balanceAtomic: string | null;
  balanceLabel: string;
  balanceUnit?: RecoveryAmountUnit;
  fields: RecoveryField[];
  history?: Omit<RecoveryHistory, 'firstReceived' | 'lastReceived' | 'firstSpent' | 'lastSpent'>;
}

export interface RecoveryExportSection {
  id: RecoverySectionId;
  title: string;
  description: string;
  state: RecoverySectionState;
  balanceAvailable?: boolean;
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
