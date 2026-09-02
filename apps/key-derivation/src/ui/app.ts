import {
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getDefaultCoinAdapter,
  type CoinAdapter,
} from '@ckd/coins/registry.js';
import { BUILD_INFO } from '@ckd/build-info';
import { generateMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { runBip39SelfTest } from '@ckd/bip39-self-test';
import type { DerivationResult, DisplayMode, ResultField } from '@ckd/core/types.js';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { downloadBlob, downloadText } from '@ckd/export/download.js';
import {
  displayedFields,
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
  type ExportAction,
  type ExportFormat,
} from '@ckd/export/formatter.js';
import {
  configureControls,
  populateCoinSelect,
  readControls,
  updatePathPreview,
  type DerivationControls,
  type DerivationControlValues,
} from './inputs.js';
import { renderResults, updateSecretVisibility } from './results.js';
import {
  createBranchResultState,
  planResultBranches,
  type BranchResultState,
  type ResultBranch,
} from './result-branches.js';
import { clearDerivationResult, clearRenderedSecrets } from './secrets.js';
import { invertSelection, selectAll, selectNone } from './selection.js';
import { DerivationCancelledError, DerivationWorkerClient } from '../workers/derive-client.js';

function required<T extends Element>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (match === null) throw new Error(`Application template is missing ${selector}.`);
  return match;
}

const form = required<HTMLFormElement>('#derive-form');
const mnemonic = required<HTMLTextAreaElement>('#mnemonic');
const passphrase = required<HTMLInputElement>('#passphrase');
const wordCount = required<HTMLElement>('#word-count');
const errorRoot = required<HTMLElement>('#error');
const statusRoot = required<HTMLElement>('#status');
const deriveButton = required<HTMLButtonElement>('#derive-button');
const resultsRoot = required<HTMLElement>('#results');
const resultTitle = required<HTMLElement>('#result-title');
const summaryRoot = required<HTMLElement>('#summary');
const noticesRoot = required<HTMLElement>('#result-notices');
const listRoot = required<HTMLElement>('#address-list');
const selectedCount = required<HTMLElement>('#selected-count');
const exportFormat = required<HTMLSelectElement>('#export-format');
const modeBasic = required<HTMLButtonElement>('#mode-basic');
const modeAdvanced = required<HTMLButtonElement>('#mode-advanced');
const resultBranchTabs = required<HTMLElement>('#result-branch-tabs');
const resultReceiveTab = required<HTMLButtonElement>('#result-receive-tab');
const resultChangeTab = required<HTMLButtonElement>('#result-change-tab');
const branchResultContent = required<HTMLElement>('#branch-result-content');
const toggleSensitiveValues = required<HTMLButtonElement>('#toggle-sensitive-values');
const copyMnemonicButton = required<HTMLButtonElement>('#copy-mnemonic');
const copyWatchOnlyButton = required<HTMLButtonElement>('#copy-watch-only');
const downloadWatchOnlyButton = required<HTMLButtonElement>('#download-watch-only');
const watchOnlyPanel = required<HTMLElement>('#watch-only-export');
const watchOnlyDescription = required<HTMLElement>('#watch-only-description');
const cancelDerivationButton = required<HTMLButtonElement>('#cancel-derivation');
const expectedAddress = required<HTMLInputElement>('#expected-address');
const searchStart = required<HTMLInputElement>('#search-start');
const searchCount = required<HTMLInputElement>('#search-count');
const searchAddressButton = required<HTMLButtonElement>('#search-address');
const searchResult = required<HTMLElement>('#search-result');
// Startup assertion only: clicks are intentionally handled by the common
// data-download delegate, so no long-lived element variable is required.
required<HTMLButtonElement>('#download-selection');
const selfTestStatus = required<HTMLElement>('#crypto-self-test-status');
const selfTestDetails = required<HTMLElement>('#crypto-self-test-details');
const DERIVE_BUTTON_LABEL = 'Derive keys & addresses';
const BASIC_WINDOW_SIZE = 200;
const ADVANCED_WINDOW_SIZE = 24;
const LARGE_REQUEST_CONFIRM_THRESHOLD = 10_000;
// The download path streams row-sized chunks, but the clipboard needs one
// contiguous string. Refuse past the point where building it would risk the tab
// rather than letting the copy fail as an out-of-memory crash.
const CLIPBOARD_VALUE_LIMIT = 200_000;

const controls: DerivationControls = {
  coin: required<HTMLSelectElement>('#coin'),
  protocolTabs: required<HTMLElement>('#protocol-tabs'),
  network: required<HTMLSelectElement>('#network'),
  networkField: required<HTMLElement>('#network-field'),
  account: required<HTMLInputElement>('#account'),
  branchField: required<HTMLElement>('#branch-field'),
  branchLabel: required<HTMLLabelElement>('#branch-label'),
  branchInput: required<HTMLInputElement>('#branch-input'),
  branchSelect: required<HTMLSelectElement>('#branch-select'),
  changeField: required<HTMLElement>('#change-addresses-field'),
  includeChange: required<HTMLInputElement>('#include-change-addresses'),
  start: required<HTMLInputElement>('#start'),
  count: required<HTMLInputElement>('#count'),
  preview: required<HTMLElement>('#path-preview'),
};

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

function showError(message: string): void {
  statusRoot.hidden = true;
  errorRoot.textContent = message;
  errorRoot.hidden = false;
}

function showStatus(message: string): void {
  errorRoot.hidden = true;
  statusRoot.textContent = message;
  statusRoot.hidden = false;
}

function clearMessages(): void {
  errorRoot.textContent = '';
  errorRoot.hidden = true;
  statusRoot.textContent = '';
  statusRoot.hidden = true;
}

function updateWordCount(): void {
  const count = mnemonic.value.trim() === '' ? 0 : mnemonic.value.trim().split(/\s+/u).length;
  wordCount.textContent = `${count} word${count === 1 ? '' : 's'}`;
  copyMnemonicButton.disabled = !sensitiveValuesRevealed || mnemonic.value.trim().length === 0;
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
  clearRenderedSecrets(summaryRoot);
  clearRenderedSecrets(listRoot);
  noticesRoot.replaceChildren();
  const cleared = new Set<DerivationResult>();
  for (const { result } of branchResultStates.values()) {
    if (cleared.has(result)) continue;
    clearDerivationResult(result);
    cleared.add(result);
  }
  if (currentResult !== null && !cleared.has(currentResult)) clearDerivationResult(currentResult);
  branchResultStates.clear();
  currentResult = null;
  selected = new Set();
  activeResultBranch = 'receive';
  resultWindowStart = 0;
  resultBranchTabs.hidden = true;
  resultsRoot.classList.remove('revealed');
  resultsRoot.hidden = true;
  updateBulkActions();
}

function updateResultBranchTabs(): void {
  const hasChange = branchResultStates.has('change');
  resultBranchTabs.hidden = !hasChange;
  if (currentResult !== null) {
    const branchSuffix = hasChange
      ? activeResultBranch === 'receive' ? ' · Receive addresses' : ' · Change addresses'
      : '';
    resultTitle.textContent = `${currentResult.title}${branchSuffix}`;
  }
  for (const [button, branch] of [[resultReceiveTab, 'receive'], [resultChangeTab, 'change']] as const) {
    const active = activeResultBranch === branch;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    button.disabled = !branchResultStates.has(branch);
  }
  branchResultContent.setAttribute('aria-labelledby', activeResultBranch === 'receive' ? resultReceiveTab.id : resultChangeTab.id);
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
  const basic = displayMode === 'basic';
  document.body.classList.toggle('result-mode-basic', basic);
  document.body.classList.toggle('result-mode-advanced', !basic);
  resultsRoot.classList.toggle('mode-basic', basic);
  resultsRoot.classList.toggle('mode-advanced', !basic);
  modeBasic.classList.toggle('active', basic);
  modeBasic.setAttribute('aria-pressed', String(basic));
  modeAdvanced.classList.toggle('active', !basic);
  modeAdvanced.setAttribute('aria-pressed', String(!basic));
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
      listRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  clearRenderedSecrets(summaryRoot);
  clearRenderedSecrets(listRoot);
  renderResults(summaryRoot, listRoot, noticesRoot, currentResult, currentRenderOptions());
  updateSecretVisibility(resultsRoot, sensitiveValuesRevealed);
  updateModeButtons();
  updateResultBranchTabs();
  updateBulkActions();
}

function updateBulkActions(): void {
  selectedCount.textContent = String(selected.size);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-bulk],[data-download]')) {
    if (currentResult === null || selected.size === 0) {
      button.disabled = true;
      continue;
    }
    const action = (button.dataset.bulk ?? button.dataset.download) as ExportAction;
    let hasValue = false;
    let containsSecret = false;
    const roleKeys = action === 'addresses'
      ? adapter.fieldRoles.addresses
      : action === 'publicKeys'
        ? adapter.fieldRoles.publicKeys
        : action === 'privateKeys' ? adapter.fieldRoles.privateKeys : null;
    for (const row of currentResult.rows) {
      if (!selected.has(row.index)) continue;
      const fields = displayedFields(row, displayMode).filter((field) => roleKeys === null || roleKeys.includes(field.key));
      if (fields.length > 0) hasValue = true;
      if (fields.some(({ secret }) => secret)) containsSecret = true;
      if (hasValue && containsSecret) break;
    }
    button.disabled = !hasValue || (containsSecret && !sensitiveValuesRevealed);
  }
  required<HTMLButtonElement>('#select-all').disabled = currentResult === null;
  required<HTMLButtonElement>('#select-none').disabled = currentResult === null || selected.size === 0;
  required<HTMLButtonElement>('#select-invert').disabled = currentResult === null;
  const watchOnly = currentResult?.watchOnly;
  watchOnlyPanel.hidden = watchOnly === undefined;
  copyWatchOnlyButton.disabled = watchOnly === undefined || !sensitiveValuesRevealed;
  downloadWatchOnlyButton.disabled = watchOnly === undefined || !sensitiveValuesRevealed;
  if (watchOnly !== undefined) {
    watchOnlyDescription.textContent = watchOnly.description;
    copyWatchOnlyButton.textContent = watchOnly.label;
    copyWatchOnlyButton.title = sensitiveValuesRevealed
      ? watchOnly.description
      : `Reveal sensitive values first. ${watchOnly.description}`;
    downloadWatchOnlyButton.title = sensitiveValuesRevealed
      ? `Download ${watchOnly.fileName}`
      : `Reveal sensitive values before downloading ${watchOnly.fileName}.`;
  } else {
    watchOnlyDescription.textContent = '';
  }
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
    const previous = button.textContent;
    button.textContent = 'COPIED';
    showStatus(containsSecret ? 'Sensitive values copied. Clear your clipboard when finished.' : 'Copied to clipboard.');
    window.setTimeout(() => { button.textContent = previous; }, 900);
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Clipboard access failed.');
  } finally {
    temporary = '';
  }
}

async function copyBulk(button: HTMLButtonElement): Promise<void> {
  if (currentResult === null) return;
  if (selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const action = button.dataset.bulk as ExportAction;
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

async function downloadSelectedRows(button: HTMLButtonElement): Promise<void> {
  if (currentResult === null || selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const action = button.dataset.download as ExportAction;
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

  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'Preparing…';
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
    button.textContent = previous;
    updateBulkActions();
  }
}

function setSensitiveValuesVisibility(revealed: boolean): void {
  sensitiveValuesRevealed = revealed;
  mnemonic.classList.toggle('concealed', !revealed);
  passphrase.type = revealed ? 'text' : 'password';
  updateSecretVisibility(resultsRoot, revealed);
  toggleSensitiveValues.textContent = revealed ? 'Hide all sensitive values' : 'Reveal all sensitive values';
  toggleSensitiveValues.setAttribute('aria-pressed', String(revealed));
  copyMnemonicButton.disabled = !revealed || mnemonic.value.trim().length === 0;
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
  deriveButton.textContent = DERIVE_BUTTON_LABEL;
  adapter = next;
  lastVariantByCoin.set(getAdapterFamilyId(adapter), adapter.id);
  const remembered = settingsByAdapter.get(adapter.id);
  const includeChange = adapter.addressBranches === undefined
    ? false
    : includeChangeByCoin.get(getAdapterFamilyId(adapter)) ?? remembered?.includeChange ?? false;
  configureControls(adapter, controls, remembered === undefined
    ? { ...adapter.defaults, includeChange }
    : { ...remembered, includeChange });
  clearMessages();
  searchResult.hidden = true;
  if (autoDerive && mnemonicMayBeComplete()) void deriveCurrent(true);
}

populateCoinSelect(controls.coin);
const initialCoinFamily = COIN_FAMILIES[0]!;
adapter = getDefaultCoinAdapter(initialCoinFamily.id);
lastVariantByCoin.set(initialCoinFamily.id, adapter.id);
configureControls(adapter, controls);
updateWordCount();
updateModeButtons();
updateBulkActions();

function populateBuildPassport(): void {
  required<HTMLElement>('#build-version').textContent = BUILD_INFO.version;
  required<HTMLElement>('#build-date').textContent = BUILD_INFO.releaseDate;
  required<HTMLElement>('#build-fingerprint').textContent = BUILD_INFO.fingerprint;
  required<HTMLElement>('#artifact-checksum-file').textContent = BUILD_INFO.checksumFile;
}

function setCryptoControlsEnabled(enabled: boolean): void {
  deriveButton.disabled = !enabled;
  searchAddressButton.disabled = !enabled;
  for (const words of [12, 24] as const) required<HTMLButtonElement>(`#generate-${words}`).disabled = !enabled;
}

async function initializeCryptoRuntime(): Promise<void> {
  setCryptoControlsEnabled(false);
  const worker = new DerivationWorkerClient();
  try {
    const bip39Report = runBip39SelfTest();
    const workerReport = await worker.selfTest();
    const checks = [...bip39Report.checks, ...workerReport.checks];
    const durationMs = bip39Report.durationMs + workerReport.durationMs;
    cryptoReady = bip39Report.passed && workerReport.passed;
    selfTestStatus.classList.remove('checking', 'failed');
    selfTestStatus.classList.add('passed');
    selfTestStatus.textContent = 'Cryptographic self-test passed';
    selfTestDetails.textContent = `${checks.length} deterministic vectors passed in ${durationMs.toLocaleString()} ms: ${checks.join(' · ')}. Derivation is enabled.`;
    required<HTMLElement>('#worker-runtime').textContent = 'Dedicated Web Worker · active';
    setCryptoControlsEnabled(true);
    scheduleAutomaticDerivation();
  } catch (cause) {
    cryptoReady = false;
    selfTestStatus.classList.remove('checking', 'passed');
    selfTestStatus.classList.add('failed');
    selfTestStatus.textContent = 'Cryptographic self-test failed';
    selfTestDetails.textContent = cause instanceof Error ? cause.message : String(cause);
    required<HTMLElement>('#worker-runtime').textContent = 'Blocked · self-test failure';
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
  deriveButton.textContent = 'Confirm large request';
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
  deriveButton.disabled = true;
  deriveButton.textContent = 'Deriving…';
  cancelDerivationButton.hidden = false;
  cancelDerivationButton.disabled = false;
  derivationsInFlight += 1;
  const revision = ++derivationRevision;
  const requestedAdapter = adapter;
  let seed: Uint8Array | null = null;
  const worker = new DerivationWorkerClient();
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
          resultsRoot.hidden = false;
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
    if (!automatic) resultsRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      deriveButton.disabled = !cryptoReady;
      deriveButton.textContent = DERIVE_BUTTON_LABEL;
      cancelDerivationButton.hidden = true;
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
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('[data-adapter-id]');
  const id = button?.dataset.adapterId;
  if (id === undefined || id === adapter.id) return;
  resetForAdapter(getCoinAdapter(id));
  controls.protocolTabs.querySelector<HTMLButtonElement>(`[data-adapter-id="${id}"]`)?.focus();
});
controls.protocolTabs.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...controls.protocolTabs.querySelectorAll<HTMLButtonElement>('[data-adapter-id]')];
  const current = tabs.findIndex((tab) => tab.dataset.adapterId === adapter.id);
  if (current < 0 || tabs.length === 0) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  const id = tabs[nextIndex]?.dataset.adapterId;
  if (id === undefined) return;
  resetForAdapter(getCoinAdapter(id));
  controls.protocolTabs.querySelector<HTMLButtonElement>(`[data-adapter-id="${id}"]`)?.focus();
});
for (const control of [controls.network, controls.account, controls.branchInput, controls.branchSelect, controls.includeChange, controls.start, controls.count]) {
  control.addEventListener('input', () => {
    stopActiveDerivation();
    derivationRevision += 1;
    if (currentResult !== null) clearResults();
    updatePathPreview(adapter, controls);
    rememberCurrentSettings();
    pendingLargeRequestFingerprint = null;
    deriveButton.textContent = DERIVE_BUTTON_LABEL;
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
    deriveButton.textContent = DERIVE_BUTTON_LABEL;
    scheduleAutomaticDerivation();
  });
}

toggleSensitiveValues.addEventListener('click', () => setSensitiveValuesVisibility(!sensitiveValuesRevealed));
for (const words of [12, 24] as const) {
  required<HTMLButtonElement>(`#generate-${words}`).addEventListener('click', () => {
    cancelAutomaticDerivation();
    derivationRevision += 1;
    clearResults();
    clearMessages();
    try {
      mnemonic.value = generateMnemonic(words);
      controls.start.value = '0';
      controls.count.value = '20';
      rememberCurrentSettings();
      updateWordCount();
      showStatus(`Generated a new ${words}-word BIP39 recovery phrase using crypto.getRandomValues(). Deriving 20 results…`);
      void deriveCurrent(true);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Secure phrase generation failed.');
    }
  });
}

required<HTMLButtonElement>('#clear-all').addEventListener('click', () => {
  cancellationRequested = true;
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation cleared by the user.');
  derivationRevision += 1;
  pendingLargeRequestFingerprint = null;
  // Browser strings are immutable, so this only releases DOM references; mutable seed bytes are zeroed separately.
  mnemonic.value = '';
  passphrase.value = '';
  clearResults();
  settingsByAdapter.clear();
  includeChangeByCoin.clear();
  configureControls(adapter, controls);
  setSensitiveValuesVisibility(false);
  clearMessages();
  updateWordCount();
  expectedAddress.value = '';
  searchStart.value = '0';
  searchCount.value = '100';
  searchResult.replaceChildren();
  searchResult.hidden = true;
  mnemonic.focus();
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
    const nextButton = next === 'receive' ? resultReceiveTab : resultChangeTab;
    if (nextButton.disabled) return;
    activateResultBranch(next);
    nextButton.focus();
  });
}

required<HTMLButtonElement>('#select-all').addEventListener('click', () => {
  if (currentResult === null) return;
  replaceActiveSelection(selectAll(currentResult.rows.map((row) => row.index)));
  renderCurrent();
});
required<HTMLButtonElement>('#select-none').addEventListener('click', () => {
  replaceActiveSelection(selectNone());
  renderCurrent();
});
required<HTMLButtonElement>('#select-invert').addEventListener('click', () => {
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
      const previous = copyMnemonicButton.textContent;
      copyMnemonicButton.textContent = 'COPIED';
      window.setTimeout(() => { copyMnemonicButton.textContent = previous; }, 900);
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
  cancelDerivationButton.disabled = true;
  showStatus('Generation worker stopped. Already displayed results are kept.');
});

searchAddressButton.addEventListener('click', () => {
  void (async () => {
    clearMessages();
    searchResult.hidden = true;
    searchAddressButton.disabled = true;
    const originalLabel = searchAddressButton.textContent;
    searchAddressButton.textContent = 'Searching…';
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      const input = readControls(adapter, controls);
      const { includeChange, ...baseInput } = input;
      const start = Number(searchStart.value);
      const count = Number(searchCount.value);
      seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      worker = new DerivationWorkerClient();
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
      searchResult.textContent = match === null
        ? `Not found in indices ${start}…${start + count - 1} across ${scope}.`
        : `Match found in the ${matchedBranch} branch at index ${match.index}: ${match.path}`;
      searchResult.classList.toggle('search-match', match !== null);
      searchResult.hidden = false;
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Address search failed.');
    } finally {
      worker?.terminate(new DerivationCancelledError('Address-search worker released.'));
      seed?.fill(0);
      seed = null;
      searchAddressButton.disabled = false;
      searchAddressButton.textContent = originalLabel;
    }
  })();
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const bulkButton = target.closest<HTMLButtonElement>('[data-bulk]');
  if (bulkButton !== null) {
    void copyBulk(bulkButton);
    return;
  }
  const downloadButton = target.closest<HTMLButtonElement>('[data-download]');
  if (downloadButton !== null) {
    void downloadSelectedRows(downloadButton);
    return;
  }
  const copyButton = target.closest<HTMLButtonElement>('[data-copy-field]');
  if (copyButton === null) return;
  const scope = copyButton.dataset.copyScope;
  const key = copyButton.dataset.copyField;
  if ((scope !== 'summary' && scope !== 'row') || key === undefined) return;
  const row = copyButton.dataset.copyRow === undefined ? undefined : Number(copyButton.dataset.copyRow);
  const field = sensitiveField(scope, key, row);
  if (field === undefined) {
    showError('The requested field is no longer available.');
    return;
  }
  void copyText(copyButton, field.value, field.secret);
});
