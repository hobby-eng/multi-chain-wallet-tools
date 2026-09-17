import type { DiscoveryFeatureRuntime } from './feature-selection.js';

const FEATURE_METHODS = {
  seedDiscovery: [
    'scanCandidates',
    'candidateSummary',
    'createRecoverySeedInputs',
    'recoveryScanConfig',
    'wipeRecoverySeedInputs',
  ],
  watchOnlyDiscovery: [
    'resolveWatchOnlyScanTargets',
    'watchOnlyScanConfig',
    'wipeWatchOnlyTargets',
    'assertWatchOnlyBatchInput',
    'assertWatchOnlyMinimum',
    'parseWatchOnlyLines',
    'resolveWatchOnlyTargets',
  ],
  customPaths: ['customScanPaths', 'parseCustomAccountRange', 'describeCustomPath', 'editCustomPath'],
} as const;

export function assertDiscoveryFeatureRuntime(runtime: DiscoveryFeatureRuntime): void {
  for (const [flag, methods] of Object.entries(FEATURE_METHODS) as Array<
    [keyof typeof FEATURE_METHODS, readonly (keyof DiscoveryFeatureRuntime)[]]
  >) {
    for (const method of methods) {
      const installed = runtime[method] !== undefined;
      if (runtime[flag] !== installed) {
        throw new Error(
          `Discovery feature runtime mismatch: ${String(flag)}=${String(runtime[flag])}, ${String(method)} installed=${String(installed)}.`,
        );
      }
    }
  }
}
