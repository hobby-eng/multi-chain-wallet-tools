import { OrchardViewingCapability } from "@ckd/dash-network/viewing-capability.js";
import { isPrivateMaterialError } from "@ckd/secret-boundary/private-material-error.js";
import { describeUnknownError } from "@ckd/core/error-handling.js";
import type { ShieldedActivityLedger } from "@ckd/dash-network/activity.js";
import type { ShieldedPage } from "@ckd/dash-network/types.js";
import type { ViewerNetwork } from "@ckd/dash-network/types.js";
import type { ViewingKeyInputMode } from "@ckd/dash-network/viewing-key.js";
import {
  batchInputNumber,
  byInputLine,
  mapViewerBatchTasks,
  parseViewerBatchInputs,
  parseViewerConcurrency,
  type ViewerBatchInput,
} from "./batch.js";
import type { DetectedViewerInput } from "./detection.js";
import type { ActivityViewerDependencies } from "./dependencies.js";
import type {
  ViewerBatchExportError,
  ViewerBatchExportItem,
  ViewerBatchExportState,
  ViewerExportState,
  ViewerSingleExportState,
} from "./export.js";
import type { ActivityViewerView, ViewerBatchResultOption, ViewerMode } from "./view.js";
import {
  queryCoreBatchItem,
  queryIdentityBatchItem,
  queryPlatformBatchItem,
} from "./batch-public-query.js";
import {
  activityBatchResultLabel,
  compactActivityLabel,
  renderActivityResult,
} from "./batch-result-presentation.js";

/** A viewing key of the batch, ready for the shared Orchard scan, with the ledger of its notes. */
interface PreparedOrchardKey {
  readonly input: ViewerBatchInput;
  readonly key: OrchardViewingCapability;
  readonly ledger: ShieldedActivityLedger;
}

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

  /**
   * Clears the last batch and opens a new one; returns the step that counts `finished` inputs
   * (one by default) and says what finished.
   */
  function openBatch(total: number, name: string): (label: string, finished?: number) => void {
    currentAbort = new AbortController();
    batchItems = [];
    batchErrors = [];
    activeBatchResultId = null;
    let completed = 0;
    return (label, finished = 1) => {
      completed += finished;
      view.setStatus(`${name} ${completed.toLocaleString()}/${total.toLocaleString()} · ${label}`);
      view.updateTiming();
    };
  }

  /** What every public query of a batch needs, with the step it takes when it finishes. */
  function queryOptions(network: ViewerNetwork, limit: number, onFinished: () => void) {
    return {
      dependencies,
      view,
      network,
      limit,
      signal: currentAbort?.signal,
      isCancellationRequested,
      onFinished,
    };
  }

  /** Connects a source once for the whole batch, counting the time as remote time. */
  async function connectOnce(source: { connect(): Promise<void> }): Promise<void> {
    const started = performance.now();
    await source.connect();
    checkCancellation();
    view.addRemoteDuration(performance.now() - started);
  }

  /**
   * Connects the source `create` makes when the batch `needed` it, counting the time as remote
   * time. Returns what gives the source to an input: it throws the connection's failure, so that
   * only the inputs that need the source fail.
   */
  async function sourceFor<Source extends { connect(): Promise<void> }>(
    needed: boolean,
    create: () => Source,
    name: string,
  ): Promise<() => Source> {
    if (!needed)
      return () => {
        throw new Error(`${name} is unavailable.`);
      };
    const startedAt = performance.now();
    try {
      const source = create();
      await source.connect();
      return () => source;
    } catch (cause) {
      return () => {
        throw cause;
      };
    } finally {
      view.addRemoteDuration(performance.now() - startedAt);
    }
  }

  /** A viewing key of the batch, checked for the selected network and its canonical form. */
  function viewingKeyOf(
    value: string,
    mode: ViewingKeyInputMode,
    network: ViewerNetwork,
  ): OrchardViewingCapability {
    return OrchardViewingCapability.open(value, mode, network, {
      normalize: dependencies.normalizeViewingKey,
      canonical: dependencies.assertCanonicalViewingKey,
    });
  }

  /**
   * Scans the Orchard pool once for every prepared viewing key: each verified page is fetched
   * once and tried with every key that has not failed. A key that fails is reported through
   * `failedKey` and dropped; when all have failed the scan stops with the first failure.
   */
  async function scanOrchardTogether(
    prepared: readonly PreparedOrchardKey[],
    network: ViewerNetwork,
    hooks: {
      connecting: string;
      connected?: () => void;
      onPage?: (page: ShieldedPage) => void;
      failedKey: (item: PreparedOrchardKey, cause: unknown) => void;
    },
  ): Promise<{ complete: boolean; failed: ReadonlySet<string> }> {
    const failed = new Set<string>();
    let firstScanFailure: unknown;
    const source = new dependencies.DashEvoShieldedSource(network);
    view.setStatus(hooks.connecting);
    await connectOnce(source);
    hooks.connected?.();
    const outcome = await dependencies.streamShieldedPages({
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
      onPage: (page, visit) => {
        checkCancellation();
        hooks.onPage?.(page);
        for (const item of prepared) {
          if (failed.has(item.input.id) || page.notes.length === 0) continue;
          const scanStarted = performance.now();
          try {
            const matches = dependencies.scanEncryptedPage(
              item.key.normalized,
              visit.position,
              page.notes,
              network,
            );
            item.ledger.applyPage(visit.position, page, matches);
          } catch (cause) {
            failed.add(item.input.id);
            firstScanFailure ??= cause;
            hooks.failedKey(item, cause);
          } finally {
            view.addLocalDuration(performance.now() - scanStarted);
          }
        }
        if (failed.size === prepared.length && firstScanFailure !== undefined)
          throw firstScanFailure;
        view.updateTiming();
      },
      isCancelled: () => isCancellationRequested(),
      yieldTurn: yieldToBrowser,
    });
    checkCancellation();
    return { complete: outcome.complete, failed };
  }

  /** Adds a result of the batch, labelled by its input. */
  function addItem(input: ViewerBatchInput, state: ViewerSingleExportState): void {
    batchItems.push({
      id: input.id,
      label: activityBatchResultLabel(input, state, batchInputNumber(input.id) - 1),
      state,
    });
  }

  /**
   * Orders the results and the refusals by input line, refuses a batch without any result, offers
   * the results for export and shows the first.
   */
  function publishBatch(
    mode: ViewerBatchExportState["mode"],
    network: ViewerNetwork,
    name: string,
  ): void {
    batchItems.sort(byInputLine);
    batchErrors.sort(byInputLine);
    if (batchItems.length === 0) {
      const firstError = batchErrors[0]?.message ?? "No query returned a result.";
      throw new Error(`${name} completed without a successful result. ${firstError}`);
    }
    setExportState({ batch: true, mode, network, items: batchItems, errors: batchErrors });
    renderBatchSelection(batchItems[0]!.id);
  }

  function renderBatchSelection(id: string): void {
    const item = batchItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    activeBatchResultId = id;
    renderActivityResult(view, item.state);
    const options: ViewerBatchResultOption[] = [
      ...batchItems.map(({ id: itemId, label }) => ({
        id: itemId,
        label,
        status: "complete" as const,
      })),
      ...batchErrors.map(({ id: errorId, label, message }) => ({
        id: errorId,
        label,
        status: "failed" as const,
        error: message,
      })),
    ].sort(byInputLine);
    view.renderBatchResults(options, activeBatchResultId, renderBatchSelection);
  }

  function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : describeUnknownError(cause);
  }

  async function runAutoBatch(network: ViewerNetwork): Promise<void> {
    const rawInput = view.batchInput.value;
    dependencies.assertAutoViewerBatchInput(rawInput);
    const inputs = parseViewerBatchInputs(rawInput);
    const concurrency = parseViewerConcurrency(view.batchConcurrencyInput.value);
    const limit = Number(view.historyLimitInput.value);
    const updateProgress = openBatch(inputs.length, "Mixed batch");
    const errorLabel = (input: ViewerBatchInput, mode?: ViewerMode): string => {
      const number = batchInputNumber(input.id);
      if (
        mode === "shielded" ||
        (mode === undefined && dependencies.looksLikeAutoOrchardInput(input.value))
      ) {
        return `${number} · ORCHARD · viewing key`;
      }
      if (mode === undefined) return `${number} · AUTO · line ${input.line}`;
      return `${number} · ${mode.toUpperCase()} · ${compactActivityLabel(input.value)}`;
    };
    const addError = (input: ViewerBatchInput, cause: unknown, mode?: ViewerMode): void => {
      const resolvedMode =
        mode ?? (dependencies.looksLikeAutoOrchardInput(input.value) ? "shielded" : undefined);
      batchErrors.push({
        id: input.id,
        label: errorLabel(input, resolvedMode),
        message: errorMessage(cause),
        ...(resolvedMode === undefined ? {} : { mode: resolvedMode }),
      });
    };
    const detectedInputs: Array<{ input: ViewerBatchInput; detected: DetectedViewerInput }> = [];
    const identityLookups = new Map<
      string,
      ReturnType<typeof dependencies.normalizeIdentityLookupInput>
    >();
    const preparedOrchard: Array<{
      input: ViewerBatchInput;
      detected: DetectedViewerInput;
      key: OrchardViewingCapability;
      ledger: ShieldedActivityLedger;
    }> = [];

    try {
      for (const input of inputs) {
        let key: OrchardViewingCapability | null = null;
        let detected: DetectedViewerInput | null = null;
        try {
          detected = dependencies.detectViewerInput(input.value, network);
          if (detected.mode === "identity") {
            identityLookups.set(
              input.id,
              dependencies.normalizeIdentityLookupInput(detected.value),
            );
          } else if (detected.mode === "shielded") {
            key = viewingKeyOf(detected.value, detected.viewingKeyMode, network);
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
          if (key !== null) key.dispose();
          if (isPrivateMaterialError(cause)) throw cause;
          addError(input, cause, detected?.mode);
          updateProgress(`line ${input.line} rejected locally`);
        }
      }

      const publicInputs = detectedInputs.filter(({ detected }) => detected.mode !== "shielded");
      const needs = (mode: ViewerMode): boolean =>
        publicInputs.some(({ detected }) => detected.mode === mode);
      // A source that cannot connect fails only the inputs that need it.
      const platform = await sourceFor(
        needs("platform"),
        () => new dependencies.DashPlatformAddressSource(network),
        "Platform address source",
      );
      const identity = await sourceFor(
        needs("identity"),
        () => new dependencies.DashPlatformIdentitySource(network),
        "Platform Identity source",
      );

      const publicSettled = await mapViewerBatchTasks(
        publicInputs,
        concurrency,
        async ({ input, detected }): Promise<ViewerSingleExportState> => {
          if (isCancellationRequested())
            throw new DOMException("Mixed batch cancelled.", "AbortError");
          if (detected.mode === "core") {
            return queryCoreBatchItem(
              detected.value,
              queryOptions(network, limit, () =>
                updateProgress(`core line ${input.line} finished`),
              ),
            );
          }
          if (detected.mode === "platform") {
            return queryPlatformBatchItem(
              detected.value,
              platform(),
              queryOptions(network, limit, () =>
                updateProgress(`platform line ${input.line} finished`),
              ),
            );
          }
          const lookup = identityLookups.get(input.id);
          if (lookup === undefined) throw new Error("Normalized Identity input is unavailable.");
          return queryIdentityBatchItem(
            lookup,
            identity(),
            queryOptions(network, limit, () =>
              updateProgress(`identity line ${input.line} finished`),
            ),
          );
        },
      );

      publicSettled.forEach((result, index) => {
        const item = publicInputs[index];
        if (item === undefined) return;
        if (result.status === "fulfilled") addItem(item.input, result.value);
        else {
          addError(item.input, result.reason, item.detected.mode);
        }
      });

      if (preparedOrchard.length > 0) {
        try {
          const { complete, failed } = await scanOrchardTogether(preparedOrchard, network, {
            connecting: `Connecting once to scan Orchard for ${preparedOrchard.length.toLocaleString()} detected viewing key(s)…`,
            failedKey: (item, cause) => {
              addError(item.input, cause, "shielded");
              updateProgress(`Orchard line ${item.input.line} failed`);
            },
          });
          for (const item of preparedOrchard) {
            if (failed.has(item.input.id)) continue;
            addItem(item.input, {
              mode: "shielded",
              network,
              snapshot: item.ledger.snapshot(complete),
            });
            updateProgress(`Orchard line ${item.input.line} finished`);
          }
        } catch (cause) {
          if (isCancellationRequested()) throw cause;
          // Keys that failed on their own were reported already; the others fail with the scan.
          for (const item of preparedOrchard) {
            if (batchErrors.some(({ id }) => id === item.input.id)) continue;
            addError(item.input, cause, "shielded");
            updateProgress(`Orchard line ${item.input.line} failed`);
          }
        }
      }

      if (isCancellationRequested()) throw new DOMException("Mixed batch cancelled.", "AbortError");
      publishBatch("mixed", network, "Mixed batch");

      const modes = [...new Set(batchItems.map(({ state }) => state.mode))];
      const coreHeights = batchItems.flatMap(({ state }) =>
        state.mode === "core" ? [state.snapshot.indexedHeight] : [],
      );
      const dapiHeights = batchItems.flatMap(({ state }) => {
        if (state.mode === "platform") return [state.snapshot.proofHeight];
        if (state.mode === "identity") return state.snapshot.proofs.map(({ height }) => height);
        if (state.mode === "shielded") return [state.snapshot.proofHeight];
        return [];
      });
      const proofParts: string[] = [];
      if (coreHeights.length > 0)
        proofParts.push(`Core ${Math.max(...coreHeights).toLocaleString()}`);
      if (dapiHeights.length > 0) {
        const dapiHeight = dapiHeights.reduce(
          (highest, height) => (height > highest ? height : highest),
          0n,
        );
        proofParts.push(`DAPI ${dapiHeight}`);
      }
      const remoteTimes = batchItems
        .flatMap(({ state }) => {
          if (state.mode === "core") return [state.snapshot.indexedTimeMs];
          if (state.mode === "platform") return [state.history.indexedTimeMs];
          if (state.mode === "identity") {
            return state.snapshot.proofs.map(({ responseTimeMs }) => Number(responseTimeMs));
          }
          return [];
        })
        .filter((value) => Number.isFinite(value) && value > 0);
      view.setDiagnosticMode(modes.length > 1 ? "mixed" : modes[0]!, network);
      const sourceLabels: Record<ViewerMode, string> = {
        core: "DashScan",
        platform: "Platform address proof/index",
        identity: "Identity proof/index",
        shielded: "Orchard proof/local scan",
      };
      view.setDiagnosticSource(modes.map((mode) => sourceLabels[mode]).join(" + "));
      view.setDiagnosticProof(proofParts.join(" · "));
      if (remoteTimes.length > 0) view.setDiagnosticRemoteTime(Math.max(...remoteTimes));
      view.setStatus(
        `Mixed batch complete: ${batchItems.length.toLocaleString()} succeeded, ${batchErrors.length.toLocaleString()} failed.`,
      );
      view.finishDiagnostics(
        `Detected ${modes.length.toLocaleString()} input type(s) locally and used bounded public-query concurrency ${concurrency}. Orchard viewing keys never left this page.`,
      );
    } finally {
      for (const { key } of preparedOrchard) key.dispose();
    }
  }

  async function runBatch(network: ViewerNetwork, viewerMode: ViewerMode): Promise<void> {
    const rawInput = view.batchInput.value;
    if (viewerMode !== "shielded") dependencies.assertPublicBatchLookupInput(rawInput);
    const inputs = parseViewerBatchInputs(rawInput);
    const concurrency = parseViewerConcurrency(view.batchConcurrencyInput.value);
    const limit = Number(view.historyLimitInput.value);
    const updateProgress = openBatch(inputs.length, "Batch");
    const errorLabel = (input: ViewerBatchInput): string => {
      const number = batchInputNumber(input.id);
      if (viewerMode === "shielded") return `${number} · viewing key`;
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
    if (viewerMode === "core") {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      view.setDiagnosticDetail(
        `Validated ${inputs.length.toLocaleString()} public Core address input(s) locally before networking.`,
      );
      settled = await mapViewerBatchTasks(inputs, concurrency, (input) =>
        queryCoreBatchItem(
          input.value,
          queryOptions(network, limit, () => updateProgress(`Core line ${input.line} finished`)),
        ),
      );
      view.setDiagnosticSource("DashScan Core API");
    } else if (viewerMode === "platform") {
      for (const input of inputs) dependencies.assertPublicLookupInput(input.value);
      taskInputs = inputs;
      const source = new dependencies.DashPlatformAddressSource(network);
      view.setStatus(
        `Connecting once for ${inputs.length.toLocaleString()} Platform address lookup(s)…`,
      );
      await connectOnce(source);
      view.setDiagnosticDetail(
        `Validated all public inputs before opening DAPI; running up to ${concurrency} address lookup(s) at once.`,
      );
      settled = await mapViewerBatchTasks(inputs, concurrency, (input) =>
        queryPlatformBatchItem(
          input.value,
          source,
          queryOptions(network, limit, () =>
            updateProgress(`Platform line ${input.line} finished`),
          ),
        ),
      );
      view.setDiagnosticSource("Proof DAPI + Dash Platform Explorer");
    } else if (viewerMode === "identity") {
      const normalized = new Map<
        string,
        ReturnType<typeof dependencies.normalizeIdentityLookupInput>
      >();
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
        view.setStatus(
          `Connecting once for ${taskInputs.length.toLocaleString()} valid Identity lookup(s)…`,
        );
        await connectOnce(source);
        view.setDiagnosticDetail(
          `All Identity inputs were checked locally before DAPI; running up to ${concurrency} lookup(s) at once.`,
        );
        settled = await mapViewerBatchTasks(taskInputs, concurrency, (input) => {
          const lookup = normalized.get(input.id);
          if (lookup === undefined) throw new Error("Normalized Identity input is unavailable.");
          return queryIdentityBatchItem(
            lookup,
            source,
            queryOptions(network, limit, () =>
              updateProgress(`Identity line ${input.line} finished`),
            ),
          );
        });
      }
      view.setDiagnosticSource("Proof DAPI + Dash Platform Explorer");
    } else {
      const prepared: PreparedOrchardKey[] = [];
      for (const input of inputs) {
        let key: OrchardViewingCapability | null = null;
        try {
          key = viewingKeyOf(
            input.value,
            view.keyCapabilityInput.value as ViewingKeyInputMode,
            network,
          );
          prepared.push({ input, key, ledger: new dependencies.ShieldedActivityLedger(key.kind) });
          key = null;
        } catch (cause) {
          addPreflightError(input, cause);
        } finally {
          key?.dispose();
        }
      }
      taskInputs = prepared.map(({ input }) => input);
      if (prepared.length > 0) {
        try {
          const { complete, failed } = await scanOrchardTogether(prepared, network, {
            connecting: `Connecting once to scan the Orchard pool for ${prepared.length.toLocaleString()} viewing key(s)…`,
            connected: () =>
              view.setDiagnosticDetail(
                "Every viewing key was validated locally. Verified encrypted pool pages are fetched once and reused across the batch.",
              ),
            onPage: (page) => {
              view.setDiagnosticProof(`${page.proofHeight} · protocol ${page.protocolVersion}`);
              view.setDiagnosticRemoteTime(page.timeMs);
            },
            failedKey: (item, cause) =>
              batchErrors.push({
                id: item.input.id,
                label: errorLabel(item.input),
                message: errorMessage(cause),
                mode: viewerMode,
              }),
          });
          const scanned = prepared.filter(({ input }) => !failed.has(input.id));
          settled = scanned.map(({ ledger }): PromiseFulfilledResult<ViewerSingleExportState> => ({
            status: "fulfilled",
            value: { mode: "shielded", network, snapshot: ledger.snapshot(complete) },
          }));
          taskInputs = scanned.map(({ input }) => input);
          updateProgress("shared Orchard scan finished", scanned.length);
        } finally {
          for (const { key } of prepared) key.dispose();
        }
      }
      view.setDiagnosticSource("Dash Platform DAPI proof + local Orchard recovery");
    }

    if (isCancellationRequested()) throw new DOMException("Batch query cancelled.", "AbortError");
    settled.forEach((result, index) => {
      const input = taskInputs[index];
      if (input === undefined) return;
      if (result.status === "fulfilled") addItem(input, result.value);
      else {
        batchErrors.push({
          id: input.id,
          label: errorLabel(input),
          message: errorMessage(result.reason),
          mode: viewerMode,
        });
      }
    });
    publishBatch(viewerMode, network, "Batch");
    if (viewerMode === "core") {
      const snapshots = batchItems.flatMap(({ state }) =>
        state.mode === "core" ? [state.snapshot] : [],
      );
      view.setDiagnosticProof(
        `DashScan Core height ${Math.max(...snapshots.map(({ indexedHeight }) => indexedHeight)).toLocaleString()}`,
      );
      view.setDiagnosticRemoteTime(
        Math.max(...snapshots.map(({ indexedTimeMs }) => indexedTimeMs)),
      );
    } else if (viewerMode === "platform") {
      const states = batchItems.flatMap(({ state }) => (state.mode === "platform" ? [state] : []));
      const dapiHeight = states.reduce(
        (highest, { snapshot }) =>
          snapshot.proofHeight > highest ? snapshot.proofHeight : highest,
        0n,
      );
      const explorerHeight = Math.max(...states.map(({ history }) => history.indexedHeight));
      view.setDiagnosticProof(`DAPI ${dapiHeight} · Explorer ${explorerHeight.toLocaleString()}`);
      view.setDiagnosticRemoteTime(Math.max(...states.map(({ history }) => history.indexedTimeMs)));
    } else if (viewerMode === "identity") {
      const states = batchItems.flatMap(({ state }) => (state.mode === "identity" ? [state] : []));
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
      const proofTimes = states.flatMap(({ snapshot }) =>
        snapshot.proofs.map(({ responseTimeMs }) => responseTimeMs),
      );
      view.setDiagnosticRemoteTime(
        proofTimes.reduce((latest, value) => (value > latest ? value : latest), 0n),
      );
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
