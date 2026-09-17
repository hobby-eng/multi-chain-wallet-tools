import { describeUnknownError } from '@ckd/core/error-handling.js';
import type { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { NormalizedViewingKey, ViewingKeyInputMode } from '@ckd/dash-network/viewing-key.js';
import { mapViewerBatchTasks, parseViewerBatchInputs, parseViewerConcurrency, type ViewerBatchInput } from './batch.js';
import type { DetectedViewerInput } from './detection.js';
import type { ActivityViewerDependencies } from './dependencies.js';
import type {
  ViewerBatchExportError,
  ViewerBatchExportItem,
  ViewerExportState,
  ViewerSingleExportState,
} from './export.js';
import type { ActivityViewerView, ViewerBatchResultOption, ViewerMode } from './view.js';
import { queryCoreBatchItem, queryIdentityBatchItem, queryPlatformBatchItem } from './batch-public-query.js';
import { activityBatchResultLabel, compactActivityLabel, renderActivityResult } from './batch-result-presentation.js';

interface ActivityBatchControllerOptions {
  isCancellationRequested: () => boolean;
  checkCancellation: () => void;
  setExportState: (state: ViewerExportState | null) => void;
  yieldToBrowser: () => Promise<void>;
}

export function createActivityBatchController(
  view: ActivityViewerView,
  dependencies: ActivityViewerDependencies,
  options: ActivityBatchControllerOptions,
) {
  const { isCancellationRequested, checkCancellation, setExportState, yieldToBrowser } = options;
  let currentAbort: AbortController | null = null;
  let batchItems: ViewerBatchExportItem[] = [];
  let batchErrors: ViewerBatchExportError[] = [];
  let activeBatchResultId: string | null = null;

  function renderBatchSelection(id: string): void {
    const item = batchItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    activeBatchResultId = id;
    renderActivityResult(view, item.state);
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
    return cause instanceof Error ? cause.message : describeUnknownError(cause);
  }

  function isPrivateMaterialError(cause: unknown): boolean {
    return cause instanceof Error && cause.name === 'PrivateMaterialError';
  }

  async function runAutoBatch(network: ViewerNetwork): Promise<void> {
    const rawInput = view.batchInput.value;
    dependencies.assertAutoViewerBatchInput(rawInput);
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
      view.setStatus(`Mixed batch ${completed.toLocaleString()}/${inputs.length.toLocaleString()} · ${label}`);
      view.updateTiming();
    };
    const errorLabel = (input: ViewerBatchInput, mode?: ViewerMode): string => {
      const number = Number(input.id.replace(/\D/gu, ''));
      if (mode === 'shielded' || (mode === undefined && dependencies.looksLikeAutoOrchardInput(input.value))) {
        return `${number} · ORCHARD · viewing key`;
      }
      if (mode === undefined) return `${number} · AUTO · line ${input.line}`;
      return `${number} · ${mode.toUpperCase()} · ${compactActivityLabel(input.value)}`;
    };
    const addError = (input: ViewerBatchInput, cause: unknown, mode?: ViewerMode): void => {
      const resolvedMode = mode ?? (dependencies.looksLikeAutoOrchardInput(input.value) ? 'shielded' : undefined);
      batchErrors.push({
        id: input.id,
        label: errorLabel(input, resolvedMode),
        message: errorMessage(cause),
        ...(resolvedMode === undefined ? {} : { mode: resolvedMode }),
      });
    };
    const detectedInputs: Array<{ input: ViewerBatchInput; detected: DetectedViewerInput }> = [];
    const identityLookups = new Map<string, ReturnType<typeof dependencies.normalizeIdentityLookupInput>>();
    const preparedOrchard: Array<{
      input: ViewerBatchInput;
      detected: DetectedViewerInput;
      key: NormalizedViewingKey;
      ledger: ShieldedActivityLedger;
    }> = [];

    try {
      for (const input of inputs) {
        let key: NormalizedViewingKey | null = null;
        let detected: DetectedViewerInput | null = null;
        try {
          detected = dependencies.detectViewerInput(input.value, network);
          if (detected.mode === 'identity') {
            identityLookups.set(input.id, dependencies.normalizeIdentityLookupInput(detected.value));
          } else if (detected.mode === 'shielded') {
            key = dependencies.normalizeViewingKey(detected.value, detected.viewingKeyMode);
            if (key.bundleNetwork !== undefined && key.bundleNetwork !== network) {
              throw new Error(`This viewing bundle is for ${key.bundleNetwork}; select that network before scanning.`);
            }
            dependencies.assertCanonicalViewingKey(key);
            preparedOrchard.push({
              input,
              detected,
              key,
              ledger: new dependencies.ShieldedActivityLedger(key.kind),
            });
            key = null;
          }
          detectedInputs.push({ input, detected });
        } catch (cause) {
          if (key !== null) key.hex = '';
          if (isPrivateMaterialError(cause)) throw cause;
          addError(input, cause, detected?.mode);
          updateProgress(`line ${input.line} rejected locally`);
        }
      }

      const publicInputs = detectedInputs.filter(({ detected }) => detected.mode !== 'shielded');
      const needsPlatform = publicInputs.some(({ detected }) => detected.mode === 'platform');
      const needsIdentity = publicInputs.some(({ detected }) => detected.mode === 'identity');
      let platformSource: InstanceType<ActivityViewerDependencies['DashPlatformAddressSource']> | null = null;
      let platformConnectionError: unknown;
      if (needsPlatform) {
        const startedAt = performance.now();
        try {
          platformSource = new dependencies.DashPlatformAddressSource(network);
          await platformSource.connect();
        } catch (cause) {
          platformConnectionError = cause;
        } finally {
          view.addRemoteDuration(performance.now() - startedAt);
        }
      }
      let identitySource: InstanceType<ActivityViewerDependencies['DashPlatformIdentitySource']> | null = null;
      let identityConnectionError: unknown;
      if (needsIdentity) {
        const startedAt = performance.now();
        try {
          identitySource = new dependencies.DashPlatformIdentitySource(network);
          await identitySource.connect();
        } catch (cause) {
          identityConnectionError = cause;
        } finally {
          view.addRemoteDuration(performance.now() - startedAt);
        }
      }

      const publicSettled = await mapViewerBatchTasks(
        publicInputs,
        concurrency,
        async ({ input, detected }): Promise<ViewerSingleExportState> => {
          if (isCancellationRequested()) throw new DOMException('Mixed batch cancelled.', 'AbortError');
          if (detected.mode === 'core') {
            return queryCoreBatchItem(detected.value, {
              dependencies,
              view,
              network,
              limit,
              signal: currentAbort?.signal,
              isCancellationRequested,
              onFinished: () => updateProgress(`core line ${input.line} finished`),
            });
          }
          if (detected.mode === 'platform') {
            if (platformConnectionError !== undefined) throw platformConnectionError;
            if (platformSource === null) throw new Error('Platform address source is unavailable.');
            return queryPlatformBatchItem(detected.value, platformSource, {
              dependencies,
              view,
              network,
              limit,
              signal: currentAbort?.signal,
              isCancellationRequested,
              onFinished: () => updateProgress(`platform line ${input.line} finished`),
            });
          }
          if (identityConnectionError !== undefined) throw identityConnectionError;
          if (identitySource === null) throw new Error('Platform Identity source is unavailable.');
          const lookup = identityLookups.get(input.id);
          if (lookup === undefined) throw new Error('Normalized Identity input is unavailable.');
          return queryIdentityBatchItem(lookup, identitySource, {
            dependencies,
            view,
            network,
            limit,
            signal: currentAbort?.signal,
            isCancellationRequested,
            onFinished: () => updateProgress(`identity line ${input.line} finished`),
          });
        },
      );

      publicSettled.forEach((result, index) => {
        const item = publicInputs[index];
        if (item === undefined) return;
        if (result.status === 'fulfilled') {
          const ordinal = Number(item.input.id.replace(/\D/gu, '')) - 1;
          batchItems.push({
            id: item.input.id,
            label: activityBatchResultLabel(item.input, result.value, ordinal),
            state: result.value,
          });
        } else {
          addError(item.input, result.reason, item.detected.mode);
        }
      });

      if (preparedOrchard.length > 0) {
        const failed = new Set<string>();
        let firstScanFailure: unknown;
        try {
          const source = new dependencies.DashEvoShieldedSource(network);
          view.setStatus(
            `Connecting once to scan Orchard for ${preparedOrchard.length.toLocaleString()} detected viewing key(s)…`,
          );
          const connectStarted = performance.now();
          await source.connect();
          checkCancellation();
          view.addRemoteDuration(performance.now() - connectStarted);
          const outcome = await dependencies.runShieldedPageStream({
            fetchPage: async (position) => {
              view.setStatus(
                `Fetching shared verified Orchard page at aligned position ${position} for ${preparedOrchard.length - failed.size} active key(s)…`,
              );
              const fetchStarted = performance.now();
              const page = await source.fetchPage(position, dependencies.shieldedPageSize);
              if (!isCancellationRequested()) {
                view.addRemoteDuration(performance.now() - fetchStarted);
                view.recordRequest();
              }
              return page;
            },
            noteCount: (page) => page.notes.length,
            revision: (page) => page.proofHeight,
            onPage: (page, visit) => {
              checkCancellation();
              for (const item of preparedOrchard) {
                if (failed.has(item.input.id) || page.notes.length === 0) continue;
                const scanStarted = performance.now();
                try {
                  const matches = dependencies.scanEncryptedPage(item.key, visit.position, page.notes, network);
                  item.ledger.applyPage(visit.position, page, matches);
                } catch (cause) {
                  failed.add(item.input.id);
                  firstScanFailure ??= cause;
                  addError(item.input, cause, 'shielded');
                  updateProgress(`Orchard line ${item.input.line} failed`);
                } finally {
                  view.addLocalDuration(performance.now() - scanStarted);
                }
              }
              if (failed.size === preparedOrchard.length && firstScanFailure !== undefined) {
                throw firstScanFailure;
              }
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
            isCancelled: () => isCancellationRequested(),
            yieldTurn: yieldToBrowser,
          });
          checkCancellation();
          for (const item of preparedOrchard) {
            if (failed.has(item.input.id)) continue;
            const state: ViewerSingleExportState = {
              mode: 'shielded',
              network,
              snapshot: item.ledger.snapshot(outcome.complete),
            };
            const ordinal = Number(item.input.id.replace(/\D/gu, '')) - 1;
            batchItems.push({
              id: item.input.id,
              label: activityBatchResultLabel(item.input, state, ordinal),
              state,
            });
            updateProgress(`Orchard line ${item.input.line} finished`);
          }
        } catch (cause) {
          if (isCancellationRequested()) throw cause;
          for (const item of preparedOrchard) {
            if (failed.has(item.input.id)) continue;
            addError(item.input, cause, 'shielded');
            updateProgress(`Orchard line ${item.input.line} failed`);
          }
        }
      }

      if (isCancellationRequested()) throw new DOMException('Mixed batch cancelled.', 'AbortError');
      batchItems.sort((left, right) => Number(left.id.replace(/\D/gu, '')) - Number(right.id.replace(/\D/gu, '')));
      batchErrors.sort((left, right) => Number(left.id.replace(/\D/gu, '')) - Number(right.id.replace(/\D/gu, '')));
      if (batchItems.length === 0) {
        const firstError = batchErrors[0]?.message ?? 'No query returned a result.';
        throw new Error(`Mixed batch completed without a successful result. ${firstError}`);
      }
      setExportState({
        batch: true,
        mode: 'mixed',
        network,
        items: batchItems,
        errors: batchErrors,
      });
      const first = batchItems[0];
      if (first === undefined) throw new Error('Batch result selection is unavailable.');
      renderBatchSelection(first.id);

      const modes = [...new Set(batchItems.map(({ state }) => state.mode))];
      const coreHeights = batchItems.flatMap(({ state }) =>
        state.mode === 'core' ? [state.snapshot.indexedHeight] : [],
      );
      const dapiHeights = batchItems.flatMap(({ state }) => {
        if (state.mode === 'platform') return [state.snapshot.proofHeight];
        if (state.mode === 'identity') return state.snapshot.proofs.map(({ height }) => height);
        if (state.mode === 'shielded') return [state.snapshot.proofHeight];
        return [];
      });
      const proofParts: string[] = [];
      if (coreHeights.length > 0) proofParts.push(`Core ${Math.max(...coreHeights).toLocaleString()}`);
      if (dapiHeights.length > 0) {
        const dapiHeight = dapiHeights.reduce((highest, height) => (height > highest ? height : highest), 0n);
        proofParts.push(`DAPI ${dapiHeight}`);
      }
      const remoteTimes = batchItems
        .flatMap(({ state }) => {
          if (state.mode === 'core') return [state.snapshot.indexedTimeMs];
          if (state.mode === 'platform') return [state.history.indexedTimeMs];
          if (state.mode === 'identity') {
            return state.snapshot.proofs.map(({ responseTimeMs }) => Number(responseTimeMs));
          }
          return [];
        })
        .filter((value) => Number.isFinite(value) && value > 0);
      view.setDiagnosticMode(modes.length > 1 ? 'mixed' : modes[0]!, network);
      const sourceLabels: Record<ViewerMode, string> = {
        core: 'DashScan',
        platform: 'Platform address proof/index',
        identity: 'Identity proof/index',
        shielded: 'Orchard proof/local scan',
      };
      view.setDiagnosticSource(modes.map((mode) => sourceLabels[mode]).join(' + '));
      view.setDiagnosticProof(proofParts.join(' · '));
      if (remoteTimes.length > 0) view.setDiagnosticRemoteTime(Math.max(...remoteTimes));
      view.setStatus(
        `Mixed batch complete: ${batchItems.length.toLocaleString()} succeeded, ${batchErrors.length.toLocaleString()} failed.`,
      );
      view.finishDiagnostics(
        `Detected ${modes.length.toLocaleString()} input type(s) locally and used bounded public-query concurrency ${concurrency}. Orchard viewing keys never left this page.`,
      );
    } finally {
      for (const { key } of preparedOrchard) key.hex = '';
    }
  }

  async function runBatch(network: ViewerNetwork, viewerMode: ViewerMode): Promise<void> {
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
      return `${number} · ${compactActivityLabel(input.value)}`;
    };
    const addPreflightError = (input: ViewerBatchInput, cause: unknown): void => {
      batchErrors.push({
        id: input.id,
        label: errorLabel(input),
        message: errorMessage(cause),
        mode: viewerMode,
      });
      updateProgress(`line ${input.line} rejected locally`);
    };

    let settled: PromiseSettledResult<ViewerSingleExportState>[] = [];
    let taskInputs: ViewerBatchInput[] = [];
    if (viewerMode === 'core') {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      view.setDiagnosticDetail(
        `Validated ${inputs.length.toLocaleString()} public Core address input(s) locally before networking.`,
      );
      settled = await mapViewerBatchTasks(inputs, concurrency, (input) =>
        queryCoreBatchItem(input.value, {
          dependencies,
          view,
          network,
          limit,
          signal: currentAbort?.signal,
          isCancellationRequested,
          onFinished: () => updateProgress(`Core line ${input.line} finished`),
        }),
      );
      view.setDiagnosticSource('DashScan Core API');
    } else if (viewerMode === 'platform') {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      const source = new dependencies.DashPlatformAddressSource(network);
      view.setStatus(`Connecting once for ${inputs.length.toLocaleString()} Platform address lookup(s)…`);
      const connectStarted = performance.now();
      await source.connect();
      checkCancellation();
      view.addRemoteDuration(performance.now() - connectStarted);
      view.setDiagnosticDetail(
        `Validated all public inputs before opening DAPI; running up to ${concurrency} address lookup(s) at once.`,
      );
      settled = await mapViewerBatchTasks(inputs, concurrency, (input) =>
        queryPlatformBatchItem(input.value, source, {
          dependencies,
          view,
          network,
          limit,
          signal: currentAbort?.signal,
          isCancellationRequested,
          onFinished: () => updateProgress(`Platform line ${input.line} finished`),
        }),
      );
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
        checkCancellation();
        view.addRemoteDuration(performance.now() - connectStarted);
        view.setDiagnosticDetail(
          `All Identity inputs were checked locally before DAPI; running up to ${concurrency} lookup(s) at once.`,
        );
        settled = await mapViewerBatchTasks(taskInputs, concurrency, (input) => {
          const lookup = normalized.get(input.id);
          if (lookup === undefined) throw new Error('Normalized Identity input is unavailable.');
          return queryIdentityBatchItem(lookup, source, {
            dependencies,
            view,
            network,
            limit,
            signal: currentAbort?.signal,
            isCancellationRequested,
            onFinished: () => updateProgress(`Identity line ${input.line} finished`),
          });
        });
      }
      view.setDiagnosticSource('Proof DAPI + Dash Platform Explorer');
    } else {
      const prepared: Array<{ input: ViewerBatchInput; key: NormalizedViewingKey; ledger: ShieldedActivityLedger }> =
        [];
      for (const input of inputs) {
        let key: NormalizedViewingKey | null = null;
        try {
          key = dependencies.normalizeViewingKey(input.value, view.keyCapabilityInput.value as ViewingKeyInputMode);
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
          view.setStatus(
            `Connecting once to scan the Orchard pool for ${prepared.length.toLocaleString()} viewing key(s)…`,
          );
          const connectStarted = performance.now();
          await source.connect();
          checkCancellation();
          view.addRemoteDuration(performance.now() - connectStarted);
          view.setDiagnosticDetail(
            'Every viewing key was validated locally. Verified encrypted pool pages are fetched once and reused across the batch.',
          );
          const failed = new Set<string>();
          let firstScanFailure: unknown;
          const outcome = await dependencies.runShieldedPageStream({
            fetchPage: async (position) => {
              view.setStatus(
                `Fetching shared verified Orchard page at aligned position ${position} for ${prepared.length - failed.size} active key(s)…`,
              );
              const fetchStarted = performance.now();
              const page = await source.fetchPage(position, dependencies.shieldedPageSize);
              if (!isCancellationRequested()) {
                view.addRemoteDuration(performance.now() - fetchStarted);
                view.recordRequest();
              }
              return page;
            },
            noteCount: (page) => page.notes.length,
            revision: (page) => page.proofHeight,
            onPage: (page, visit) => {
              checkCancellation();
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
                    mode: viewerMode,
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
            isCancelled: () => isCancellationRequested(),
            yieldTurn: yieldToBrowser,
          });
          checkCancellation();
          settled = prepared
            .filter(({ input }) => !failed.has(input.id))
            .map(
              ({ ledger }): PromiseFulfilledResult<ViewerSingleExportState> => ({
                status: 'fulfilled',
                value: { mode: 'shielded', network, snapshot: ledger.snapshot(outcome.complete) },
              }),
            );
          taskInputs = prepared.filter(({ input }) => !failed.has(input.id)).map(({ input }) => input);
          completed += prepared.length - failed.size;
          view.setStatus(
            `Batch ${completed.toLocaleString()}/${inputs.length.toLocaleString()} · shared Orchard scan finished`,
          );
        } finally {
          for (const { key } of prepared) key.hex = '';
        }
      }
      view.setDiagnosticSource('Dash Platform DAPI proof + local Orchard recovery');
    }

    if (isCancellationRequested()) throw new DOMException('Batch query cancelled.', 'AbortError');
    settled.forEach((result, index) => {
      const input = taskInputs[index];
      if (input === undefined) return;
      if (result.status === 'fulfilled') {
        const ordinal = Number(input.id.replace(/\D/gu, '')) - 1;
        batchItems.push({
          id: input.id,
          label: activityBatchResultLabel(input, result.value, ordinal),
          state: result.value,
        });
      } else {
        batchErrors.push({
          id: input.id,
          label: errorLabel(input),
          message: errorMessage(result.reason),
          mode: viewerMode,
        });
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
      const snapshots = batchItems.flatMap(({ state }) => (state.mode === 'core' ? [state.snapshot] : []));
      view.setDiagnosticProof(
        `DashScan Core height ${Math.max(...snapshots.map(({ indexedHeight }) => indexedHeight)).toLocaleString()}`,
      );
      view.setDiagnosticRemoteTime(Math.max(...snapshots.map(({ indexedTimeMs }) => indexedTimeMs)));
    } else if (viewerMode === 'platform') {
      const states = batchItems.flatMap(({ state }) => (state.mode === 'platform' ? [state] : []));
      const dapiHeight = states.reduce(
        (highest, { snapshot }) => (snapshot.proofHeight > highest ? snapshot.proofHeight : highest),
        0n,
      );
      const explorerHeight = Math.max(...states.map(({ history }) => history.indexedHeight));
      view.setDiagnosticProof(`DAPI ${dapiHeight} · Explorer ${explorerHeight.toLocaleString()}`);
      view.setDiagnosticRemoteTime(Math.max(...states.map(({ history }) => history.indexedTimeMs)));
    } else if (viewerMode === 'identity') {
      const states = batchItems.flatMap(({ state }) => (state.mode === 'identity' ? [state] : []));
      const dapiHeight = states
        .flatMap(({ snapshot }) => snapshot.proofs)
        .reduce((highest, { height }) => (height > highest ? height : highest), 0n);
      const explorerHeights = states.flatMap(({ histories }) =>
        histories.flatMap(({ history }) => (history === null ? [] : [history.indexedHeight])),
      );
      view.setDiagnosticProof(
        explorerHeights.length === 0
          ? `DAPI ${dapiHeight}`
          : `DAPI ${dapiHeight} · Explorer ${Math.max(...explorerHeights).toLocaleString()}`,
      );
      const proofTimes = states.flatMap(({ snapshot }) => snapshot.proofs.map(({ responseTimeMs }) => responseTimeMs));
      view.setDiagnosticRemoteTime(proofTimes.reduce((latest, value) => (value > latest ? value : latest), 0n));
    }
    view.setStatus(
      `Batch complete: ${batchItems.length.toLocaleString()} succeeded, ${batchErrors.length.toLocaleString()} failed.`,
    );
    view.finishDiagnostics(
      `Batch completed with bounded concurrency ${concurrency}. Results remain local until a selected export is downloaded.`,
    );
  }

  return {
    runAutoBatch,
    runBatch,
    abort(): void {
      currentAbort?.abort();
    },
    reset(): void {
      currentAbort?.abort();
      currentAbort = null;
      batchItems = [];
      batchErrors = [];
      activeBatchResultId = null;
    },
  };
}
