import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode } from '@ckd/core/types.js';
import { displayedFields, type ExportAction } from '@ckd/export/formatter.js';
import {
  configureControls,
  populateCoinSelect,
  updatePathPreview,
  type DerivationControlValues,
  type DerivationControls,
} from './inputs.js';
import type { BranchResultState, ResultBranch } from './result-branches.js';
import { renderResults, updateSecretVisibility, type ResultsRenderOptions } from './results.js';
import { clearDerivationResult, clearRenderedSecrets } from './secrets.js';

type DocumentAction =
  | { kind: 'bulk'; button: HTMLButtonElement; action: ExportAction }
  | { kind: 'download'; button: HTMLButtonElement; action: ExportAction }
  | {
      kind: 'copy-field';
      button: HTMLButtonElement;
      scope: 'summary' | 'row';
      fieldKey: string;
      rowIndex?: number;
    };

function requireElement<T extends Element>(document: Document, selector: string): T {
  const match = document.querySelector<T>(selector);
  if (match === null) throw new Error(`Application template is missing ${selector}.`);
  return match;
}

export function createKeyDerivationView(document: Document) {
  const required = <T extends Element>(selector: string): T => requireElement<T>(document, selector);
  const controls: DerivationControls = {
    coin: required<HTMLSelectElement>('#coin'),
    protocolTabs: required<HTMLElement>('#protocol-tabs'),
    network: required<HTMLSelectElement>('#network'),
    networkField: required<HTMLElement>('#network-field'),
    accountField: required<HTMLElement>('#account-field'),
    accountLabel: required<HTMLLabelElement>('#account-label'),
    account: required<HTMLInputElement>('#account'),
    branchField: required<HTMLElement>('#branch-field'),
    branchLabel: required<HTMLLabelElement>('#branch-label'),
    branchInput: required<HTMLInputElement>('#branch-input'),
    branchSelect: required<HTMLSelectElement>('#branch-select'),
    changeField: required<HTMLElement>('#change-addresses-field'),
    includeChange: required<HTMLInputElement>('#include-change-addresses'),
    startLabel: required<HTMLLabelElement>('#start-label'),
    start: required<HTMLInputElement>('#start'),
    countLabel: required<HTMLLabelElement>('#count-label'),
    count: required<HTMLInputElement>('#count'),
    preview: required<HTMLElement>('#path-preview'),
  };
  const errorRoot = required<HTMLElement>('#error');
  const statusRoot = required<HTMLElement>('#status');
  const mnemonic = required<HTMLTextAreaElement>('#mnemonic');
  const passphrase = required<HTMLInputElement>('#passphrase');
  const wordCount = required<HTMLElement>('#word-count');
  const deriveButton = required<HTMLButtonElement>('#derive-button');
  const resultsRoot = required<HTMLElement>('#results');
  const resultTitle = required<HTMLElement>('#result-title');
  const summaryRoot = required<HTMLElement>('#summary');
  const noticesRoot = required<HTMLElement>('#result-notices');
  const listRoot = required<HTMLElement>('#address-list');
  const selectedCount = required<HTMLElement>('#selected-count');
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
  const searchAddressButton = required<HTMLButtonElement>('#search-address');
  const addressSearchPanel = required<HTMLElement>('#address-search');
  const selfTestStatus = required<HTMLElement>('#crypto-self-test-status');
  const selfTestDetails = required<HTMLElement>('#crypto-self-test-details');
  const workerRuntime = required<HTMLElement>('#worker-runtime');
  const generate12Button = required<HTMLButtonElement>('#generate-12');
  const generate24Button = required<HTMLButtonElement>('#generate-24');
  const cancelDerivationButton = required<HTMLButtonElement>('#cancel-derivation');
  const expectedAddress = required<HTMLInputElement>('#expected-address');
  const searchStart = required<HTMLInputElement>('#search-start');
  const searchCount = required<HTMLInputElement>('#search-count');
  const searchResult = required<HTMLElement>('#search-result');
  const temporaryButtonLabels = new WeakMap<HTMLButtonElement, string>();
  let cryptoControlsEnabled = false;
  let addressSearchAvailable = true;

  return {
    document,
    required,
    controls,
    form: required<HTMLFormElement>('#derive-form'),
    mnemonic,
    passphrase,
    wordCount,
    errorRoot,
    statusRoot,
    deriveButton,
    resultsRoot,
    resultTitle,
    summaryRoot,
    noticesRoot,
    listRoot,
    selectedCount,
    exportFormat: required<HTMLSelectElement>('#export-format'),
    modeBasic,
    modeAdvanced,
    resultBranchTabs,
    resultReceiveTab,
    resultChangeTab,
    branchResultContent,
    toggleSensitiveValues,
    copyMnemonicButton,
    copyWatchOnlyButton,
    downloadWatchOnlyButton,
    watchOnlyPanel,
    watchOnlyDescription,
    cancelDerivationButton,
    expectedAddress,
    searchStart,
    searchCount,
    searchAddressButton,
    searchResult,
    selfTestStatus,
    selfTestDetails,
    generate12Button,
    generate24Button,
    clearAllButton: required<HTMLButtonElement>('#clear-all'),
    selectAllButton: required<HTMLButtonElement>('#select-all'),
    selectNoneButton: required<HTMLButtonElement>('#select-none'),
    selectInvertButton: required<HTMLButtonElement>('#select-invert'),
    downloadSelectionButton: required<HTMLButtonElement>('#download-selection'),
    showError(message: string): void {
      statusRoot.hidden = true;
      errorRoot.textContent = message;
      errorRoot.hidden = false;
    },
    showStatus(message: string): void {
      errorRoot.hidden = true;
      statusRoot.textContent = message;
      statusRoot.hidden = false;
    },
    clearMessages(): void {
      errorRoot.textContent = '';
      errorRoot.hidden = true;
      statusRoot.textContent = '';
      statusRoot.hidden = true;
    },
    populateCoinSelect(): void {
      populateCoinSelect(controls.coin);
    },
    configureControls(adapter: CoinAdapter, values?: DerivationControlValues): void {
      configureControls(adapter, controls, values);
      addressSearchAvailable = adapter.fieldRoles.addresses.length > 0;
      addressSearchPanel.hidden = !addressSearchAvailable;
      searchAddressButton.disabled = !cryptoControlsEnabled || !addressSearchAvailable;
    },
    updatePathPreview(adapter: CoinAdapter): void {
      updatePathPreview(adapter, controls);
    },
    resetDeriveAction(): void {
      deriveButton.textContent = 'Derive selected results';
    },
    showLargeRequestConfirmation(): void {
      deriveButton.textContent = 'Confirm large request';
    },
    showDerivationRunning(): void {
      deriveButton.disabled = true;
      deriveButton.textContent = 'Deriving…';
      cancelDerivationButton.hidden = false;
      cancelDerivationButton.disabled = false;
    },
    showDerivationIdle(enabled: boolean): void {
      deriveButton.disabled = !enabled;
      deriveButton.textContent = 'Derive selected results';
      cancelDerivationButton.hidden = true;
    },
    showCancellationRequested(): void {
      cancelDerivationButton.disabled = true;
    },
    flashCopied(button: HTMLButtonElement): void {
      const previous = button.textContent;
      button.textContent = 'COPIED';
      window.setTimeout(() => {
        button.textContent = previous;
      }, 900);
    },
    setDownloadPreparing(button: HTMLButtonElement, preparing: boolean): void {
      if (preparing) {
        temporaryButtonLabels.set(button, button.textContent ?? '');
        button.disabled = true;
        button.textContent = 'Preparing…';
        return;
      }
      const previous = temporaryButtonLabels.get(button);
      if (previous !== undefined) button.textContent = previous;
      temporaryButtonLabels.delete(button);
    },
    hideSearchResult(): void {
      searchResult.hidden = true;
    },
    showSearchResult(message: string, matched: boolean): void {
      searchResult.textContent = message;
      searchResult.classList.toggle('search-match', matched);
      searchResult.hidden = false;
    },
    setSearchRunning(running: boolean): void {
      if (running) {
        temporaryButtonLabels.set(searchAddressButton, searchAddressButton.textContent ?? '');
        searchAddressButton.disabled = true;
        searchAddressButton.textContent = 'Searching…';
        return;
      }
      searchAddressButton.disabled = false;
      const previous = temporaryButtonLabels.get(searchAddressButton);
      if (previous !== undefined) searchAddressButton.textContent = previous;
      temporaryButtonLabels.delete(searchAddressButton);
    },
    setGeneratedMnemonic(phrase: string, resultCount: number): void {
      mnemonic.value = phrase;
      controls.start.value = '0';
      controls.count.value = String(resultCount);
    },
    clearAllInputs(): void {
      mnemonic.value = '';
      passphrase.value = '';
      expectedAddress.value = '';
      searchStart.value = '0';
      searchCount.value = '100';
      searchResult.replaceChildren();
      searchResult.hidden = true;
      mnemonic.focus();
    },
    scrollResultWindowIntoView(): void {
      listRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    scrollResultsIntoView(): void {
      resultsRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    updateWordCount(revealed: boolean): void {
      const count = mnemonic.value.trim() === '' ? 0 : mnemonic.value.trim().split(/\s+/u).length;
      wordCount.textContent = `${count} word${count === 1 ? '' : 's'}`;
      copyMnemonicButton.disabled = !revealed || mnemonic.value.trim().length === 0;
    },
    clearResults(
      currentResult: DerivationResult | null,
      branchStates: ReadonlyMap<ResultBranch, BranchResultState>,
    ): void {
      clearRenderedSecrets(summaryRoot);
      clearRenderedSecrets(listRoot);
      noticesRoot.replaceChildren();
      const cleared = new Set<DerivationResult>();
      for (const { result } of branchStates.values()) {
        if (cleared.has(result)) continue;
        clearDerivationResult(result);
        cleared.add(result);
      }
      if (currentResult !== null && !cleared.has(currentResult)) clearDerivationResult(currentResult);
      resultBranchTabs.hidden = true;
      resultsRoot.classList.remove('revealed');
      resultsRoot.hidden = true;
    },
    renderCurrent(
      result: DerivationResult,
      options: ResultsRenderOptions,
      branchStates: ReadonlyMap<ResultBranch, BranchResultState>,
      activeBranch: ResultBranch,
      adapter: CoinAdapter,
      sensitiveValuesRevealed: boolean,
    ): void {
      clearRenderedSecrets(summaryRoot);
      clearRenderedSecrets(listRoot);
      renderResults(summaryRoot, listRoot, noticesRoot, result, options);
      updateSecretVisibility(resultsRoot, sensitiveValuesRevealed);
      this.updateMode(options.mode);
      this.updateResultBranchTabs(result, branchStates, activeBranch);
      this.updateBulkActions(result, options.selected, adapter, options.mode, sensitiveValuesRevealed);
    },
    updateResultBranchTabs(
      result: DerivationResult | null,
      branchStates: ReadonlyMap<ResultBranch, BranchResultState>,
      activeBranch: ResultBranch,
    ): void {
      const hasChange = branchStates.has('change');
      resultBranchTabs.hidden = !hasChange;
      if (result !== null) {
        const suffix = hasChange
          ? activeBranch === 'receive' ? ' · Receive addresses' : ' · Change addresses'
          : '';
        resultTitle.textContent = `${result.title}${suffix}`;
      }
      for (const [button, branch] of [[resultReceiveTab, 'receive'], [resultChangeTab, 'change']] as const) {
        const active = activeBranch === branch;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        button.disabled = !branchStates.has(branch);
      }
      branchResultContent.setAttribute(
        'aria-labelledby',
        activeBranch === 'receive' ? resultReceiveTab.id : resultChangeTab.id,
      );
    },
    updateMode(mode: DisplayMode): void {
      const basic = mode === 'basic';
      document.body.classList.toggle('result-mode-basic', basic);
      document.body.classList.toggle('result-mode-advanced', !basic);
      resultsRoot.classList.toggle('mode-basic', basic);
      resultsRoot.classList.toggle('mode-advanced', !basic);
      modeBasic.classList.toggle('active', basic);
      modeBasic.setAttribute('aria-pressed', String(basic));
      modeAdvanced.classList.toggle('active', !basic);
      modeAdvanced.setAttribute('aria-pressed', String(!basic));
    },
    updateBulkActions(
      result: DerivationResult | null,
      selected: ReadonlySet<number>,
      adapter: CoinAdapter,
      mode: DisplayMode,
      revealed: boolean,
    ): void {
      selectedCount.textContent = String(selected.size);
      for (const button of document.querySelectorAll<HTMLButtonElement>('[data-bulk],[data-download]')) {
        if (result === null || selected.size === 0) {
          button.disabled = true;
          continue;
        }
        const action = (button.dataset.bulk ?? button.dataset.download) as ExportAction;
        const roleKeys = action === 'addresses'
          ? adapter.fieldRoles.addresses
          : action === 'publicKeys'
            ? adapter.fieldRoles.publicKeys
            : action === 'privateKeys' ? adapter.fieldRoles.privateKeys : null;
        let hasValue = false;
        let containsSecret = false;
        for (const row of result.rows) {
          if (!selected.has(row.index)) continue;
          const fields = displayedFields(row, mode).filter(
            (field) => roleKeys === null || roleKeys.includes(field.key),
          );
          if (fields.length > 0) hasValue = true;
          if (fields.some(({ secret }) => secret)) containsSecret = true;
          if (hasValue && containsSecret) break;
        }
        button.disabled = !hasValue || (containsSecret && !revealed);
      }
      required<HTMLButtonElement>('#select-all').disabled = result === null;
      required<HTMLButtonElement>('#select-none').disabled = result === null || selected.size === 0;
      required<HTMLButtonElement>('#select-invert').disabled = result === null;
      const watchOnly = result?.watchOnly;
      watchOnlyPanel.hidden = watchOnly === undefined;
      copyWatchOnlyButton.disabled = watchOnly === undefined || !revealed;
      downloadWatchOnlyButton.disabled = watchOnly === undefined || !revealed;
      if (watchOnly === undefined) {
        watchOnlyDescription.textContent = '';
        return;
      }
      watchOnlyDescription.textContent = watchOnly.description;
      copyWatchOnlyButton.textContent = watchOnly.label;
      copyWatchOnlyButton.title = revealed
        ? watchOnly.description
        : `Reveal sensitive values first. ${watchOnly.description}`;
      downloadWatchOnlyButton.title = revealed
        ? `Download ${watchOnly.fileName}`
        : `Reveal sensitive values before downloading ${watchOnly.fileName}.`;
    },
    setSensitiveValuesVisibility(revealed: boolean): void {
      mnemonic.classList.toggle('concealed', !revealed);
      passphrase.type = revealed ? 'text' : 'password';
      updateSecretVisibility(resultsRoot, revealed);
      toggleSensitiveValues.textContent = revealed ? 'Hide all sensitive values' : 'Reveal all sensitive values';
      toggleSensitiveValues.setAttribute('aria-pressed', String(revealed));
      copyMnemonicButton.disabled = !revealed || mnemonic.value.trim().length === 0;
    },
    showResults(): void {
      resultsRoot.hidden = false;
    },
    populateBuildPassport(info: {
      version: string;
      releaseDate: string;
      fingerprint: string;
      checksumFile: string;
    }): void {
      required<HTMLElement>('#build-version').textContent = info.version;
      required<HTMLElement>('#build-date').textContent = info.releaseDate;
      required<HTMLElement>('#build-fingerprint').textContent = info.fingerprint;
      required<HTMLElement>('#artifact-checksum-file').textContent = info.checksumFile;
    },
    setCryptoControlsEnabled(enabled: boolean): void {
      cryptoControlsEnabled = enabled;
      deriveButton.disabled = !enabled;
      searchAddressButton.disabled = !enabled || !addressSearchAvailable;
      generate12Button.disabled = !enabled;
      generate24Button.disabled = !enabled;
    },
    showCryptoSelfTestPassed(checks: readonly string[], durationMs: number): void {
      selfTestStatus.classList.remove('checking', 'failed');
      selfTestStatus.classList.add('passed');
      selfTestStatus.textContent = 'Cryptographic self-test passed';
      selfTestDetails.textContent = `${checks.length} deterministic vectors passed in ${durationMs.toLocaleString()} ms: ${checks.join(' · ')}. Derivation is enabled.`;
      workerRuntime.textContent = 'Dedicated Web Worker · active';
    },
    showCryptoSelfTestFailed(cause: unknown): void {
      selfTestStatus.classList.remove('checking', 'passed');
      selfTestStatus.classList.add('failed');
      selfTestStatus.textContent = 'Cryptographic self-test failed';
      selfTestDetails.textContent = cause instanceof Error ? cause.message : String(cause);
      workerRuntime.textContent = 'Blocked · self-test failure';
    },
    protocolAdapterIdFrom(target: EventTarget | null): string | undefined {
      if (!(target instanceof Element)) return undefined;
      return target.closest<HTMLButtonElement>('[data-adapter-id]')?.dataset.adapterId;
    },
    protocolAdapterIds(): string[] {
      return [...controls.protocolTabs.querySelectorAll<HTMLButtonElement>('[data-adapter-id]')]
        .flatMap((button) => button.dataset.adapterId ?? []);
    },
    focusProtocolButton(adapterId: string): void {
      controls.protocolTabs
        .querySelector<HTMLButtonElement>(`[data-adapter-id="${adapterId}"]`)
        ?.focus();
    },
    resultBranchEnabled(branch: ResultBranch): boolean {
      return !(branch === 'receive' ? resultReceiveTab : resultChangeTab).disabled;
    },
    focusResultBranch(branch: ResultBranch): void {
      (branch === 'receive' ? resultReceiveTab : resultChangeTab).focus();
    },
    documentActionFrom(target: EventTarget | null): DocumentAction | null {
      if (!(target instanceof Element)) return null;
      const bulkButton = target.closest<HTMLButtonElement>('[data-bulk]');
      if (bulkButton?.dataset.bulk !== undefined) {
        return { kind: 'bulk', button: bulkButton, action: bulkButton.dataset.bulk as ExportAction };
      }
      const downloadButton = target.closest<HTMLButtonElement>('[data-download]');
      if (downloadButton?.dataset.download !== undefined) {
        return {
          kind: 'download',
          button: downloadButton,
          action: downloadButton.dataset.download as ExportAction,
        };
      }
      const copyButton = target.closest<HTMLButtonElement>('[data-copy-field]');
      const scope = copyButton?.dataset.copyScope;
      const fieldKey = copyButton?.dataset.copyField;
      if (copyButton === null || (scope !== 'summary' && scope !== 'row') || fieldKey === undefined) {
        return null;
      }
      const copyRow = copyButton.dataset.copyRow;
      return copyRow === undefined
        ? { kind: 'copy-field', button: copyButton, scope, fieldKey }
        : { kind: 'copy-field', button: copyButton, scope, fieldKey, rowIndex: Number(copyRow) };
    },
  };
}

export type KeyDerivationView = ReturnType<typeof createKeyDerivationView>;
