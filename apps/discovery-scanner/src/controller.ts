import { enrichRecoveryHistory } from './history.js';
import type { RecoveryExportFile, RecoveryExportFormat } from './export.js';
import type { RecoveryCoinRegistry } from './coins/registry.js';
import type { RecoverySelfTestReport } from './recovery-self-test.js';
import type { DiscoveryScannerView, RecoveryInputSnapshot, WalletProgressView } from './view.js';
import type {
  RecoveryFinding,
  RecoveryInputMode,
  RecoveryProgress,
  RecoverySectionId,
  RecoverySeedInput,
  RecoveryWalletResult,
} from './types.js';
import { parseConcurrency } from '@ckd/core/validation.js';
import { wipeRecoveryInputSnapshot } from './input-snapshot.js';
import type { WatchOnlyTarget } from './watch-only-input.js';

interface DiscoveryScannerDependencies {
  RecoveryConcurrencyLimiter: typeof import('./concurrency.js').RecoveryConcurrencyLimiter;
  SecretEgressGuard: typeof import('@ckd/secret-boundary/secret-guard.js').SecretEgressGuard;
  assertValidMnemonic: typeof import('@ckd/core/bip39.js').assertValidMnemonic;
  assertWatchOnlyBatchInput?: typeof import('@ckd/recovery/watch-only.js').assertWatchOnlyBatchInput;
  assertWatchOnlyMinimum?: typeof import('@ckd/recovery/watch-only.js').assertWatchOnlyMinimum;
  parseWatchOnlyLines?: typeof import('@ckd/recovery/watch-only.js').parseWatchOnlyLines;
  resolveWatchOnlyTargets?: typeof import('@ckd/recovery/watch-only.js').resolveWatchOnlyTargets;
  scanCandidates?: typeof import('./candidate-scan.js').scanCandidates;
  createRecoverySeedInputs?: typeof import('./seed-scan-input.js').createRecoverySeedInputs;
  recoveryScanConfig?: typeof import('./seed-scan-input.js').recoveryScanConfig;
  wipeRecoverySeedInputs?: typeof import('./seed-scan-input.js').wipeRecoverySeedInputs;
  resolveWatchOnlyScanTargets?: typeof import('./watch-only-input.js').resolveWatchOnlyScanTargets;
  watchOnlyScanConfig?: typeof import('./watch-only-input.js').watchOnlyScanConfig;
  wipeWatchOnlyTargets?: typeof import('./watch-only-input.js').wipeWatchOnlyTargets;
  customScanPaths?: typeof import('./coins/custom-path.js').customScanPaths;
  createRecoveryExport: typeof import('./export.js').createRecoveryExport;
  describeUnknownError: typeof import('@ckd/core/error-handling.js').describeUnknownError;
  getRecoveryCoin: RecoveryCoinRegistry['getRecoveryCoin'];
  listRecoveryCoins: RecoveryCoinRegistry['listRecoveryCoins'];
  mapRecoveryTasks: typeof import('./concurrency.js').mapRecoveryTasks;
  recoveryNetworkApi: typeof import('@ckd/network-boundary/client.js').recoveryNetworkApi;
  requestRecoveryExport: typeof import('./download-client.js').requestRecoveryExport;
  runRecoverySelfTest: () => Promise<RecoverySelfTestReport>;
  addressSearchRunner?: import('./types.js').AddressSearchRunner;
}

const exportTripwireContext: Record<RecoveryExportFormat, string> = {
  csv: 'recovery CSV report export',
  json: 'recovery JSON report export',
};

export function createDiscoveryScannerController(
  view: DiscoveryScannerView,
  dependencies: DiscoveryScannerDependencies,
) {
  let started = false;
  let inputMode: RecoveryInputMode = 'single';
  let revealed = false;
  let running = false;
  let currentAbort: AbortController | null = null;
  let runGeneration = 0;
  let currentResults: RecoveryWalletResult[] = [];
  let liveFindingCount = 0;
  let selfTestPassed = false;
  let activeResultId: string | null = null;
  let resultTabTouched = false;
  let scanCompleted = false;
  const sessionSecretGuard = new dependencies.SecretEgressGuard();
  const validatedExports = new Map<RecoveryExportFormat, RecoveryExportFile>();
  const walletProgress = new Map<string, WalletProgressView>();

  function setRunning(value: boolean): void {
    running = value;
    view.setRunning(value, selfTestPassed, scanCompleted || currentResults.length > 0);
  }

  function setRevealed(value: boolean): void {
    revealed = value;
    view.setRevealed(value);
  }

  function setMode(mode: RecoveryInputMode): void {
    inputMode = mode;
    view.setMode(mode);
    view.updateEstimate();
    setRevealed(false);
  }

  function clearVisibleSecrets(): void {
    view.clearVisibleSecrets();
    setRevealed(false);
  }

  const recoveryInputs = (snapshot: RecoveryInputSnapshot) => {
    if (dependencies.createRecoverySeedInputs === undefined)
      throw new Error('Seed discovery is not included in this build.');
    return dependencies.createRecoverySeedInputs(snapshot, inputMode, dependencies.assertValidMnemonic);
  };
  const wipeInputObjects = (inputs: RecoverySeedInput[]) => dependencies.wipeRecoverySeedInputs?.(inputs);
  const wipeInputSnapshot = wipeRecoveryInputSnapshot;

  function renderResults(): void {
    if (!resultTabTouched || !currentResults.some(({ inputId }) => inputId === activeResultId)) {
      activeResultId = currentResults[0]?.inputId ?? null;
    }
    view.renderResults(currentResults, activeResultId, new Set(validatedExports.keys()), (inputId) => {
      activeResultId = inputId;
      resultTabTouched = true;
      renderResults();
    });
  }

  function initializeWalletProgress(inputs: readonly Pick<RecoverySeedInput, 'id' | 'label'>[]): void {
    walletProgress.clear();
    for (const input of inputs) {
      walletProgress.set(input.id, {
        label: input.label,
        state: 'queued',
        stage: 'Queued',
        message: 'Waiting for a scan slot',
        sections: new Map(),
      });
    }
    view.renderWalletProgress(walletProgress);
  }

  function finishWalletProgress(inputId: string, failed = false): void {
    const progress = walletProgress.get(inputId);
    if (progress === undefined) return;
    progress.state = failed ? 'failed' : 'complete';
    progress.stage = failed ? 'Stopped' : 'Complete';
    progress.message = failed
      ? 'This wallet did not produce a complete report'
      : 'All requested scan sections finished';
    if (!failed) (progress.sections as Map<RecoveryProgress['section'], string>).clear();
    view.renderWalletProgress(walletProgress);
  }

  function updateProgress(progress: RecoveryProgress): void {
    view.showProgress();
    const wallet = walletProgress.get(progress.inputId);
    if (wallet !== undefined) {
      wallet.state = 'running';
      wallet.stage = view.progressSectionLabel(progress.section);
      wallet.message = progress.message;
      (wallet.sections as Map<RecoveryProgress['section'], string>).set(progress.section, progress.message);
    }
    view.renderWalletProgress(walletProgress);
    view.setStatus(`${wallet?.label ?? progress.inputId}: ${progress.message}`);
  }

  function renderLiveFinding(inputId: string, section: RecoverySectionId, finding: RecoveryFinding): void {
    liveFindingCount += 1;
    view.renderLiveFinding(inputId, section, finding, liveFindingCount);
  }

  function stageValidatedExports(): void {
    validatedExports.clear();
    try {
      if (currentResults.length === 0) return;
      const date = new Date();
      for (const format of ['csv', 'json'] as const) {
        const file = dependencies.createRecoveryExport(currentResults, format, date);
        sessionSecretGuard.assertPublic(file.text, exportTripwireContext[format]);
        validatedExports.set(format, file);
      }
    } catch (cause) {
      validatedExports.clear();
      throw cause;
    } finally {
      sessionSecretGuard.clear();
    }
  }

  async function downloadExport(format: RecoveryExportFormat): Promise<void> {
    try {
      const file = validatedExports.get(format);
      if (file === undefined) throw new Error('Run and complete a fresh recovery scan before exporting.');
      const filename = await dependencies.requestRecoveryExport(file.text, format);
      view.setStatus(`Exported ${filename}. No recovery phrase or private/viewing/spending key is included.`);
    } catch (cause) {
      view.showError(dependencies.describeUnknownError(cause));
    }
  }

  function cancelScan(): void {
    currentAbort?.abort();
    view.cancelButton.disabled = true;
    view.setStatus('Cancellation requested. Waiting for the current network/proof operation to finish…');
  }

  function clearScanner(): void {
    currentAbort?.abort();
    runGeneration += 1;
    clearVisibleSecrets();
    sessionSecretGuard.clear();
    validatedExports.clear();
    currentResults = [];
    activeResultId = null;
    resultTabTouched = false;
    scanCompleted = false;
    liveFindingCount = 0;
    walletProgress.clear();
    view.resetResults();
    view.hideStatus();
    view.clearError();
    view.resetAddressSearch();
    setRunning(false);
  }

  function startAddressSearch(snapshot: RecoveryInputSnapshot): void {
    if (dependencies.addressSearchRunner === undefined)
      throw new Error('Local address search is unavailable in this profile.');
    dependencies.addressSearchRunner(snapshot, {
      inputMode,
      recoveryInputs,
      wipeInputObjects,
      sessionSecretGuard,
      view,
      resetState: () => {
        currentResults = [];
        validatedExports.clear();
        view.resetResults();
        view.resetAddressSearch();
      },
      prepareRun: () => {
        currentAbort = new AbortController();
        const controller = currentAbort;
        const generation = ++runGeneration;
        setRunning(true);
        return { controller, generation };
      },
      isCurrentRun: (generation) => generation === runGeneration,
      finishRun: (generation) => {
        if (generation !== runGeneration) return;
        currentAbort = null;
        setRunning(false);
      },
      describeUnknownError: dependencies.describeUnknownError,
    });
  }

  function startCandidateScan(snapshot: RecoveryInputSnapshot): void {
    if (dependencies.recoveryScanConfig === undefined) throw new Error('Seed discovery is not included in this build.');
    const config = dependencies.recoveryScanConfig(snapshot);
    const adapters = [...new Set(snapshot.candidateCoinIds ?? [])].map((id) => dependencies.getRecoveryCoin(id));
    if (adapters.length === 0) {
      wipeInputSnapshot(snapshot);
      throw new Error('Select at least one coin for candidate scanning.');
    }
    const phrases = snapshot.batchMnemonics.replaceAll('\r', '').split('\n');
    const passwords = snapshot.batchPassphrases.replaceAll('\r', '').split('\n');
    const inputs = phrases.flatMap((mnemonic, line) =>
      mnemonic.trim()
        ? [
            {
              id: `candidate-${line + 1}`,
              label: `Candidate · source line ${line + 1}`,
              mnemonic,
              passphrase: passwords[line] ?? '',
            },
          ]
        : [],
    );
    phrases.fill('');
    passwords.fill('');
    wipeInputSnapshot(snapshot);
    if (inputs.length === 0) throw new Error('Enter at least one candidate seed phrase.');
    sessionSecretGuard.clear();
    validatedExports.clear();
    if (snapshot.clearInputOnStart) clearVisibleSecrets();
    currentResults = [];
    activeResultId = null;
    resultTabTouched = false;
    scanCompleted = false;
    liveFindingCount = 0;
    renderResults();
    currentAbort = new AbortController();
    const runController = currentAbort;
    const networkLimiter = new dependencies.RecoveryConcurrencyLimiter(1);
    initializeWalletProgress(
      inputs.flatMap((input) =>
        adapters.map((adapter) => ({
          id: `${input.id}-${adapter.id}`,
          label: `${input.label} · ${adapter.label}`,
        })),
      ),
    );
    setRunning(true);
    view.showProgress();
    view.setStatus(
      `Checking ${inputs.length} candidates across ${adapters.length} selected coins, sequentially. Only configured coverage is checked.`,
    );
    void (async () => {
      try {
        const networkApi = await dependencies.recoveryNetworkApi();
        if (dependencies.scanCandidates === undefined)
          throw new Error('Seed candidate discovery is not included in this build.');
        await dependencies.scanCandidates(
          inputs,
          adapters,
          config,
          {
            signal: runController.signal,
            networkApi,
            networkLimiter,
            sessionSecretGuard,
            onProgress: updateProgress,
            onFinding: renderLiveFinding,
          },
          dependencies.assertValidMnemonic,
          (result) => {
            currentResults.push(result);
            if (result.coinId === 'input') {
              for (const adapter of adapters) finishWalletProgress(`${result.inputId}-${adapter.id}`, true);
            } else
              finishWalletProgress(
                result.inputId,
                result.sections.some((section) => section.state === 'failed' || section.state === 'partial'),
              );
            renderResults();
          },
        );
        scanCompleted =
          currentResults.length > 0 &&
          currentResults.every((result) =>
            result.sections.every((section) => section.state !== 'failed' && section.state !== 'partial'),
          );
        view.setStatus(
          'Candidate pass finished. Review each coin outcome; failed or skipped checks do not establish an empty wallet.',
        );
      } catch (cause) {
        view.setStatus(
          runController.signal.aborted
            ? 'Candidate scan stopped. Completed checks remain available; queued checks were not performed.'
            : 'Candidate scan could not finish. Remaining checks were not performed.',
        );
      } finally {
        for (const progress of walletProgress.values()) {
          if (progress.state === 'queued' || progress.state === 'running') {
            progress.state = 'failed';
            progress.stage = 'Not completed';
            progress.message = 'No conclusion about balance or activity';
          }
        }
        view.renderWalletProgress(walletProgress);
        wipeInputObjects(inputs);
        try {
          stageValidatedExports();
          renderResults();
        } catch {
          view.showError('Candidate reports failed the export safety check. Export is disabled.');
        }
        sessionSecretGuard.clear();
        currentAbort = null;
        setRunning(false);
      }
    })();
  }

  function startScan(): void {
    if (running) return;
    if (!selfTestPassed) {
      view.showError('Cryptographic startup self-test has not passed. Recovery scans remain disabled.');
      return;
    }
    view.clearError();
    let inputs: RecoverySeedInput[] = [];
    try {
      const snapshot = view.readInputs();
      if (snapshot.addressSearchEnabled === true && (snapshot.addressSearchTargets ?? '').trim().length > 0) {
        try {
          startAddressSearch(snapshot);
        } finally {
          wipeInputSnapshot(snapshot);
        }
        return;
      }
      if (snapshot.sourceMode === 'public') {
        startWatchOnlyScan(snapshot);
        return;
      }
      if (inputMode === 'batch' && snapshot.automaticCandidates) {
        try {
          startCandidateScan(snapshot);
        } finally {
          wipeInputSnapshot(snapshot);
        }
        return;
      }
      try {
        inputs = recoveryInputs(snapshot);
      } finally {
        // The controller retains only the individually wipeable input objects;
        // the raw form snapshot must not survive into the asynchronous scan.
        wipeInputSnapshot(snapshot);
      }
      if (dependencies.recoveryScanConfig === undefined)
        throw new Error('Seed discovery is not included in this build.');
      const config = dependencies.recoveryScanConfig(snapshot);
      if (config.scanCustomPath && dependencies.customScanPaths === undefined)
        throw new Error('Custom paths are not included in this build.');
      dependencies.customScanPaths?.(config); // Validate both endpoints before starting scan queries.
      const seedConcurrency =
        inputMode === 'single' ? 1 : parseConcurrency(snapshot.batchConcurrency, 'Batch seed concurrency');
      const requestConcurrency = parseConcurrency(snapshot.requestConcurrency, 'Network concurrency');
      const adapter = dependencies.getRecoveryCoin(snapshot.coinId);
      if (!adapter.networks.includes(config.network))
        throw new Error(`${adapter.label} does not support ${config.network}.`);
      sessionSecretGuard.clear();
      validatedExports.clear();
      if (snapshot.clearInputOnStart) clearVisibleSecrets();
      currentResults = [];
      activeResultId = null;
      resultTabTouched = false;
      scanCompleted = false;
      liveFindingCount = 0;
      renderResults();
      currentAbort = new AbortController();
      const runController = currentAbort;
      const networkLimiter = new dependencies.RecoveryConcurrencyLimiter(requestConcurrency);
      setRunning(true);
      view.showProgress();
      initializeWalletProgress(inputs);
      const run = async (): Promise<void> => {
        let exportStagingAttempted = false;
        try {
          const networkApi = await dependencies.recoveryNetworkApi();
          const orderedResults: Array<RecoveryWalletResult | undefined> = new Array(inputs.length);
          const preparedSections =
            inputs.length > 1 && config.scanShieldedPool && adapter.prepareBatch !== undefined
              ? adapter.prepareBatch(inputs, config, {
                  signal: runController.signal,
                  networkApi,
                  networkLimiter,
                  sessionSecretGuard,
                  onProgress: updateProgress,
                  onFinding: renderLiveFinding,
                })
              : undefined;
          view.setStatus(
            `Scanning ${inputs.length} seed phrase${inputs.length === 1 ? '' : 's'} · up to ${seedConcurrency} seed scan${seedConcurrency === 1 ? '' : 's'} and ${requestConcurrency} network request${requestConcurrency === 1 ? '' : 's'} at once…`,
          );
          await dependencies.mapRecoveryTasks(inputs, seedConcurrency, async (input, index) => {
            try {
              const result = await adapter.scan(input, config, {
                signal: runController.signal,
                networkApi,
                networkLimiter,
                sessionSecretGuard,
                ...(preparedSections === undefined ? {} : { preparedSections }),
                onProgress: updateProgress,
                onFinding: renderLiveFinding,
              });
              await enrichRecoveryHistory(adapter, result, {
                signal: runController.signal,
                networkApi,
                networkLimiter,
                sessionSecretGuard,
                onProgress: updateProgress,
                onFinding: renderLiveFinding,
              });
              orderedResults[index] = result;
              currentResults = orderedResults.filter(
                (candidate): candidate is RecoveryWalletResult => candidate !== undefined,
              );
              renderResults();
              const incomplete = result.sections.some(({ state }) => state === 'failed' || state === 'partial');
              if (incomplete)
                result.warnings.push('Scan incomplete: some sections were not fully checked; see section warnings.');
              finishWalletProgress(input.id, incomplete);
              return result;
            } catch (cause) {
              finishWalletProgress(input.id, true);
              runController.abort();
              throw cause;
            } finally {
              input.mnemonic = '';
              input.passphrase = '';
            }
          });
          view.renderWalletProgress(walletProgress);
          exportStagingAttempted = true;
          stageValidatedExports();
          renderResults();
          scanCompleted = currentResults.every((result) =>
            result.sections.every(({ state }) => state !== 'failed' && state !== 'partial'),
          );
          view.setStatus(
            scanCompleted
              ? 'Recovery scan complete. Review and export the standard-wallet handoff report.'
              : 'Recovery scan incomplete. Available reports remain exportable; review section warnings and unknown balances.',
          );
        } catch (cause) {
          for (const progress of walletProgress.values()) {
            if (progress.state === 'complete' || progress.state === 'failed') continue;
            progress.state = 'failed';
            progress.stage = 'Stopped';
            progress.message = 'This wallet did not produce a complete report';
          }
          view.renderWalletProgress(walletProgress);
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            view.setStatus(
              'Scan cancelled between bounded operations. Completed wallet reports remain exportable; the active wallet is incomplete and was not added.',
            );
          } else {
            view.showError(dependencies.describeUnknownError(cause));
          }
          if (currentResults.length > 0 && !exportStagingAttempted) {
            try {
              stageValidatedExports();
              renderResults();
            } catch (exportCause) {
              view.showError(
                `Completed reports could not pass the export tripwire: ${dependencies.describeUnknownError(exportCause)}`,
              );
            }
          }
        } finally {
          wipeInputObjects(inputs);
          sessionSecretGuard.clear();
          currentAbort = null;
          setRunning(false);
        }
      };
      void run();
    } catch (cause) {
      wipeInputObjects(inputs);
      sessionSecretGuard.clear();
      view.showError(dependencies.describeUnknownError(cause));
    }
  }

  function startWatchOnlyScan(snapshot: RecoveryInputSnapshot): void {
    view.clearError();
    let targets: WatchOnlyTarget[] = [];
    try {
      try {
        if (dependencies.resolveWatchOnlyScanTargets === undefined)
          throw new Error('Watch-only discovery is not included in this build.');
        targets = dependencies.resolveWatchOnlyScanTargets(snapshot, dependencies);
      } finally {
        // The raw pasted field must not survive into the asynchronous scan;
        // the resolved public material already lives in `targets`.
        wipeInputSnapshot(snapshot);
      }
      if (dependencies.watchOnlyScanConfig === undefined)
        throw new Error('Watch-only discovery is not included in this build.');
      const config = dependencies.watchOnlyScanConfig(snapshot, dependencies);
      const requestConcurrency = parseConcurrency(snapshot.requestConcurrency, 'Network concurrency');
      for (const { adapter, network } of targets) {
        if (!adapter.networks.includes(network ?? config.network))
          throw new Error(`${adapter.label} does not support ${config.network}.`);
      }
      sessionSecretGuard.clear();
      validatedExports.clear();
      if (snapshot.clearInputOnStart) clearVisibleSecrets();
      currentResults = [];
      activeResultId = null;
      resultTabTouched = false;
      scanCompleted = false;
      liveFindingCount = 0;
      renderResults();
      currentAbort = new AbortController();
      const runController = currentAbort;
      const networkLimiter = new dependencies.RecoveryConcurrencyLimiter(requestConcurrency);
      setRunning(true);
      view.showProgress();
      initializeWalletProgress(targets.map(({ input }) => input));
      const run = async (): Promise<void> => {
        let exportStagingAttempted = false;
        try {
          const networkApi = await dependencies.recoveryNetworkApi();
          const orderedResults: Array<RecoveryWalletResult | undefined> = new Array(targets.length);
          view.setStatus(
            `Scanning ${targets.length} watch-only key${targets.length === 1 ? '' : 's'} · up to ${requestConcurrency} at once…`,
          );
          const failures: string[] = [];
          await dependencies.mapRecoveryTasks(targets, requestConcurrency, async (target, index) => {
            try {
              if (target.adapter.scanWatchOnly === undefined) {
                throw new Error(`${target.adapter.label} does not support watch-only scanning in this build.`);
              }
              const result = await target.adapter.scanWatchOnly(
                target.input,
                { ...config, network: target.network ?? config.network },
                {
                  signal: runController.signal,
                  networkApi,
                  networkLimiter,
                  sessionSecretGuard,
                  onProgress: updateProgress,
                  onFinding: renderLiveFinding,
                },
              );
              await enrichRecoveryHistory(target.adapter, result, {
                signal: runController.signal,
                networkApi,
                networkLimiter,
                sessionSecretGuard,
                onProgress: updateProgress,
                onFinding: renderLiveFinding,
              });
              if (target.ambiguous)
                result.warnings.unshift(
                  'This key has no unique coin identifier. This report checks one candidate coin; an empty result does not establish which coin created the key.',
                );
              orderedResults[index] = result;
              currentResults = orderedResults.filter(
                (candidate): candidate is RecoveryWalletResult => candidate !== undefined,
              );
              renderResults();
              const incomplete = result.sections.some(({ state }) => state === 'failed' || state === 'partial');
              if (incomplete)
                failures.push(`${target.adapter.label}: some sections were not fully checked; see the report.`);
              finishWalletProgress(target.input.id, incomplete);
              return result;
            } catch (cause) {
              finishWalletProgress(target.input.id, true);
              if (runController.signal.aborted) throw cause;
              failures.push(`${target.adapter.label}: ${dependencies.describeUnknownError(cause)}`);
              return undefined;
            } finally {
              target.input.value = '';
            }
          });
          view.renderWalletProgress(walletProgress);
          for (const report of currentResults) {
            for (const failure of failures) report.warnings.push(`Scan incomplete: ${failure}`);
          }
          exportStagingAttempted = true;
          stageValidatedExports();
          renderResults();
          if (runController.signal.aborted) throw new DOMException('Public-key scan cancelled.', 'AbortError');
          view.setStatus(
            failures.length === 0
              ? 'Public-key scan complete. Review the results by coin and export the public report.'
              : `Public-key scan incomplete: ${currentResults.length} reports available, ${failures.length} coin scans incomplete. Completed reports remain exportable.`,
          );
          if (failures.length > 0) view.showError(failures.join('\n'));
          scanCompleted = failures.length === 0;
        } catch (cause) {
          for (const progress of walletProgress.values()) {
            if (progress.state === 'complete' || progress.state === 'failed') continue;
            progress.state = 'failed';
            progress.stage = 'Stopped';
            progress.message = 'This watch-only key did not produce a complete report';
          }
          view.renderWalletProgress(walletProgress);
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            view.setStatus(
              'Scan cancelled between bounded operations. Completed reports remain exportable; the active key is incomplete and was not added.',
            );
          } else {
            view.showError(dependencies.describeUnknownError(cause));
          }
          if (currentResults.length > 0 && !exportStagingAttempted) {
            try {
              stageValidatedExports();
              renderResults();
            } catch (exportCause) {
              view.showError(
                `Completed reports could not pass the export tripwire: ${dependencies.describeUnknownError(exportCause)}`,
              );
            }
          }
        } finally {
          dependencies.wipeWatchOnlyTargets?.(targets);
          sessionSecretGuard.clear();
          currentAbort = null;
          setRunning(false);
        }
      };
      void run();
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'PrivateMaterialError') clearVisibleSecrets();
      dependencies.wipeWatchOnlyTargets?.(targets);
      sessionSecretGuard.clear();
      view.showError(dependencies.describeUnknownError(cause));
    }
  }

  async function initializeRuntime(): Promise<void> {
    try {
      const [report] = await Promise.all([
        dependencies.runRecoverySelfTest(),
        dependencies.recoveryNetworkApi().then(async (networkApi) => {
          const identity = await networkApi.ping();
          if (identity !== 'isolated-network-worker-v1') {
            throw new Error('Recovery Network Worker returned an unexpected identity.');
          }
          return identity;
        }),
      ]);
      selfTestPassed = true;
      const checks = [...report.checks, 'Isolated Network Worker RPC boundary'];
      view.showSelfTestPassed(checks, report.durationMs);
      setRunning(false);
    } catch (cause) {
      selfTestPassed = false;
      view.showSelfTestFailed(cause instanceof Error ? cause.message : String(cause));
      setRunning(false);
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      view.startButton.addEventListener('click', startScan);
      for (const button of view.modeButtons) {
        button.addEventListener('click', () => setMode(button.dataset.inputMode === 'batch' ? 'batch' : 'single'));
      }
      view.revealButton.addEventListener('click', () => setRevealed(!revealed));
      view.cancelButton.addEventListener('click', cancelScan);
      view.clearButton.addEventListener('click', clearScanner);
      view.exportCsvButton.addEventListener('click', () => {
        void downloadExport('csv');
      });
      view.exportJsonButton.addEventListener('click', () => {
        void downloadExport('json');
      });
      for (const input of view.estimateInputs) {
        input.addEventListener('input', view.updateEstimate);
        input.addEventListener('change', view.updateEstimate);
      }
      window.addEventListener('pagehide', () => sessionSecretGuard.clear());
      view.populateCoins(dependencies.listRecoveryCoins());
      view.setBuildInfo();
      view.resetResults();
      setMode('single');
      view.updateEstimate();
      setRunning(false);
      void initializeRuntime();
    },
  };
}
