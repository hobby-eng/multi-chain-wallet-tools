import type { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { NormalizedViewingKey, ViewingKeyInputMode } from '@ckd/dash-network/viewing-key.js';
import {
  mapViewerBatchTasks,
  parseViewerBatchInputs,
  parseViewerConcurrency,
  type ViewerBatchInput,
} from './batch.js';
import type {
  ViewerBatchExportError,
  ViewerBatchExportItem,
  ViewerExportFormat,
  ViewerExportState,
  ViewerSingleExportState,
} from './export.js';
import type {
  ActivityViewerView,
  ViewerBatchResultOption,
  ViewerMode,
  ViewerQueryMode,
} from './view.js';

const SHIELDED_PAINT_INTERVAL_MS = 500;

interface ActivityViewerDependencies {
  ShieldedActivityLedger: typeof import('@ckd/dash-network/activity.js').ShieldedActivityLedger;
  DashEvoShieldedSource: typeof import('@ckd/dash-network/dash-source.js').DashEvoShieldedSource;
  DashPlatformAddressSource: typeof import('@ckd/dash-network/platform-address-source.js').DashPlatformAddressSource;
  DashPlatformIdentitySource: typeof import('@ckd/dash-network/platform-identity-source.js').DashPlatformIdentitySource;
  assertCanonicalViewingKey: typeof import('@ckd/dash-network/orchard-scanner.js').assertCanonicalViewingKey;
  assertPublicBatchLookupInput: typeof import('@ckd/dash-network/private-material.js').assertPublicBatchLookupInput;
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
  let queryMode: ViewerQueryMode = 'single';
  let currentAbort: AbortController | null = null;
  let currentExport: ViewerExportState | null = null;
  let batchItems: ViewerBatchExportItem[] = [];
  let batchErrors: ViewerBatchExportError[] = [];
  let activeBatchResultId: string | null = null;
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

  function renderResult(state: ViewerSingleExportState): void {
    if (state.mode === 'core') view.renderCore(state.snapshot);
    else if (state.mode === 'platform') view.renderPlatform(state.snapshot, state.history);
    else if (state.mode === 'identity') view.renderIdentity(state.snapshot, state.histories);
    else view.renderShielded(state.snapshot);
  }

  function compactLabel(value: string, maxLength = 34): string {
    if (value.length <= maxLength) return value;
    const edge = Math.floor((maxLength - 1) / 2);
    return `${value.slice(0, edge)}…${value.slice(-edge)}`;
  }

  function batchResultLabel(
    input: ViewerBatchInput,
    state: ViewerSingleExportState,
    index: number,
  ): string {
    const number = `${index + 1}`;
    if (state.mode === 'shielded') return `${number} · ${state.snapshot.keyKind.toUpperCase()} viewing key`;
    if (state.mode === 'identity') {
      const identity = state.snapshot.identities[0];
      const label = identity?.dpnsNames[0] ?? identity?.identifier ?? `No match · line ${input.line}`;
      return `${number} · ${compactLabel(label)}`;
    }
    return `${number} · ${compactLabel(state.snapshot.address)}`;
  }

  function renderBatchSelection(id: string): void {
    const item = batchItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    activeBatchResultId = id;
    renderResult(item.state);
    const options: ViewerBatchResultOption[] = [
      ...batchItems.map(({ id: itemId, label }) => ({ id: itemId, label, status: 'complete' as const })),
      ...batchErrors.map(({ id: errorId, label, message }) => ({
        id: errorId,
        label,
        status: 'failed' as const,
        error: message,
      })),
    ].sort((left, right) => Number(left.id.replace(/\D/gu, '')) - Number(right.id.replace(/\D/gu, '')));
    view.renderBatchResults(options, activeBatchResultId, renderBatchSelection);
  }

  function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function isPrivateMaterialError(cause: unknown): boolean {
    return cause instanceof Error && cause.name === 'PrivateMaterialError';
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

  async function runBatch(network: ViewerNetwork): Promise<void> {
    const rawInput = view.batchInput.value;
    if (viewerMode !== 'shielded') dependencies.assertPublicBatchLookupInput(rawInput);
    const inputs = parseViewerBatchInputs(rawInput);
    const concurrency = parseViewerConcurrency(view.batchConcurrencyInput.value);
    const limit = Number(view.historyLimitInput.value);
    currentAbort = new AbortController();
    batchItems = [];
    batchErrors = [];
    activeBatchResultId = null;
    let completed = 0;
    const updateProgress = (label: string): void => {
      completed += 1;
      view.setStatus(`Batch ${completed.toLocaleString()}/${inputs.length.toLocaleString()} · ${label}`);
      view.updateTiming();
    };
    const errorLabel = (input: ViewerBatchInput): string => {
      const number = Number(input.id.replace(/\D/gu, ''));
      if (viewerMode === 'shielded') return `${number} · viewing key`;
      return `${number} · ${compactLabel(input.value)}`;
    };
    const addPreflightError = (input: ViewerBatchInput, cause: unknown): void => {
      batchErrors.push({ id: input.id, label: errorLabel(input), message: errorMessage(cause) });
      updateProgress(`line ${input.line} rejected locally`);
    };

    let settled: PromiseSettledResult<ViewerSingleExportState>[] = [];
    let taskInputs: ViewerBatchInput[] = [];
    if (viewerMode === 'core') {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      view.setDiagnosticDetail(`Validated ${inputs.length.toLocaleString()} public Core address input(s) locally before networking.`);
      settled = await mapViewerBatchTasks(inputs, concurrency, async (input) => {
        if (cancellationRequested) throw new DOMException('Core batch cancelled.', 'AbortError');
        const startedAt = performance.now();
        try {
          const snapshot = await dependencies.queryCoreAddress(
            input.value,
            network,
            limit,
            currentAbort?.signal,
          );
          view.recordRequests(snapshot.requests);
          return { mode: 'core', network: snapshot.network, snapshot };
        } finally {
          view.addRemoteDuration(performance.now() - startedAt);
          updateProgress(`Core line ${input.line} finished`);
        }
      });
      view.setDiagnosticSource('DashScan Core API');
    } else if (viewerMode === 'platform') {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      const source = new dependencies.DashPlatformAddressSource(network);
      view.setStatus(`Connecting once for ${inputs.length.toLocaleString()} Platform address lookup(s)…`);
      const connectStarted = performance.now();
      await source.connect();
      view.addRemoteDuration(performance.now() - connectStarted);
      view.setDiagnosticDetail(`Validated all public inputs before opening DAPI; running up to ${concurrency} address lookup(s) at once.`);
      settled = await mapViewerBatchTasks(inputs, concurrency, async (input) => {
        if (cancellationRequested) throw new DOMException('Platform batch cancelled.', 'AbortError');
        const startedAt = performance.now();
        try {
          const snapshot = await source.query(input.value);
          view.recordRequest();
          const history = await dependencies.queryPlatformAddressHistory(
            input.value,
            network,
            limit,
            currentAbort?.signal,
          );
          view.recordRequests(history.requests);
          return { mode: 'platform', network: snapshot.network, snapshot, history };
        } finally {
          view.addRemoteDuration(performance.now() - startedAt);
          updateProgress(`Platform line ${input.line} finished`);
        }
      });
      view.setDiagnosticSource('Proof DAPI + Dash Platform Explorer');
    } else if (viewerMode === 'identity') {
      const normalized = new Map<string, ReturnType<typeof dependencies.normalizeIdentityLookupInput>>();
      for (const input of inputs) {
        try {
          normalized.set(input.id, dependencies.normalizeIdentityLookupInput(input.value));
        } catch (cause) {
          if (isPrivateMaterialError(cause)) throw cause;
          addPreflightError(input, cause);
        }
      }
      taskInputs = inputs.filter(({ id }) => normalized.has(id));
      if (taskInputs.length > 0) {
        const source = new dependencies.DashPlatformIdentitySource(network);
        view.setStatus(`Connecting once for ${taskInputs.length.toLocaleString()} valid Identity lookup(s)…`);
        const connectStarted = performance.now();
        await source.connect();
        view.addRemoteDuration(performance.now() - connectStarted);
        view.setDiagnosticDetail(`All Identity inputs were checked locally before DAPI; running up to ${concurrency} lookup(s) at once.`);
        settled = await mapViewerBatchTasks(taskInputs, concurrency, async (input) => {
          if (cancellationRequested) throw new DOMException('Identity batch cancelled.', 'AbortError');
          const startedAt = performance.now();
          try {
            const lookup = normalized.get(input.id);
            if (lookup === undefined) throw new Error('Normalized Identity input is unavailable.');
            const snapshot = await source.query(lookup);
            view.recordRequests(snapshot.requests);
            const histories: PlatformIdentityHistoryResult[] = [];
            for (const identity of snapshot.identities) {
              if (cancellationRequested) throw new DOMException('Identity batch cancelled.', 'AbortError');
              try {
                const history = await dependencies.queryPlatformIdentityHistory(
                  identity.identifier,
                  network,
                  limit,
                  currentAbort?.signal,
                );
                view.recordRequests(history.requests);
                histories.push({ identifier: identity.identifier, history, error: null });
              } catch (cause) {
                if (cancellationRequested) throw cause;
                histories.push({
                  identifier: identity.identifier,
                  history: null,
                  error: errorMessage(cause),
                });
              }
            }
            return { mode: 'identity', network, snapshot, histories };
          } finally {
            view.addRemoteDuration(performance.now() - startedAt);
            updateProgress(`Identity line ${input.line} finished`);
          }
        });
      }
      view.setDiagnosticSource('Proof DAPI + Dash Platform Explorer');
    } else {
      const prepared: Array<{ input: ViewerBatchInput; key: NormalizedViewingKey; ledger: ShieldedActivityLedger }> = [];
      for (const input of inputs) {
        let key: NormalizedViewingKey | null = null;
        try {
          key = dependencies.normalizeViewingKey(
            input.value,
            view.keyCapabilityInput.value as ViewingKeyInputMode,
          );
          if (key.bundleNetwork !== undefined && key.bundleNetwork !== network) {
            throw new Error(`This viewing bundle is for ${key.bundleNetwork}; select that network before scanning.`);
          }
          dependencies.assertCanonicalViewingKey(key);
          prepared.push({ input, key, ledger: new dependencies.ShieldedActivityLedger(key.kind) });
        } catch (cause) {
          if (key !== null) key.hex = '';
          addPreflightError(input, cause);
        }
      }
      taskInputs = prepared.map(({ input }) => input);
      if (prepared.length > 0) {
        try {
          const source = new dependencies.DashEvoShieldedSource(network);
          view.setStatus(`Connecting once to scan the Orchard pool for ${prepared.length.toLocaleString()} viewing key(s)…`);
          const connectStarted = performance.now();
          await source.connect();
          view.addRemoteDuration(performance.now() - connectStarted);
          view.setDiagnosticDetail('Every viewing key was validated locally. Verified encrypted pool pages are fetched once and reused across the batch.');
          const failed = new Set<string>();
          let firstScanFailure: unknown;
          const outcome = await dependencies.runShieldedPageStream({
            fetchPage: async (position) => {
              view.setStatus(`Fetching shared verified Orchard page at aligned position ${position} for ${prepared.length - failed.size} active key(s)…`);
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
              for (const item of prepared) {
                if (failed.has(item.input.id) || page.notes.length === 0) continue;
                const scanStarted = performance.now();
                try {
                  const matches = dependencies.scanEncryptedPage(item.key, visit.position, page.notes, network);
                  item.ledger.applyPage(visit.position, page, matches);
                } catch (cause) {
                  failed.add(item.input.id);
                  firstScanFailure ??= cause;
                  batchErrors.push({
                    id: item.input.id,
                    label: errorLabel(item.input),
                    message: errorMessage(cause),
                  });
                } finally {
                  view.addLocalDuration(performance.now() - scanStarted);
                }
              }
              if (failed.size === prepared.length && firstScanFailure !== undefined) throw firstScanFailure;
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
          settled = prepared
            .filter(({ input }) => !failed.has(input.id))
            .map(({ ledger }): PromiseFulfilledResult<ViewerSingleExportState> => ({
              status: 'fulfilled',
              value: { mode: 'shielded', network, snapshot: ledger.snapshot(outcome.complete) },
            }));
          taskInputs = prepared.filter(({ input }) => !failed.has(input.id)).map(({ input }) => input);
          completed += prepared.length - failed.size;
          view.setStatus(`Batch ${completed.toLocaleString()}/${inputs.length.toLocaleString()} · shared Orchard scan finished`);
        } finally {
          for (const { key } of prepared) key.hex = '';
        }
      }
      view.setDiagnosticSource('Dash Platform DAPI proof + local Orchard recovery');
    }

    if (cancellationRequested) throw new DOMException('Batch query cancelled.', 'AbortError');
    settled.forEach((result, index) => {
      const input = taskInputs[index];
      if (input === undefined) return;
      if (result.status === 'fulfilled') {
        const ordinal = Number(input.id.replace(/\D/gu, '')) - 1;
        batchItems.push({
          id: input.id,
          label: batchResultLabel(input, result.value, ordinal),
          state: result.value,
        });
      } else {
        batchErrors.push({ id: input.id, label: errorLabel(input), message: errorMessage(result.reason) });
      }
    });
    batchItems.sort((left, right) => Number(left.id.replace(/\D/gu, '')) - Number(right.id.replace(/\D/gu, '')));
    batchErrors.sort((left, right) => Number(left.id.replace(/\D/gu, '')) - Number(right.id.replace(/\D/gu, '')));
    if (batchItems.length === 0) {
      const firstError = batchErrors[0]?.message ?? 'No query returned a result.';
      throw new Error(`Batch completed without a successful result. ${firstError}`);
    }
    setExportState({
      batch: true,
      mode: viewerMode,
      network,
      items: batchItems,
      errors: batchErrors,
    });
    const first = batchItems[0];
    if (first === undefined) throw new Error('Batch result selection is unavailable.');
    renderBatchSelection(first.id);
    if (viewerMode === 'core') {
      const snapshots = batchItems.flatMap(({ state }) => state.mode === 'core' ? [state.snapshot] : []);
      view.setDiagnosticProof(`DashScan Core height ${Math.max(...snapshots.map(({ indexedHeight }) => indexedHeight)).toLocaleString()}`);
      view.setDiagnosticRemoteTime(Math.max(...snapshots.map(({ indexedTimeMs }) => indexedTimeMs)));
    } else if (viewerMode === 'platform') {
      const states = batchItems.flatMap(({ state }) => state.mode === 'platform' ? [state] : []);
      const dapiHeight = states.reduce((highest, { snapshot }) => snapshot.proofHeight > highest ? snapshot.proofHeight : highest, 0n);
      const explorerHeight = Math.max(...states.map(({ history }) => history.indexedHeight));
      view.setDiagnosticProof(`DAPI ${dapiHeight} · Explorer ${explorerHeight.toLocaleString()}`);
      view.setDiagnosticRemoteTime(Math.max(...states.map(({ history }) => history.indexedTimeMs)));
    } else if (viewerMode === 'identity') {
      const states = batchItems.flatMap(({ state }) => state.mode === 'identity' ? [state] : []);
      const dapiHeight = states
        .flatMap(({ snapshot }) => snapshot.proofs)
        .reduce((highest, { height }) => height > highest ? height : highest, 0n);
      const explorerHeights = states.flatMap(({ histories }) =>
        histories.flatMap(({ history }) => history === null ? [] : [history.indexedHeight]));
      view.setDiagnosticProof(
        explorerHeights.length === 0
          ? `DAPI ${dapiHeight}`
          : `DAPI ${dapiHeight} · Explorer ${Math.max(...explorerHeights).toLocaleString()}`,
      );
      const proofTimes = states.flatMap(({ snapshot }) => snapshot.proofs.map(({ responseTimeMs }) => responseTimeMs));
      view.setDiagnosticRemoteTime(proofTimes.reduce((latest, value) => value > latest ? value : latest, 0n));
    }
    view.setStatus(`Batch complete: ${batchItems.length.toLocaleString()} succeeded, ${batchErrors.length.toLocaleString()} failed.`);
    view.finishDiagnostics(
      `Batch completed with bounded concurrency ${concurrency}. Results remain local until a selected export is downloaded.`,
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
      if (queryMode === 'batch') await runBatch(network);
      else if (viewerMode === 'shielded') await runShielded(network);
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
    batchItems = [];
    batchErrors = [];
    activeBatchResultId = null;
    view.resetViewer(viewerMode);
  }

  function setViewerMode(mode: ViewerMode): void {
    if (running || mode === viewerMode) return;
    viewerMode = mode;
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
      view.revealBatchButton.addEventListener('click', () => view.toggleViewingKeyReveal(viewerMode));
      view.exportCsvButton.addEventListener('click', () => downloadExport('csv'));
      view.exportJsonButton.addEventListener('click', () => downloadExport('json'));
      for (const button of view.modeButtons) {
        button.addEventListener('click', () => setViewerMode(button.dataset.viewerMode as ViewerMode));
      }
      for (const button of view.queryModeButtons) {
        button.addEventListener('click', () => setQueryMode(button.dataset.queryMode as ViewerQueryMode));
      }
      view.viewingKeyInput.addEventListener('input', () => view.updateInputMode(viewerMode));
      view.batchInput.addEventListener('input', () => view.updateInputMode(viewerMode));
      view.keyCapabilityInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.networkInput.addEventListener('change', () => view.updateInputMode(viewerMode));
      view.setQueryMode(queryMode, viewerMode);
      view.updateInputMode(viewerMode);
      setRunning(false);
      void initializeViewerRuntime();
    },
  };
}
