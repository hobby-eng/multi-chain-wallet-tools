import type { RecoveryExportFile, RecoveryExportFormat } from './export.js';
import type { RecoveryCoinRegistry } from './coins/registry.js';
import type { RecoverySelfTestReport } from './recovery-self-test.js';
import type { DiscoveryScannerView, RecoveryInputSnapshot, WalletProgressView } from './view.js';
import type {
  RecoveryFinding,
  RecoveryInputMode,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoverySectionId,
  RecoverySeedInput,
  RecoveryWalletResult,
} from './types.js';

interface DiscoveryScannerDependencies {
  RecoveryConcurrencyLimiter: typeof import('./concurrency.js').RecoveryConcurrencyLimiter;
  SecretEgressGuard: typeof import('./secret-guard.js').SecretEgressGuard;
  assertValidMnemonic: typeof import('@ckd/core/bip39.js').assertValidMnemonic;
  createRecoveryExport: typeof import('./export.js').createRecoveryExport;
  describeUnknownError: typeof import('./error-message.js').describeUnknownError;
  getRecoveryCoin: RecoveryCoinRegistry['getRecoveryCoin'];
  listRecoveryCoins: RecoveryCoinRegistry['listRecoveryCoins'];
  mapRecoveryTasks: typeof import('./concurrency.js').mapRecoveryTasks;
  recoveryNetworkApi: typeof import('./network-client.js').recoveryNetworkApi;
  requestRecoveryExport: typeof import('./download-client.js').requestRecoveryExport;
  runRecoverySelfTest: () => Promise<RecoverySelfTestReport>;
}

const exportTripwireContext: Record<RecoveryExportFormat, string> = {
  csv: 'recovery CSV report export',
  json: 'recovery JSON report export',
};

function parseInteger(value: string, label: string, minimum: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  }
  return number;
}

function parseConcurrency(value: string, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 5) {
    throw new Error(`${label} must be an integer from 1 to 5.`);
  }
  return number;
}

function scanConfig(snapshot: RecoveryInputSnapshot): RecoveryScanConfig {
  return {
    network: snapshot.network === 'testnet' ? 'testnet' : 'mainnet',
    account: parseInteger(snapshot.account, 'Account', 0),
    scanCore: snapshot.scanCore,
    coreReceiveCount: parseInteger(snapshot.coreReceiveCount, 'Core receive count', 0),
    coreChangeCount: parseInteger(snapshot.coreChangeCount, 'Core change count', 0),
    scanPlatformAddresses: snapshot.scanPlatformAddresses,
    platformAddressCount: parseInteger(snapshot.platformAddressCount, 'Platform address count', 0),
    scanPlatformIdentities: snapshot.scanPlatformIdentities,
    identityStartIndex: parseInteger(snapshot.identityStartIndex, 'Identity start index', 0),
    identityGapLimit: parseInteger(snapshot.identityGapLimit, 'Identity gap limit', 1),
    identityScanLimit: parseInteger(snapshot.identityScanLimit, 'Identity scan limit', 1),
    includeUsedZeroBalance: snapshot.includeUsedZeroBalance,
    scanShieldedPool: snapshot.scanShieldedPool,
  };
}

export function createDiscoveryScannerController(
  view: DiscoveryScannerView,
  dependencies: DiscoveryScannerDependencies,
) {
  let started = false;
  let inputMode: RecoveryInputMode = 'single';
  let revealed = false;
  let running = false;
  let currentAbort: AbortController | null = null;
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
    setRevealed(false);
  }

  function clearVisibleSecrets(): void {
    view.clearVisibleSecrets();
    setRevealed(false);
  }

  function recoveryInputs(snapshot: RecoveryInputSnapshot): RecoverySeedInput[] {
    if (inputMode === 'single') {
      return [{
        id: 'seed-1',
        label: 'Seed phrase #1',
        mnemonic: dependencies.assertValidMnemonic(snapshot.singleMnemonic),
        passphrase: snapshot.singlePassphrase,
      }];
    }
    const mnemonicLines = snapshot.batchMnemonics.replaceAll('\r', '').split('\n');
    const passphraseLines = snapshot.batchPassphrases.replaceAll('\r', '').split('\n');
    const inputs: RecoverySeedInput[] = [];
    mnemonicLines.forEach((mnemonic, lineIndex) => {
      if (mnemonic.trim().length === 0) return;
      const number = inputs.length + 1;
      inputs.push({
        id: `seed-${number}`,
        label: `Seed phrase #${number} · source line ${lineIndex + 1}`,
        mnemonic: dependencies.assertValidMnemonic(mnemonic),
        passphrase: passphraseLines[lineIndex] ?? '',
      });
    });
    if (inputs.length === 0) throw new Error('Enter at least one BIP39 seed phrase in batch mode.');
    return inputs;
  }

  function wipeInputObjects(inputs: RecoverySeedInput[]): void {
    for (const input of inputs) {
      input.mnemonic = '';
      input.passphrase = '';
    }
  }

  function wipeInputSnapshot(snapshot: RecoveryInputSnapshot): void {
    snapshot.singleMnemonic = '';
    snapshot.singlePassphrase = '';
    snapshot.batchMnemonics = '';
    snapshot.batchPassphrases = '';
  }

  function renderResults(): void {
    if (!resultTabTouched || !currentResults.some(({ inputId }) => inputId === activeResultId)) {
      activeResultId = currentResults[0]?.inputId ?? null;
    }
    view.renderResults(
      currentResults,
      activeResultId,
      new Set(validatedExports.keys()),
      (inputId) => {
        activeResultId = inputId;
        resultTabTouched = true;
        renderResults();
      },
    );
  }

  function initializeWalletProgress(inputs: RecoverySeedInput[]): void {
    walletProgress.clear();
    for (const input of inputs) {
      walletProgress.set(input.id, {
        label: input.label,
        state: 'queued',
        stage: 'Queued',
        message: 'Waiting for a seed-scan slot',
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
    progress.message = failed ? 'This wallet did not produce a complete report' : 'All selected Dash recovery sections finished';
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
    setRunning(false);
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
      try {
        inputs = recoveryInputs(snapshot);
      } finally {
        // The controller retains only the individually wipeable input objects;
        // the raw form snapshot must not survive into the asynchronous scan.
        wipeInputSnapshot(snapshot);
      }
      const config = scanConfig(snapshot);
      const seedConcurrency = inputMode === 'single' ? 1 : parseConcurrency(snapshot.batchConcurrency, 'Batch seed concurrency');
      const requestConcurrency = parseConcurrency(snapshot.requestConcurrency, 'Network concurrency');
      const adapter = dependencies.getRecoveryCoin(snapshot.coinId);
      if (!adapter.networks.includes(config.network)) throw new Error(`${adapter.label} does not support ${config.network}.`);
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
          const preparedSections = inputs.length > 1 && config.scanShieldedPool && adapter.prepareBatch !== undefined
            ? adapter.prepareBatch(inputs, config, {
                signal: runController.signal,
                networkApi,
                networkLimiter,
                sessionSecretGuard,
                onProgress: updateProgress,
                onFinding: renderLiveFinding,
              })
            : undefined;
          view.setStatus(`Scanning ${inputs.length} seed phrase${inputs.length === 1 ? '' : 's'} · up to ${seedConcurrency} seed scan${seedConcurrency === 1 ? '' : 's'} and ${requestConcurrency} network request${requestConcurrency === 1 ? '' : 's'} at once…`);
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
              orderedResults[index] = result;
              currentResults = orderedResults.filter((candidate): candidate is RecoveryWalletResult => candidate !== undefined);
              renderResults();
              finishWalletProgress(input.id);
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
          view.setStatus('Recovery scan complete. Review and export the standard-wallet handoff report.');
          scanCompleted = true;
        } catch (cause) {
          for (const progress of walletProgress.values()) {
            if (progress.state === 'complete' || progress.state === 'failed') continue;
            progress.state = 'failed';
            progress.stage = 'Stopped';
            progress.message = 'This wallet did not produce a complete report';
          }
          view.renderWalletProgress(walletProgress);
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            view.setStatus('Scan cancelled between bounded operations. Completed wallet reports remain exportable; the active wallet is incomplete and was not added.');
          } else {
            view.showError(dependencies.describeUnknownError(cause));
          }
          if (currentResults.length > 0 && !exportStagingAttempted) {
            try {
              stageValidatedExports();
              renderResults();
            } catch (exportCause) {
              view.showError(`Completed reports could not pass the export tripwire: ${dependencies.describeUnknownError(exportCause)}`);
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
      view.exportCsvButton.addEventListener('click', () => { void downloadExport('csv'); });
      view.exportJsonButton.addEventListener('click', () => { void downloadExport('json'); });
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
