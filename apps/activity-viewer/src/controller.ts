import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ViewingKeyInputMode } from '@ckd/dash-network/viewing-key.js';
import { runDashCoreActivity } from './dash-core-activity.js';
import { runDashPlatformActivity } from './dash-platform-activity.js';
import { runDashIdentityActivity } from './dash-identity-activity.js';
import { runDashOrchardActivity } from './dash-orchard-activity.js';
import { createActivityBatchController } from './batch-controller.js';
import { createViewerExportController } from './export-controller.js';
import type { ViewerExportState } from './export.js';
import type { ActivityViewerView, ViewerDetectionMode, ViewerMode, ViewerQueryMode } from './view.js';

import type { ActivityViewerDependencies } from './dependencies.js';
export function createActivityViewerController(view: ActivityViewerView, dependencies: ActivityViewerDependencies) {
  let started = false;
  let cancellationRequested = false;
  let resetRevision = 0;
  let running = false;
  let viewerMode: ViewerMode = 'core';
  let queryMode: ViewerQueryMode = 'single';
  let detectionMode: ViewerDetectionMode = 'auto';
  let currentAbort: AbortController | null = null;
  let currentExport: ViewerExportState | null = null;
  let viewerSelfTestPassed = false;

  function checkCancellation(): void {
    if (cancellationRequested) throw new DOMException('Viewer query cancelled.', 'AbortError');
  }

  function setRunning(value: boolean): void {
    running = value;
    view.setRunning(value, viewerSelfTestPassed, viewerMode);
  }

  function setExportState(state: ViewerExportState | null): void {
    currentExport = state;
    view.setExportAvailable(state !== null);
  }

  /**
   * requestAnimationFrame stops firing in a background tab, which would stall a
   * full-pool scan when the user switches away to wait.
   */
  async function yieldToBrowser(): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  const batchController = createActivityBatchController(view, dependencies, {
    isCancellationRequested: () => cancellationRequested,
    checkCancellation,
    setExportState,
    yieldToBrowser,
  });

  async function runShielded(
    network: ViewerNetwork,
    value = view.viewingKeyInput.value,
    inputMode = view.keyCapabilityInput.value as ViewingKeyInputMode,
  ): Promise<void> {
    await runDashOrchardActivity(
      {
        view,
        ShieldedActivityLedger: dependencies.ShieldedActivityLedger,
        Source: dependencies.DashEvoShieldedSource,
        assertCanonicalViewingKey: dependencies.assertCanonicalViewingKey,
        normalizeViewingKey: dependencies.normalizeViewingKey,
        runPageStream: dependencies.runShieldedPageStream,
        scanEncryptedPage: dependencies.scanEncryptedPage,
        emptyConfirmations: dependencies.shieldedEmptyConfirmations,
        maxPagesPerScan: dependencies.shieldedMaxPagesPerScan,
        pageSize: dependencies.shieldedPageSize,
        cancelled: () => cancellationRequested,
        checkCancellation,
        setExportState,
        yieldTurn: yieldToBrowser,
      },
      network,
      value,
      inputMode,
    );
  }

  async function runCore(network: ViewerNetwork, value = view.viewingKeyInput.value): Promise<void> {
    currentAbort = new AbortController();
    const state = await runDashCoreActivity(
      {
        view,
        assertPublicLookupInput: dependencies.assertPublicLookupInput,
        queryCoreAddress: dependencies.queryCoreAddress,
        cancelled: () => cancellationRequested,
      },
      network,
      value,
      currentAbort.signal,
    );
    if (!cancellationRequested) setExportState(state);
  }

  async function runPlatform(network: ViewerNetwork, value = view.viewingKeyInput.value): Promise<void> {
    currentAbort = new AbortController();
    const state = await runDashPlatformActivity(
      {
        view,
        AddressSource: dependencies.DashPlatformAddressSource,
        assertPublicLookupInput: dependencies.assertPublicLookupInput,
        queryHistory: dependencies.queryPlatformAddressHistory,
        checkCancellation,
      },
      network,
      value,
      currentAbort.signal,
    );
    setExportState(state);
  }

  async function runIdentity(network: ViewerNetwork, value = view.viewingKeyInput.value): Promise<void> {
    currentAbort = new AbortController();
    const state = await runDashIdentityActivity(
      {
        view,
        IdentitySource: dependencies.DashPlatformIdentitySource,
        normalizeInput: dependencies.normalizeIdentityLookupInput,
        queryHistory: dependencies.queryPlatformIdentityHistory,
        checkCancellation,
      },
      network,
      value,
      currentAbort.signal,
    );
    setExportState(state);
  }

  async function runAutoSingle(network: ViewerNetwork): Promise<void> {
    const detected = dependencies.detectViewerInput(view.viewingKeyInput.value, network);
    view.setDiagnosticMode(detected.mode, network);
    if (detected.mode === 'shielded') {
      await runShielded(network, detected.value, detected.viewingKeyMode);
    } else if (detected.mode === 'core') {
      await runCore(network, detected.value);
    } else if (detected.mode === 'platform') {
      await runPlatform(network, detected.value);
    } else {
      await runIdentity(network, detected.value);
    }
  }

  async function submitQuery(): Promise<void> {
    if (running) return;
    if (!viewerSelfTestPassed) {
      view.showError('Cryptographic startup self-test has not passed. Queries remain disabled.');
      return;
    }
    const submittedRevision = resetRevision;
    view.clearMessages();
    view.clearResults();
    setExportState(null);
    cancellationRequested = false;
    currentAbort = null;
    setRunning(true);
    const network = view.networkInput.value as ViewerNetwork;
    view.startDiagnostics(
      viewerMode,
      network,
      viewerMode === 'core'
        ? 'DashScan Core API · synchronization checked'
        : viewerMode === 'platform'
          ? 'Dash Platform DAPI proof + Platform Explorer history'
          : viewerMode === 'identity'
            ? 'Dash Platform Identity proof + Platform Explorer history'
            : 'Dash Platform DAPI · trusted quorum discovery',
    );
    try {
      if (queryMode === 'batch' && detectionMode === 'auto') await batchController.runAutoBatch(network);
      else if (queryMode === 'batch') await batchController.runBatch(network, viewerMode);
      else if (detectionMode === 'auto') await runAutoSingle(network);
      else if (viewerMode === 'shielded') await runShielded(network);
      else if (viewerMode === 'core') await runCore(network);
      else if (viewerMode === 'platform') await runPlatform(network);
      else await runIdentity(network);
    } catch (cause) {
      if (submittedRevision !== resetRevision) return;
      if (cancellationRequested) {
        view.setStatus('Query cancelled.');
        view.failDiagnostics('Cancelled by the user. No additional results were applied.');
      } else {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (cause instanceof Error && cause.name === 'PrivateMaterialError') view.clearQueryInput();
        view.showError(message);
        view.setStatus('');
        view.failDiagnostics(`Stopped during the current stage. Error: ${message}`);
      }
    } finally {
      currentAbort = null;
      setRunning(false);
    }
  }

  function cancelQuery(): void {
    cancellationRequested = true;
    currentAbort?.abort();
    batchController.abort();
    view.showCancellationRequested(viewerMode);
  }

  function resetViewer(): void {
    resetRevision++;
    cancellationRequested = true;
    currentAbort?.abort();
    setExportState(null);
    batchController.reset();
    view.resetViewer(viewerMode);
  }

  function setViewerMode(mode: ViewerMode): void {
    if (running || mode === viewerMode) return;
    detectionMode = 'advanced';
    viewerMode = mode;
    view.setDetectionMode(detectionMode, viewerMode);
    view.setViewerMode(mode);
    resetViewer();
    setRunning(false);
  }

  function setQueryMode(mode: ViewerQueryMode): void {
    if (running || mode === queryMode) return;
    queryMode = mode;
    view.setQueryMode(mode, viewerMode);
    resetViewer();
    setRunning(false);
  }

  function setDetectionMode(mode: ViewerDetectionMode): void {
    if (running || mode === detectionMode) return;
    detectionMode = mode;
    view.setDetectionMode(mode, viewerMode);
    resetViewer();
    setRunning(false);
  }

  async function initializeViewerRuntime(): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const blobWorkerDurationMs = await dependencies.runBlobWorkerSelfTest();
      const report = dependencies.runOrchardRuntimeSelfTest();
      viewerSelfTestPassed = report.passed;
      view.showSelfTestPassed(report.checks, blobWorkerDurationMs);
      setRunning(false);
    } catch (cause) {
      viewerSelfTestPassed = false;
      view.showSelfTestFailed(cause instanceof Error ? cause.message : String(cause));
      setRunning(false);
      view.showError('Cryptographic startup self-test failed. This build will not query or scan wallet activity.');
    }
  }

  const exportController = createViewerExportController({
    view,
    state: () => currentExport,
    createTextExport: dependencies.createViewerExport,
    createWorkbookExport: dependencies.createViewerWorkbookExport,
    downloadBlob: dependencies.downloadBlob,
    downloadText: dependencies.downloadText,
  });

  return {
    start(): void {
      if (started) return;
      started = true;
      exportController.install();
      view.form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submitQuery();
      });
      view.cancelButton.addEventListener('click', cancelQuery);
      view.clearButton.addEventListener('click', resetViewer);
      view.revealButton.addEventListener('click', () => view.toggleViewingKeyReveal(viewerMode));
      view.revealBatchButton.addEventListener('click', () => view.toggleViewingKeyReveal(viewerMode));
      for (const button of view.modeButtons) {
        button.addEventListener('click', () => setViewerMode(button.dataset.viewerMode as ViewerMode));
      }
      for (const button of view.queryModeButtons) {
        button.addEventListener('click', () => setQueryMode(button.dataset.queryMode as ViewerQueryMode));
      }
      for (const button of view.detectionModeButtons) {
        button.addEventListener('click', () => setDetectionMode(button.dataset.detectionMode as ViewerDetectionMode));
      }
      view.viewingKeyInput.addEventListener('input', () => view.updateInputMode(viewerMode));
      view.batchInput.addEventListener('input', () => view.updateInputMode(viewerMode));
      view.keyCapabilityInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.networkInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.setDetectionMode(detectionMode, viewerMode);
      view.setQueryMode(queryMode, viewerMode);
      view.updateInputMode(viewerMode);
      setRunning(false);
      void initializeViewerRuntime();
    },
  };
}
