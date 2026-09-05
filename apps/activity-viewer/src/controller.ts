import type { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { NormalizedViewingKey, ViewingKeyInputMode } from '@ckd/dash-network/viewing-key.js';
import type { ViewerExportFormat, ViewerExportState } from './export.js';
import type { ActivityViewerView, ViewerMode } from './view.js';

const SHIELDED_PAINT_INTERVAL_MS = 500;

interface ActivityViewerDependencies {
  ShieldedActivityLedger: typeof import('@ckd/dash-network/activity.js').ShieldedActivityLedger;
  DashEvoShieldedSource: typeof import('@ckd/dash-network/dash-source.js').DashEvoShieldedSource;
  DashPlatformAddressSource: typeof import('@ckd/dash-network/platform-address-source.js').DashPlatformAddressSource;
  DashPlatformIdentitySource: typeof import('@ckd/dash-network/platform-identity-source.js').DashPlatformIdentitySource;
  assertCanonicalViewingKey: typeof import('@ckd/dash-network/orchard-scanner.js').assertCanonicalViewingKey;
  assertPublicLookupInput: typeof import('@ckd/dash-network/private-material.js').assertPublicLookupInput;
  createViewerExport: typeof import('./export.js').createViewerExport;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
  normalizeViewingKey: typeof import('@ckd/dash-network/viewing-key.js').normalizeViewingKey;
  normalizeIdentityLookupInput: typeof import('@ckd/dash-network/platform-identity-source.js').normalizeIdentityLookupInput;
  queryCoreAddress: typeof import('@ckd/dash-network/public-address.js').queryCoreAddress;
  queryPlatformAddressHistory: typeof import('@ckd/dash-network/platform-address-history.js').queryPlatformAddressHistory;
  queryPlatformIdentityHistory: typeof import('@ckd/dash-network/platform-identity-history.js').queryPlatformIdentityHistory;
  runBlobWorkerSelfTest: typeof import('@ckd/dash-network/blob-worker-self-test.js').runBlobWorkerSelfTest;
  runOrchardRuntimeSelfTest: typeof import('@ckd/dash-network/orchard-scanner.js').runOrchardRuntimeSelfTest;
  runShieldedPageStream: typeof import('@ckd/dash-network/shielded-stream-policy.js').runShieldedPageStream;
  scanEncryptedPage: typeof import('@ckd/dash-network/orchard-scanner.js').scanEncryptedPage;
  shieldedEmptyConfirmations: number;
  shieldedMaxPagesPerScan: number;
  shieldedPageSize: number;
}

export function createActivityViewerController(
  view: ActivityViewerView,
  dependencies: ActivityViewerDependencies,
) {
  let started = false;
  let cancellationRequested = false;
  let running = false;
  let viewerMode: ViewerMode = 'core';
  let currentAbort: AbortController | null = null;
  let currentExport: ViewerExportState | null = null;
  let viewerSelfTestPassed = false;
  let lastShieldedPaintAt = 0;

  function setRunning(value: boolean): void {
    running = value;
    view.setRunning(value, viewerSelfTestPassed, viewerMode);
  }

  function setExportState(state: ViewerExportState | null): void {
    currentExport = state;
    view.setExportAvailable(state !== null);
  }

  function downloadExport(format: ViewerExportFormat): void {
    if (currentExport === null) {
      view.showError('Run a query before exporting data.');
      return;
    }
    const file = dependencies.createViewerExport(currentExport, format);
    dependencies.downloadText(file.text, file.filename, file.mimeType);
    view.setStatus(`Exported ${file.filename}. No private or viewing-key input is included.`);
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

  function renderShieldedProgress(
    ledger: ShieldedActivityLedger,
    complete: boolean,
    network: ViewerNetwork,
    force: boolean,
  ): void {
    const now = performance.now();
    if (!force && now - lastShieldedPaintAt < SHIELDED_PAINT_INTERVAL_MS) return;
    lastShieldedPaintAt = now;
    const snapshot = ledger.snapshot(complete);
    setExportState({ mode: 'shielded', network, snapshot });
    view.renderShielded(snapshot);
  }

  async function runShielded(network: ViewerNetwork): Promise<void> {
    const viewingKey: NormalizedViewingKey = dependencies.normalizeViewingKey(
      view.viewingKeyInput.value,
      view.keyCapabilityInput.value as ViewingKeyInputMode,
    );
    try {
      if (viewingKey.bundleNetwork !== undefined && viewingKey.bundleNetwork !== network) {
        throw new Error(`This viewing bundle is for ${viewingKey.bundleNetwork}; select that network before scanning.`);
      }
      dependencies.assertCanonicalViewingKey(viewingKey);
      view.setDiagnosticDetail(`Validated canonical ${viewingKey.kind} viewing capability locally.`);
      const ledger = new dependencies.ShieldedActivityLedger(viewingKey.kind);
      lastShieldedPaintAt = 0;
      const source = new dependencies.DashEvoShieldedSource(network);
      view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
      const connectStarted = performance.now();
      await source.connect();
      view.addRemoteDuration(performance.now() - connectStarted);
      view.setDiagnosticDetail('Connected through trusted quorum discovery. Fetching proof-verified encrypted notes.');
      const outcome = await dependencies.runShieldedPageStream({
        fetchPage: async (position) => {
          view.setStatus(`Fetching and verifying pool actions from aligned position ${position}…`);
          const fetchStarted = performance.now();
          const page = await source.fetchPage(position, dependencies.shieldedPageSize);
          view.addRemoteDuration(performance.now() - fetchStarted);
          view.recordRequest();
          return page;
        },
        noteCount: (page) => page.notes.length,
        onPage: (page, visit) => {
          view.setDiagnosticProof(`${page.proofHeight} · protocol ${page.protocolVersion}`);
          view.setDiagnosticRemoteTime(page.timeMs);
          if (page.notes.length > 0) {
            const scanStarted = performance.now();
            const matches = dependencies.scanEncryptedPage(viewingKey, visit.position, page.notes, network);
            ledger.applyPage(visit.position, page, matches);
            view.addLocalDuration(performance.now() - scanStarted);
          } else if (visit.emptyConfirmation < dependencies.shieldedEmptyConfirmations) {
            view.setStatus(`Confirming empty Orchard terminal page ${visit.emptyConfirmation + 1}/${dependencies.shieldedEmptyConfirmations} at aligned position ${visit.position}…`);
          }
          renderShieldedProgress(ledger, false, network, false);
          view.updateTiming();
        },
        disposePage: (page) => {
          for (const note of page.notes) {
            note.cmx.fill(0);
            note.nullifier.fill(0);
            note.cvNet.fill(0);
            note.encryptedNote.fill(0);
          }
          page.notes.length = 0;
        },
        isCancelled: () => cancellationRequested,
        yieldTurn: yieldToBrowser,
      });
      if (outcome.complete) {
        renderShieldedProgress(ledger, true, network, true);
        view.setStatus(`Scan complete after ${dependencies.shieldedEmptyConfirmations} verified empty terminal reads. ${ledger.snapshot(true).scannedNotes} pool actions checked.`);
        view.finishDiagnostics(`Proof verification and local Orchard recovery completed through aligned position ${outcome.terminalPosition}.`);
      } else {
        renderShieldedProgress(ledger, false, network, true);
        const message = `Stopped at the ${dependencies.shieldedMaxPagesPerScan.toLocaleString()}-page safety ceiling before the pool end was confirmed. Results are partial.`;
        view.setStatus(message);
        view.failDiagnostics(message);
      }
    } finally {
      viewingKey.hex = '';
    }
  }

  async function runCore(network: ViewerNetwork): Promise<void> {
    dependencies.assertPublicLookupInput(view.viewingKeyInput.value);
    currentAbort = new AbortController();
    const limit = Number(view.historyLimitInput.value);
    view.setStatus(`Querying Dash Core ${network} address history…`);
    view.setDiagnosticDetail('Validating the Base58Check address, checking DashScan synchronization, then loading exact-duff totals and history.');
    const remoteStarted = performance.now();
    const snapshot = await dependencies.queryCoreAddress(
      view.viewingKeyInput.value,
      network,
      limit,
      currentAbort.signal,
    );
    view.addRemoteDuration(performance.now() - remoteStarted);
    view.setRequestCount(snapshot.requests);
    if (cancellationRequested) return;
    setExportState({ mode: 'core', network: snapshot.network, snapshot });
    view.renderCore(snapshot);
    view.setDiagnosticSource(snapshot.endpoint);
    view.setDiagnosticProof(`DashScan ${snapshot.indexStatus} · Core height ${snapshot.indexedHeight.toLocaleString()}`);
    view.setDiagnosticRemoteTime(snapshot.indexedTimeMs);
    view.setStatus(`Address query complete. ${snapshot.transactionCount.toLocaleString()} transactions reported; ${snapshot.transactions.length.toLocaleString()} loaded.`);
    view.finishDiagnostics(`DashScan reported a synchronized index at Core height ${snapshot.indexedHeight.toLocaleString()}. Loaded address totals and ${snapshot.transactions.length.toLocaleString()} newest transaction record(s) in ${snapshot.requests} request(s).`);
  }

  async function runPlatform(network: ViewerNetwork): Promise<void> {
    dependencies.assertPublicLookupInput(view.viewingKeyInput.value);
    currentAbort = new AbortController();
    const source = new dependencies.DashPlatformAddressSource(network);
    const limit = Number(view.historyLimitInput.value);
    view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
    view.setDiagnosticDetail('Validating the DIP18 address and establishing a trusted DAPI context.');
    const connectStarted = performance.now();
    await source.connect();
    view.addRemoteDuration(performance.now() - connectStarted);
    if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
    view.setRequestCount(1);
    const queryStartedAt = performance.now();
    const snapshot = await source.query(view.viewingKeyInput.value);
    view.addRemoteDuration(performance.now() - queryStartedAt);
    if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
    view.setStatus('Platform state verified. Checking Platform Explorer synchronization and loading address history…');
    view.setDiagnosticDetail('DAPI proof verified. Querying the Platform Explorer address index and latest indexed height.');
    const historyStartedAt = performance.now();
    const history = await dependencies.queryPlatformAddressHistory(
      view.viewingKeyInput.value,
      network,
      limit,
      currentAbort.signal,
    );
    view.addRemoteDuration(performance.now() - historyStartedAt);
    view.setRequestCount(1 + history.requests);
    if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
    setExportState({ mode: 'platform', network: snapshot.network, snapshot, history });
    view.renderPlatform(snapshot, history);
    view.setDiagnosticSource(`Proof DAPI + ${history.endpoint}`);
    view.setDiagnosticProof(`DAPI ${snapshot.proofHeight} · Explorer ${history.indexedHeight.toLocaleString()}`);
    view.setDiagnosticRemoteTime(history.indexedTimeMs);
    view.setStatus(`Platform state verified and ${history.transitions.length.toLocaleString()} of ${history.totalTransitions.toLocaleString()} address transitions loaded.`);
    view.finishDiagnostics(`Verified the GroveDB address-state proof and a ${history.indexStatus} Platform Explorer index. Proof values take precedence if the two sources disagree.`);
  }

  async function runIdentity(network: ViewerNetwork): Promise<void> {
    const input = dependencies.normalizeIdentityLookupInput(view.viewingKeyInput.value);
    currentAbort = new AbortController();
    const source = new dependencies.DashPlatformIdentitySource(network);
    const limit = Number(view.historyLimitInput.value);
    view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
    view.setDiagnosticDetail(`Validated ${input.label} locally. No private material was sent to the network.`);
    const connectStarted = performance.now();
    await source.connect();
    view.addRemoteDuration(performance.now() - connectStarted);
    if (cancellationRequested) throw new DOMException('Identity query cancelled.', 'AbortError');
    const lookupStarted = performance.now();
    const snapshot = await source.query(input);
    view.addRemoteDuration(performance.now() - lookupStarted);
    view.setRequestCount(snapshot.requests);
    if (cancellationRequested) throw new DOMException('Identity query cancelled.', 'AbortError');

    view.setStatus(
      snapshot.identities.length === 0
        ? 'Identity lookup proof verified. No matching Identity was found.'
        : `Verified ${snapshot.identities.length.toLocaleString()} Identity result(s). Loading synchronized indexed activity…`,
    );
    const histories: PlatformIdentityHistoryResult[] = [];
    for (const identity of snapshot.identities) {
      if (cancellationRequested) throw new DOMException('Identity query cancelled.', 'AbortError');
      const historyStarted = performance.now();
      try {
        const history = await dependencies.queryPlatformIdentityHistory(
          identity.identifier,
          network,
          limit,
          currentAbort.signal,
        );
        view.addRemoteDuration(performance.now() - historyStarted);
        view.setRequestCount(snapshot.requests + histories.reduce((total, result) => total + (result.history?.requests ?? 0), 0) + history.requests);
        histories.push({ identifier: identity.identifier, history, error: null });
      } catch (cause) {
        view.addRemoteDuration(performance.now() - historyStarted);
        if (cancellationRequested) throw cause;
        histories.push({
          identifier: identity.identifier,
          history: null,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    const historyRequests = histories.reduce((total, result) => total + (result.history?.requests ?? 0), 0);
    view.setRequestCount(snapshot.requests + historyRequests);
    setExportState({ mode: 'identity', network, snapshot, histories });
    view.renderIdentity(snapshot, histories);
    const proofHeights = snapshot.proofs.map(({ height }) => height);
    const highestProof = proofHeights.reduce((highest, height) => height > highest ? height : highest, 0n);
    const explorerHeights = histories.flatMap(({ history }) => history === null ? [] : [history.indexedHeight]);
    view.setDiagnosticSource(histories.some(({ history }) => history !== null)
      ? 'Proof DAPI + Dash Platform Explorer'
      : 'Dash Platform DAPI proof');
    view.setDiagnosticProof(
      explorerHeights.length === 0
        ? `DAPI ${highestProof}`
        : `DAPI ${highestProof} · Explorer ${Math.max(...explorerHeights).toLocaleString()}`,
    );
    const latestProofTime = snapshot.proofs.at(-1)?.responseTimeMs ?? null;
    view.setDiagnosticRemoteTime(latestProofTime);
    const historyFailures = histories.filter(({ error }) => error !== null).length;
    view.setStatus(
      snapshot.identities.length === 0
        ? 'Proof-verified lookup complete. No matching registered Identity exists.'
        : `Loaded ${snapshot.identities.length.toLocaleString()} proof-verified Identity result(s)${historyFailures === 0 ? ' with synchronized indexed activity' : `; indexed history failed for ${historyFailures.toLocaleString()}`}.`,
    );
    view.finishDiagnostics(
      `Verified ${snapshot.proofs.length.toLocaleString()} DAPI proof response(s). Explorer history is auxiliary; proof-verified Identity state remains authoritative.`,
    );
  }

  async function submitQuery(): Promise<void> {
    if (running) return;
    if (!viewerSelfTestPassed) {
      view.showError('Cryptographic startup self-test has not passed. Queries remain disabled.');
      return;
    }
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
      if (viewerMode === 'shielded') await runShielded(network);
      else if (viewerMode === 'core') await runCore(network);
      else if (viewerMode === 'platform') await runPlatform(network);
      else await runIdentity(network);
    } catch (cause) {
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
    view.showCancellationRequested(viewerMode);
  }

  function resetViewer(): void {
    cancellationRequested = true;
    currentAbort?.abort();
    setExportState(null);
    view.resetViewer(viewerMode);
  }

  function setViewerMode(mode: ViewerMode): void {
    if (running || mode === viewerMode) return;
    viewerMode = mode;
    view.setViewerMode(mode);
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

  return {
    start(): void {
      if (started) return;
      started = true;
      view.form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submitQuery();
      });
      view.cancelButton.addEventListener('click', cancelQuery);
      view.clearButton.addEventListener('click', resetViewer);
      view.revealButton.addEventListener('click', () => view.toggleViewingKeyReveal(viewerMode));
      view.exportCsvButton.addEventListener('click', () => downloadExport('csv'));
      view.exportJsonButton.addEventListener('click', () => downloadExport('json'));
      for (const button of view.modeButtons) {
        button.addEventListener('click', () => setViewerMode(button.dataset.viewerMode as ViewerMode));
      }
      view.viewingKeyInput.addEventListener('input', () => view.updateInputMode(viewerMode));
      view.keyCapabilityInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.networkInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.updateInputMode(viewerMode);
      setRunning(false);
      void initializeViewerRuntime();
    },
  };
}
