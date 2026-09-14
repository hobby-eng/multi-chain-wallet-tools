import { assertWatchOnlyBatchInput, parseWatchOnlyLines, resolveWatchOnlyTargets } from '@ckd/recovery/watch-only.js';
import { BUILD_INFO } from '@ckd/build-info';
import { assertValidMnemonic } from '@ckd/core/bip39.js';
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

export function startDiscoveryScanner(
  registry: RecoveryCoinRegistry,
  runRecoverySelfTest: () => Promise<RecoverySelfTestReport>,
  addressSearchRunner?: AddressSearchRunner,
  watchOnlyProfile?: {
    prefixCoins: Readonly<Record<string, string>>;
    multiChain: boolean;
    networklessAdapterIds?: readonly string[];
    supportedDepths?: (adapterId: string) => readonly number[];
    singleChainCoinId?: string;
  },
): void {
  // Install explicitly so merely importing the client cannot mutate global browser state.
  installNetworkBoundaryListener();
  const view = createDiscoveryScannerView(document, BUILD_INFO, writeClipboard);
  const controller = createDiscoveryScannerController(view, {
    RecoveryConcurrencyLimiter,
    SecretEgressGuard,
    assertValidMnemonic,
    assertWatchOnlyBatchInput,
    parseWatchOnlyLines,
    resolveWatchOnlyTargets: (raw: string, adapters: readonly WatchOnlyAdapterLike[]) =>
      resolveWatchOnlyTargets(
        raw,
        adapters,
        watchOnlyProfile?.prefixCoins,
        watchOnlyProfile?.multiChain ?? false,
        watchOnlyProfile?.networklessAdapterIds ?? [],
        watchOnlyProfile?.supportedDepths,
        watchOnlyProfile?.singleChainCoinId ?? 'dash',
      ),
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
