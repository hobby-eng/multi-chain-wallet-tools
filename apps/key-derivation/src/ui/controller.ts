import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode, ResultField } from '@ckd/core/types.js';
import {
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
  type ExportAction,
  type ExportFormat,
} from '@ckd/export/formatter.js';
import {
  readControls,
  type DerivationControlValues,
} from './inputs.js';
import {
  createBranchResultState,
  planResultBranches,
  type BranchResultState,
  type ResultBranch,
} from './result-branches.js';
import { clearDerivationResult } from './secrets.js';
import { invertSelection, selectAll, selectNone } from './selection.js';
import { DerivationCancelledError, DerivationWorkerClient } from '../workers/derive-client.js';
import type { KeyDerivationView } from './view.js';

const BASIC_WINDOW_SIZE = 200;
const ADVANCED_WINDOW_SIZE = 24;
const LARGE_REQUEST_CONFIRM_THRESHOLD = 10_000;
// The download path streams row-sized chunks, but the clipboard needs one
// contiguous string. Refuse past the point where building it would risk the tab
// rather than letting the copy fail as an out-of-memory crash.
const CLIPBOARD_VALUE_LIMIT = 200_000;

interface KeyDerivationDependencies {
  coinFamilies: typeof import('@ckd/coins/registry.js').COIN_FAMILIES;
  getAdapterFamilyId: typeof import('@ckd/coins/registry.js').getAdapterFamilyId;
  getCoinAdapter: typeof import('@ckd/coins/registry.js').getCoinAdapter;
  getDefaultCoinAdapter: typeof import('@ckd/coins/registry.js').getDefaultCoinAdapter;
  buildInfo: typeof import('@ckd/build-info').BUILD_INFO;
  generateMnemonic: typeof import('@ckd/core/bip39.js').generateMnemonic;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  runBip39SelfTest: typeof import('@ckd/bip39-self-test').runBip39SelfTest;
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard;
  downloadBlob: typeof import('@ckd/export/download.js').downloadBlob;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
  createWorker(): DerivationWorkerClient;
}

export function createKeyDerivationController(
  view: KeyDerivationView,
  dependencies: KeyDerivationDependencies,
) {
  return {
    start(): void {
      const {
        coinFamilies,
        getAdapterFamilyId,
        getCoinAdapter,
        getDefaultCoinAdapter,
        buildInfo,
        generateMnemonic,
        mnemonicToSeed,
        runBip39SelfTest,
        writeClipboard,
        downloadBlob,
        downloadText,
        createWorker,
      } = dependencies;
      const {
        document,
        controls,
        form,
        mnemonic,
        passphrase,
        exportFormat,
        modeBasic,
        modeAdvanced,
        resultReceiveTab,
        resultChangeTab,
        toggleSensitiveValues,
        copyMnemonicButton,
        copyWatchOnlyButton,
        downloadWatchOnlyButton,
        cancelDerivationButton,
        expectedAddress,
        searchStart,
        searchCount,
        searchAddressButton,
        generate12Button,
        generate24Button,
        clearAllButton,
        selectAllButton,
        selectNoneButton,
        selectInvertButton,
        showError,
        showStatus,
        clearMessages,
      } = view;
let adapter: CoinAdapter;
let currentResult: DerivationResult | null = null;
let selected = new Set<number>();
let activeResultBranch: ResultBranch = 'receive';
const branchResultStates = new Map<ResultBranch, BranchResultState>();
let displayMode: DisplayMode = 'basic';
let sensitiveValuesRevealed = false;
let derivationRevision = 0;
let derivationsInFlight = 0;
let cancellationRequested = false;
let resultWindowStart = 0;
let activeDerivationWorker: DerivationWorkerClient | null = null;
let cryptoReady = false;
let pendingLargeRequestFingerprint: string | null = null;
let pendingAutomaticDerivation: number | null = null;
const lastVariantByCoin = new Map<string, string>();
const settingsByAdapter = new Map<string, DerivationControlValues>();
const includeChangeByCoin = new Map<string, boolean>();

function updateWordCount(): void {
  view.updateWordCount(sensitiveValuesRevealed);
}

function mnemonicMayBeComplete(): boolean {
  const count = mnemonic.value.trim() === '' ? 0 : mnemonic.value.trim().split(/\s+/u).length;
  return count === 12 || count === 24;
}

function stopActiveDerivation(message = 'Derivation superseded by a new request.'): void {
  activeDerivationWorker?.terminate(new DerivationCancelledError(message));
  activeDerivationWorker = null;
}

function clearResults(): void {
  view.clearResults(currentResult, branchResultStates);
  branchResultStates.clear();
  currentResult = null;
  selected = new Set();
  activeResultBranch = 'receive';
  resultWindowStart = 0;
  updateBulkActions();
}

function updateResultBranchTabs(): void {
  view.updateResultBranchTabs(currentResult, branchResultStates, activeResultBranch);
}

function activateResultBranch(branch: ResultBranch, render = true): void {
  const state = branchResultStates.get(branch);
  if (state === undefined) return;
  activeResultBranch = branch;
  currentResult = state.result;
  selected = state.selected;
  resultWindowStart = state.windowStart;
  updateResultBranchTabs();
  if (render) renderCurrent();
}

function setActiveWindowStart(start: number): void {
  resultWindowStart = start;
  const state = branchResultStates.get(activeResultBranch);
  if (state !== undefined) state.windowStart = start;
}

function replaceActiveSelection(next: Set<number>): void {
  selected = next;
  const state = branchResultStates.get(activeResultBranch);
  if (state !== undefined) state.selected = next;
}

function updateModeButtons(): void {
  view.updateMode(displayMode);
}

function currentRenderOptions() {
  return {
    mode: displayMode,
    selected,
    secretsRevealed: sensitiveValuesRevealed,
    windowStart: resultWindowStart,
    windowSize: displayMode === 'basic' ? BASIC_WINDOW_SIZE : ADVANCED_WINDOW_SIZE,
    onWindowChange(start: number) {
      setActiveWindowStart(start);
      renderCurrent();
      view.scrollResultWindowIntoView();
    },
    onSelectionChange(index: number, checked: boolean) {
      if (checked) selected.add(index);
      else selected.delete(index);
      updateBulkActions();
    },
  };
}

function renderCurrent(): void {
  if (currentResult === null) return;
  view.renderCurrent(
    currentResult,
    currentRenderOptions(),
    branchResultStates,
    activeResultBranch,
    adapter,
    sensitiveValuesRevealed,
  );
}

function updateBulkActions(): void {
  view.updateBulkActions(currentResult, selected, adapter, displayMode, sensitiveValuesRevealed);
}

function sensitiveField(scope: 'summary' | 'row', fieldKey: string, rowIndex?: number): ResultField | undefined {
  if (currentResult === null) return undefined;
  if (scope === 'summary') {
    return [...currentResult.basicSummary, ...currentResult.summary].find((field) => field.key === fieldKey);
  }
  const row = currentResult.rows.find((candidate) => candidate.index === rowIndex);
  return row === undefined ? undefined : [...row.basic, ...row.advanced].find((field) => field.key === fieldKey);
}

async function copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void> {
  if (containsSecret && !sensitiveValuesRevealed) {
    showError('Reveal private and privacy-sensitive values before copying them.');
    return;
  }
  let temporary = text;
  try {
    await writeClipboard(temporary);
    view.flashCopied(button);
    showStatus(containsSecret ? 'Sensitive values copied. Clear your clipboard when finished.' : 'Copied to clipboard.');
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Clipboard access failed.');
  } finally {
    temporary = '';
  }
}

async function copyBulk(button: HTMLButtonElement, action: ExportAction): Promise<void> {
  if (currentResult === null) return;
  if (selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const format = exportFormat.value as ExportFormat;
  const inspection = inspectSelectedRows(adapter, currentResult, selected, displayMode, action);
  if (inspection.valueCount === 0) {
    showError('That field type does not apply to the selected protocol and display mode.');
    return;
  }
  if (inspection.valueCount > CLIPBOARD_VALUE_LIMIT) {
    showError(
      `That selection holds ${inspection.valueCount.toLocaleString()} values, more than the clipboard can assemble safely. `
      + 'Use Download selected instead: it streams the same rows to a file.',
    );
    return;
  }
  const output = formatSelectedRows(adapter, currentResult, selected, displayMode, action, format);
  await copyText(button, output.text, output.containsSecret);
}

async function downloadSelectedRows(button: HTMLButtonElement, action: ExportAction): Promise<void> {
  if (currentResult === null || selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const format = exportFormat.value as ExportFormat;
  const inspection = inspectSelectedRows(adapter, currentResult, selected, displayMode, action);
  if (inspection.valueCount === 0) {
    showError('That field type does not apply to the selected protocol and display mode.');
    return;
  }
  if (inspection.containsSecret && !sensitiveValuesRevealed) {
    showError('Reveal private and privacy-sensitive values before exporting them.');
    return;
  }

  view.setDownloadPreparing(button, true);
  try {
    const chunks = iterateSelectedRows(adapter, currentResult, selected, displayMode, action, format);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });
    const mime = format === 'tsv' ? 'text/tab-separated-values' : 'text/plain';
    const blob = await new Response(stream, { headers: { 'Content-Type': `${mime};charset=utf-8` } }).blob();
    const extension = format === 'tsv' ? 'tsv' : 'txt';
    const fileName = `${currentResult.id}-${displayMode}-${inspection.rowCount}-rows.${extension}`;
    downloadBlob(blob, fileName);
    showStatus(`Streamed ${inspection.rowCount.toLocaleString()} selected rows into ${fileName}.`);
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Export download failed.');
  } finally {
    view.setDownloadPreparing(button, false);
    updateBulkActions();
  }
}

function setSensitiveValuesVisibility(revealed: boolean): void {
  sensitiveValuesRevealed = revealed;
  view.setSensitiveValuesVisibility(revealed);
  updateBulkActions();
}

function cancelAutomaticDerivation(): void {
  if (pendingAutomaticDerivation === null) return;
  window.clearTimeout(pendingAutomaticDerivation);
  pendingAutomaticDerivation = null;
}

function scheduleAutomaticDerivation(): void {
  cancelAutomaticDerivation();
  if (!cryptoReady || !mnemonicMayBeComplete()) return;
  pendingAutomaticDerivation = window.setTimeout(() => {
    pendingAutomaticDerivation = null;
    if (cryptoReady && mnemonicMayBeComplete()) void deriveCurrent(true);
  }, 350);
}

function rememberCurrentSettings(): void {
  try {
    const values = readControls(adapter, controls);
    settingsByAdapter.set(adapter.id, values);
    if (adapter.addressBranches !== undefined) {
      includeChangeByCoin.set(getAdapterFamilyId(adapter), values.includeChange);
    }
  } catch {
    // Invalid partially edited controls are not persisted across variants.
  }
}

function resetForAdapter(next: CoinAdapter, autoDerive = true): void {
  cancelAutomaticDerivation();
  rememberCurrentSettings();
  stopActiveDerivation();
  derivationRevision += 1;
  clearResults();
  pendingLargeRequestFingerprint = null;
  view.resetDeriveAction();
  adapter = next;
  lastVariantByCoin.set(getAdapterFamilyId(adapter), adapter.id);
  const remembered = settingsByAdapter.get(adapter.id);
  const includeChange = adapter.addressBranches === undefined
    ? false
    : includeChangeByCoin.get(getAdapterFamilyId(adapter)) ?? remembered?.includeChange ?? false;
  view.configureControls(adapter, remembered === undefined
    ? { ...adapter.defaults, includeChange }
    : { ...remembered, includeChange });
  clearMessages();
  view.hideSearchResult();
  if (autoDerive && mnemonicMayBeComplete()) void deriveCurrent(true);
}

view.populateCoinSelect();
const initialCoinFamily = coinFamilies[0]!;
adapter = getDefaultCoinAdapter(initialCoinFamily.id);
lastVariantByCoin.set(initialCoinFamily.id, adapter.id);
view.configureControls(adapter);
updateWordCount();
updateModeButtons();
updateBulkActions();

function populateBuildPassport(): void {
  view.populateBuildPassport(buildInfo);
}

function setCryptoControlsEnabled(enabled: boolean): void {
  view.setCryptoControlsEnabled(enabled);
}

async function initializeCryptoRuntime(): Promise<void> {
  setCryptoControlsEnabled(false);
  const worker = createWorker();
  try {
    const bip39Report = runBip39SelfTest();
    const workerReport = await worker.selfTest();
    const checks = [...bip39Report.checks, ...workerReport.checks];
    const durationMs = bip39Report.durationMs + workerReport.durationMs;
    cryptoReady = bip39Report.passed && workerReport.passed;
    view.showCryptoSelfTestPassed(checks, durationMs);
    setCryptoControlsEnabled(true);
    scheduleAutomaticDerivation();
  } catch (cause) {
    cryptoReady = false;
    view.showCryptoSelfTestFailed(cause);
    setCryptoControlsEnabled(false);
    showError('Cryptographic self-test failed. This build will not derive wallet keys.');
  } finally {
    worker.terminate(new DerivationCancelledError('Startup self-test worker released.'));
  }
}

populateBuildPassport();
void initializeCryptoRuntime();

/**
 * Yields between batches. requestAnimationFrame is deliberately not used: it
 * stops firing in a background tab, which silently stalls a long derivation at
 * exactly the moment the user switches away from it to wait.
 */
async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

const STREAM_RENDER_INTERVAL_MS = 120;
let lastStreamRenderAt = 0;

/**
 * Repainting the whole window and re-scanning every row for bulk-action state
 * after each 50-row batch is quadratic over a large request. Streaming batches
 * repaint at most every STREAM_RENDER_INTERVAL_MS; the final state is always
 * forced so the displayed result is never a stale frame.
 */
function renderStreamingProgress(force: boolean): void {
  const now = performance.now();
  if (!force && now - lastStreamRenderAt < STREAM_RENDER_INTERVAL_MS) return;
  lastStreamRenderAt = now;
  renderCurrent();
}

function largeRequestFingerprint(input: DerivationControlValues): string {
  return [adapter.id, input.network, input.account, input.branch, input.start, input.count, input.includeChange].join(':');
}

function approximateMemoryRange(count: number): string {
  const lowMiB = Math.ceil((count * 4) / 1024);
  const highMiB = Math.ceil((count * 12) / 1024);
  return `roughly ${lowMiB.toLocaleString()}–${highMiB.toLocaleString()} MiB of result memory`;
}

function authorizeRequestedCount(input: DerivationControlValues, automatic: boolean): boolean {
  if (automatic && input.count > 20) {
    pendingLargeRequestFingerprint = null;
    showStatus(`Automatic generation was skipped because this tab remembers ${input.count.toLocaleString()} results. Click Derive manually to run the large request.`);
    return false;
  }
  const branchCount = input.includeChange && adapter.addressBranches !== undefined ? 2 : 1;
  const totalCount = input.count * branchCount;
  if (automatic || totalCount < LARGE_REQUEST_CONFIRM_THRESHOLD) {
    pendingLargeRequestFingerprint = null;
    return true;
  }
  const fingerprint = largeRequestFingerprint(input);
  if (pendingLargeRequestFingerprint === fingerprint) {
    pendingLargeRequestFingerprint = null;
    return true;
  }
  pendingLargeRequestFingerprint = fingerprint;
  const batches = Math.ceil(input.count / (adapter.batchSize ?? 50)) * branchCount;
  view.showLargeRequestConfirmation();
  showStatus(
    `Large request confirmation: ${totalCount.toLocaleString()} results across ${branchCount} address branch${branchCount === 1 ? '' : 'es'} in ${batches.toLocaleString()} visible batches; ${approximateMemoryRange(totalCount)}. ` +
    'Keep the tab open and click “Confirm large request” to proceed. You can cancel at any time.',
  );
  return false;
}

async function deriveCurrent(automatic = false): Promise<void> {
  cancelAutomaticDerivation();
  if (!cryptoReady) {
    showError('Cryptographic self-test has not completed successfully. Derivation is blocked.');
    return;
  }
  let input: DerivationControlValues;
  try {
    input = readControls(adapter, controls);
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Invalid derivation controls.');
    return;
  }
  if (!authorizeRequestedCount(input, automatic)) return;
  clearMessages();
  clearResults();
  cancellationRequested = false;
  view.showDerivationRunning();
  derivationsInFlight += 1;
  const revision = ++derivationRevision;
  const requestedAdapter = adapter;
  let seed: Uint8Array | null = null;
  const worker = createWorker();
  activeDerivationWorker = worker;
  try {
    settingsByAdapter.set(adapter.id, input);
    seed = mnemonicToSeed(mnemonic.value, passphrase.value);
    const { includeChange, ...baseInput } = input;
    const resultBranches = planResultBranches(requestedAdapter, baseInput.branch, includeChange);
    const totalRequested = input.count * resultBranches.length;
    const batchSize = requestedAdapter.batchSize ?? 50;
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new Error(`Adapter ${requestedAdapter.id} declares an invalid internal batch size.`);
    }
    if (totalRequested > 1000) {
      showStatus(`Large request: ${totalRequested.toLocaleString()} results will be generated and displayed in batches. Keep this tab open; you can cancel immediately.`);
    }
    let generatedTotal = 0;
    branchLoop: for (const { kind: resultBranch, branch } of resultBranches) {
      let destination: DerivationResult | null = null;
      let generated = 0;
      while (generated < input.count) {
        if (revision !== derivationRevision || requestedAdapter !== adapter) return;
        if (cancellationRequested) break branchLoop;
        const count = Math.min(batchSize, input.count - generated);
        const batch = await worker.derive(requestedAdapter.id, {
          ...baseInput,
          branch,
          seed,
          start: input.start + generated,
          count,
        });
        if (revision !== derivationRevision || requestedAdapter !== adapter) {
          clearDerivationResult(batch);
          return;
        }
        if (destination === null) {
          destination = batch;
          const state = createBranchResultState(destination);
          branchResultStates.set(resultBranch, state);
          view.showResults();
          if (currentResult === null) activateResultBranch(resultBranch, false);
          updateResultBranchTabs();
          if (activeResultBranch === resultBranch) renderStreamingProgress(true);
        } else {
          if (batch.id !== destination.id || batch.rows.length !== count) {
            clearDerivationResult(batch);
            throw new Error('The derivation adapter returned an inconsistent streamed batch.');
          }
          const appended = batch.rows.splice(0);
          destination.rows.push(...appended);
          const state = branchResultStates.get(resultBranch);
          if (state === undefined) {
            clearDerivationResult(batch);
            throw new Error('The result branch state was lost during streamed derivation.');
          }
          for (const row of appended) state.selected.add(row.index);
          clearDerivationResult(batch);
          if (activeResultBranch === resultBranch) renderStreamingProgress(false);
        }
        generated += count;
        generatedTotal += count;
        const branchProgress = requestedAdapter.addressBranches === undefined
          ? ''
          : ` ${resultBranch} branch ${generated.toLocaleString()} of ${input.count.toLocaleString()};`;
        showStatus(`Derived${branchProgress} ${generatedTotal.toLocaleString()} of ${totalRequested.toLocaleString()} total results for ${requestedAdapter.variantLabel}.`);
        if (generated < input.count) await yieldToBrowser();
      }
    }
    if (currentResult !== null) renderStreamingProgress(true);
    updateBulkActions();
    if (cancellationRequested) {
      showStatus(`Generation cancelled after ${generatedTotal.toLocaleString()} of ${totalRequested.toLocaleString()} results. Displayed partial branches remain available.`);
    } else if (automatic) {
      showStatus(`Automatically derived ${generatedTotal.toLocaleString()} results for ${requestedAdapter.variantLabel}.`);
    } else {
      showStatus(`Derived ${generatedTotal.toLocaleString()} results for ${requestedAdapter.variantLabel}.`);
    }
    if (!automatic) view.scrollResultsIntoView();
  } catch (cause) {
    if (revision !== derivationRevision) return;
    if (cause instanceof DerivationCancelledError && cancellationRequested) {
      if (branchResultStates.size === 0) clearResults();
      const generated = [...branchResultStates.values()].reduce((sum, state) => sum + state.result.rows.length, 0);
      showStatus(`Generation cancelled after ${generated.toLocaleString()} results. The worker stopped immediately; displayed results remain available.`);
      return;
    }
    if (branchResultStates.size === 0) clearResults();
    const message = cause instanceof Error ? cause.message : String(cause);
    showError(message || 'Derivation failed.');
  } finally {
    worker.terminate(new DerivationCancelledError('Derivation worker released.'));
    if (activeDerivationWorker === worker) activeDerivationWorker = null;
    seed?.fill(0);
    seed = null;
    derivationsInFlight -= 1;
    if (derivationsInFlight === 0) {
      view.showDerivationIdle(cryptoReady);
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  cancelAutomaticDerivation();
  void deriveCurrent(false);
});

controls.coin.addEventListener('change', () => {
  const remembered = lastVariantByCoin.get(controls.coin.value);
  resetForAdapter(remembered === undefined
    ? getDefaultCoinAdapter(controls.coin.value)
    : getCoinAdapter(remembered));
});
controls.protocolTabs.addEventListener('click', (event) => {
  const id = view.protocolAdapterIdFrom(event.target);
  if (id === undefined || id === adapter.id) return;
  resetForAdapter(getCoinAdapter(id));
  view.focusProtocolButton(id);
});
controls.protocolTabs.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const adapterIds = view.protocolAdapterIds();
  const current = adapterIds.indexOf(adapter.id);
  if (current < 0 || adapterIds.length === 0) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? adapterIds.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + adapterIds.length) % adapterIds.length;
  const id = adapterIds[nextIndex];
  if (id === undefined) return;
  resetForAdapter(getCoinAdapter(id));
  view.focusProtocolButton(id);
});
for (const control of [controls.network, controls.account, controls.branchInput, controls.branchSelect, controls.includeChange, controls.start, controls.count]) {
  control.addEventListener('input', () => {
    stopActiveDerivation();
    derivationRevision += 1;
    if (currentResult !== null) clearResults();
    view.updatePathPreview(adapter);
    rememberCurrentSettings();
    pendingLargeRequestFingerprint = null;
    view.resetDeriveAction();
    if (control === controls.includeChange) scheduleAutomaticDerivation();
  });
}
for (const input of [mnemonic, passphrase]) {
  input.addEventListener('input', () => {
    stopActiveDerivation();
    derivationRevision += 1;
    if (currentResult !== null) clearResults();
    if (input === mnemonic) updateWordCount();
    pendingLargeRequestFingerprint = null;
    view.resetDeriveAction();
    scheduleAutomaticDerivation();
  });
}

toggleSensitiveValues.addEventListener('click', () => setSensitiveValuesVisibility(!sensitiveValuesRevealed));
for (const [words, generateButton] of [[12, generate12Button], [24, generate24Button]] as const) {
  generateButton.addEventListener('click', () => {
    cancelAutomaticDerivation();
    derivationRevision += 1;
    clearResults();
    clearMessages();
    try {
      view.setGeneratedMnemonic(generateMnemonic(words));
      rememberCurrentSettings();
      updateWordCount();
      showStatus(`Generated a new ${words}-word BIP39 recovery phrase using crypto.getRandomValues(). Deriving 20 results…`);
      void deriveCurrent(true);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Secure phrase generation failed.');
    }
  });
}

clearAllButton.addEventListener('click', () => {
  cancellationRequested = true;
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation cleared by the user.');
  derivationRevision += 1;
  pendingLargeRequestFingerprint = null;
  // Browser strings are immutable, so this only releases DOM references; mutable seed bytes are zeroed separately.
  clearResults();
  settingsByAdapter.clear();
  includeChangeByCoin.clear();
  view.configureControls(adapter);
  setSensitiveValuesVisibility(false);
  clearMessages();
  view.clearAllInputs();
  updateWordCount();
});

function concealSensitiveValues(): void {
  if (sensitiveValuesRevealed) setSensitiveValuesVisibility(false);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') concealSensitiveValues();
});
window.addEventListener('blur', concealSensitiveValues);

modeBasic.addEventListener('click', () => {
  displayMode = 'basic';
  setActiveWindowStart(0);
  renderCurrent();
});
modeAdvanced.addEventListener('click', () => {
  displayMode = 'advanced';
  setActiveWindowStart(0);
  renderCurrent();
});

for (const [button, branch] of [[resultReceiveTab, 'receive'], [resultChangeTab, 'change']] as const) {
  button.addEventListener('click', () => activateResultBranch(branch));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'receive' : 'change';
    if (!view.resultBranchEnabled(next)) return;
    activateResultBranch(next);
    view.focusResultBranch(next);
  });
}

selectAllButton.addEventListener('click', () => {
  if (currentResult === null) return;
  replaceActiveSelection(selectAll(currentResult.rows.map((row) => row.index)));
  renderCurrent();
});
selectNoneButton.addEventListener('click', () => {
  replaceActiveSelection(selectNone());
  renderCurrent();
});
selectInvertButton.addEventListener('click', () => {
  if (currentResult === null) return;
  replaceActiveSelection(invertSelection(currentResult.rows.map((row) => row.index), selected));
  renderCurrent();
});

exportFormat.addEventListener('change', updateBulkActions);

copyMnemonicButton.addEventListener('click', () => {
  if (!sensitiveValuesRevealed || mnemonic.value.trim().length === 0) {
    showError('Reveal the recovery phrase before copying it.');
    return;
  }
  let temporary = mnemonic.value.trim();
  void (async () => {
    try {
      await writeClipboard(temporary);
      showStatus('Recovery phrase copied. Clear your clipboard immediately after use.');
      view.flashCopied(copyMnemonicButton);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Clipboard access failed.');
    } finally {
      temporary = '';
    }
  })();
});

copyWatchOnlyButton.addEventListener('click', () => {
  const watchOnly = currentResult?.watchOnly;
  if (watchOnly === undefined) return;
  void copyText(copyWatchOnlyButton, watchOnly.text, true);
});

downloadWatchOnlyButton.addEventListener('click', () => {
  const watchOnly = currentResult?.watchOnly;
  if (watchOnly === undefined) return;
  if (!sensitiveValuesRevealed) {
    showError('Reveal privacy-sensitive values before downloading a watch-only export.');
    return;
  }
  downloadText(watchOnly.text, watchOnly.fileName, watchOnly.mimeType);
  showStatus(`Created ${watchOnly.fileName}. Treat it as private wallet metadata even though it cannot spend.`);
});

cancelDerivationButton.addEventListener('click', () => {
  cancellationRequested = true;
  stopActiveDerivation('Derivation cancelled by the user.');
  view.showCancellationRequested();
  showStatus('Generation worker stopped. Already displayed results are kept.');
});

searchAddressButton.addEventListener('click', () => {
  void (async () => {
    clearMessages();
    view.hideSearchResult();
    view.setSearchRunning(true);
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      const input = readControls(adapter, controls);
      const { includeChange, ...baseInput } = input;
      const start = Number(searchStart.value);
      const count = Number(searchCount.value);
      seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      worker = createWorker();
      const branches = planResultBranches(adapter, baseInput.branch, includeChange);
      let match: Awaited<ReturnType<DerivationWorkerClient['search']>> = null;
      let matchedBranch: ResultBranch = 'receive';
      for (const candidate of branches) {
        match = await worker.search(
          adapter.id,
          { seed, network: baseInput.network, account: baseInput.account, branch: candidate.branch },
          expectedAddress.value,
          start,
          count,
        );
        if (match !== null) {
          matchedBranch = candidate.kind;
          break;
        }
      }
      const scope = branches.length === 2 ? 'receive and change branches' : 'the selected derivation branch';
      const message = match === null
        ? `Not found in indices ${start}…${start + count - 1} across ${scope}.`
        : `Match found in the ${matchedBranch} branch at index ${match.index}: ${match.path}`;
      view.showSearchResult(message, match !== null);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Address search failed.');
    } finally {
      worker?.terminate(new DerivationCancelledError('Address-search worker released.'));
      seed?.fill(0);
      seed = null;
      view.setSearchRunning(false);
    }
  })();
});

document.addEventListener('click', (event) => {
  const action = view.documentActionFrom(event.target);
  if (action === null) return;
  if (action.kind === 'bulk') {
    void copyBulk(action.button, action.action);
    return;
  }
  if (action.kind === 'download') {
    void downloadSelectedRows(action.button, action.action);
    return;
  }
  const field = sensitiveField(action.scope, action.fieldKey, action.rowIndex);
  if (field === undefined) {
    showError('The requested field is no longer available.');
    return;
  }
  void copyText(action.button, field.value, field.secret);
});
    },
  };
}
