import { BUILD_INFO } from '@ckd/build-info';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { mapRecoveryTasks, RecoveryConcurrencyLimiter } from './concurrency.js';
import { createDiscoveryScannerController } from './controller.js';
import { requestRecoveryExport } from './download-client.js';
import { describeUnknownError } from '@ckd/core/error-handling.js';
import { createRecoveryExport } from './export.js';
import { installNetworkBoundaryListener, recoveryNetworkApi } from '@ckd/network-boundary/client.js';
import { SecretEgressGuard } from '@ckd/secret-boundary/secret-guard.js';
import type { RecoverySelfTestReport } from './recovery-self-test.js';
import type { RecoveryCoinRegistry } from './coins/registry.js';
import { createDiscoveryScannerView } from './view.js';
import type { AddressSearchRunner } from './types.js';
import type { WatchOnlyAdapterLike } from '@ckd/recovery/watch-only/types.js';
import type { DiscoveryFeatureRuntime } from './feature-selection.js';
import { assertDiscoveryFeatureRuntime } from './feature-runtime-validation.js';

export function startDiscoveryScanner(
  registry: RecoveryCoinRegistry,
  runRecoverySelfTest: () => Promise<RecoverySelfTestReport>,
  assertValidMnemonic: typeof import('@ckd/core/bip39.js').assertValidMnemonic,
  features: DiscoveryFeatureRuntime,
  addressSearchRunner?: AddressSearchRunner,
  watchOnlyProfile?: {
    prefixCoins: Readonly<Record<string, string>>;
    multiChain: boolean;
    networklessAdapterIds?: readonly string[];
    supportedDepths?: (adapterId: string) => readonly number[];
    singleChainCoinId?: string;
  },
): void {
  assertDiscoveryFeatureRuntime(features);
  // Install explicitly so merely importing the client cannot mutate global browser state.
  installNetworkBoundaryListener();
  const view = createDiscoveryScannerView(document, BUILD_INFO, writeClipboard, features);
  const controller = createDiscoveryScannerController(view, {
    RecoveryConcurrencyLimiter,
    SecretEgressGuard,
    assertValidMnemonic,
    ...(features.assertWatchOnlyBatchInput === undefined
      ? {}
      : { assertWatchOnlyBatchInput: features.assertWatchOnlyBatchInput }),
    ...(features.assertWatchOnlyMinimum === undefined
      ? {}
      : { assertWatchOnlyMinimum: features.assertWatchOnlyMinimum }),
    ...(features.parseWatchOnlyLines === undefined ? {} : { parseWatchOnlyLines: features.parseWatchOnlyLines }),
    ...(features.scanCandidates === undefined ? {} : { scanCandidates: features.scanCandidates }),
    ...(features.createRecoverySeedInputs === undefined
      ? {}
      : { createRecoverySeedInputs: features.createRecoverySeedInputs }),
    ...(features.recoveryScanConfig === undefined ? {} : { recoveryScanConfig: features.recoveryScanConfig }),
    ...(features.wipeRecoverySeedInputs === undefined
      ? {}
      : { wipeRecoverySeedInputs: features.wipeRecoverySeedInputs }),
    ...(features.resolveWatchOnlyScanTargets === undefined
      ? {}
      : { resolveWatchOnlyScanTargets: features.resolveWatchOnlyScanTargets }),
    ...(features.watchOnlyScanConfig === undefined ? {} : { watchOnlyScanConfig: features.watchOnlyScanConfig }),
    ...(features.wipeWatchOnlyTargets === undefined ? {} : { wipeWatchOnlyTargets: features.wipeWatchOnlyTargets }),
    ...(features.customScanPaths === undefined ? {} : { customScanPaths: features.customScanPaths }),
    ...(features.resolveWatchOnlyTargets === undefined
      ? {}
      : {
          resolveWatchOnlyTargets: (
            (resolveTargets) => (raw: string, adapters: readonly WatchOnlyAdapterLike[]) =>
              resolveTargets(
                raw,
                adapters,
                watchOnlyProfile?.prefixCoins,
                watchOnlyProfile?.multiChain ?? false,
                watchOnlyProfile?.networklessAdapterIds ?? [],
                watchOnlyProfile?.supportedDepths,
                watchOnlyProfile?.singleChainCoinId ?? 'dash',
              )
          )(features.resolveWatchOnlyTargets),
        }),
    createRecoveryExport,
    describeUnknownError,
    getRecoveryCoin: registry.getRecoveryCoin,
    listRecoveryCoins: registry.listRecoveryCoins,
    mapRecoveryTasks,
    recoveryNetworkApi,
    requestRecoveryExport,
    runRecoverySelfTest,
    ...(addressSearchRunner === undefined ? {} : { addressSearchRunner }),
  });

  controller.start();
}
