import { scanCandidates, candidateSummary } from './candidate-scan.js';
import { createRecoverySeedInputs, recoveryScanConfig, wipeRecoverySeedInputs } from './seed-scan-input.js';
import { resolveWatchOnlyScanTargets, watchOnlyScanConfig, wipeWatchOnlyTargets } from './watch-only-input.js';
import { customScanPaths, parseCustomAccountRange } from './coins/custom-path.js';
import { describeCustomPath, editCustomPath } from './custom-path-editor.js';
import {
  assertWatchOnlyBatchInput,
  assertWatchOnlyMinimum,
  parseWatchOnlyLines,
  resolveWatchOnlyTargets,
} from '@ckd/recovery/watch-only.js';

export interface DiscoveryFeatureRuntime {
  readonly seedDiscovery: boolean;
  readonly watchOnlyDiscovery: boolean;
  readonly walletMatcher: boolean;
  readonly customPaths: boolean;
  readonly boundaryDescription: string;
  readonly scanCandidates?: typeof scanCandidates;
  readonly createRecoverySeedInputs?: typeof createRecoverySeedInputs;
  readonly recoveryScanConfig?: typeof recoveryScanConfig;
  readonly wipeRecoverySeedInputs?: typeof wipeRecoverySeedInputs;
  readonly resolveWatchOnlyScanTargets?: typeof resolveWatchOnlyScanTargets;
  readonly watchOnlyScanConfig?: typeof watchOnlyScanConfig;
  readonly wipeWatchOnlyTargets?: typeof wipeWatchOnlyTargets;
  readonly candidateSummary?: typeof candidateSummary;
  readonly customScanPaths?: typeof customScanPaths;
  readonly parseCustomAccountRange?: typeof parseCustomAccountRange;
  readonly describeCustomPath?: typeof describeCustomPath;
  readonly editCustomPath?: typeof editCustomPath;
  readonly assertWatchOnlyBatchInput?: typeof assertWatchOnlyBatchInput;
  readonly assertWatchOnlyMinimum?: typeof assertWatchOnlyMinimum;
  readonly parseWatchOnlyLines?: typeof parseWatchOnlyLines;
  readonly resolveWatchOnlyTargets?: typeof resolveWatchOnlyTargets;
}

export const ALL_DISCOVERY_FEATURES: DiscoveryFeatureRuntime = {
  seedDiscovery: true,
  watchOnlyDiscovery: true,
  walletMatcher: true,
  customPaths: true,
  boundaryDescription:
    "Opaque-origin Secret Vault · connect-src/worker-src 'none' · isolated network worker · scan-end export tripwire · secret candidates discarded before download · shell export broker · max 5 requests",
  scanCandidates,
  candidateSummary,
  createRecoverySeedInputs,
  recoveryScanConfig,
  wipeRecoverySeedInputs,
  resolveWatchOnlyScanTargets,
  watchOnlyScanConfig,
  wipeWatchOnlyTargets,
  customScanPaths,
  parseCustomAccountRange,
  describeCustomPath,
  editCustomPath,
  assertWatchOnlyBatchInput,
  assertWatchOnlyMinimum,
  parseWatchOnlyLines,
  resolveWatchOnlyTargets,
};
