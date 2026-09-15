import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode } from '@ckd/core/types.js';
import { displayedFields, type ExportAction } from '@ckd/export/formatter.js';
import {
  configureControls,
  populateCoinSelect,
  updatePathPreview,
  type CoinMetadataRegistry,
  type DerivationControlValues,
  type DerivationControls,
} from './inputs.js';
import { resultBranchGroup, type BranchResultState, type ResultBranch } from './result-branches.js';
import { renderResults, updateSecretVisibility, type ResultsRenderOptions } from './results.js';
import { clearDerivationResult, clearRenderedSecrets } from './secrets.js';
import type { MnemonicDiagnostic } from '@ckd/core/bip39.js';
import type { AddressSearchViewElements } from './address-search-feature.js';

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

export function createKeyDerivationView(
  document: Document,
  registry: CoinMetadataRegistry,
  addressSearch?: AddressSearchViewElements,
) {
  const required = <T extends Element>(selector: string): T => requireElement<T>(document, selector);
  const controls: DerivationControls = {
    coin: required<HTMLSelectElement>('#coin'),
    protocolTabs: required<HTMLElement>('#protocol-tabs'),
    legacyMobileField: required<HTMLElement>('#legacy-mobile-field'),
    includeLegacyMobile: required<HTMLInputElement>('#include-legacy-mobile'),
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
    changeHelp: required<HTMLElement>('#change-addresses-help'),
    includeChange: required<HTMLInputElement>('#include-change-addresses'),
    coinJoinField: required<HTMLElement>('#coinjoin-addresses-field'),
    includeCoinJoin: required<HTMLInputElement>('#include-coinjoin-addresses'),
    coinJoinHelp: required<HTMLElement>('#coinjoin-path-help'),
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
  const seedDiagnostic = required<HTMLElement>('#seed-diagnostic');
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
  const resultCoinJoinTab = required<HTMLButtonElement>('#result-coinjoin-tab');
  const coinJoinBranchTabs = required<HTMLElement>('#coinjoin-branch-tabs');
  const resultCoinJoinExternalTab = required<HTMLButtonElement>('#result-coinjoin-external-tab');
  const resultCoinJoinInternalTab = required<HTMLButtonElement>('#result-coinjoin-internal-tab');
  const branchTabButtons: Record<ResultBranch, HTMLButtonElement> = {
    receive: resultReceiveTab,
    change: resultChangeTab,
    'coinjoin-external': resultCoinJoinExternalTab,
    'coinjoin-internal': resultCoinJoinInternalTab,
  };
  const branchResultContent = required<HTMLElement>('#branch-result-content');
  const toggleSensitiveValues = required<HTMLButtonElement>('#toggle-sensitive-values');
  const toggleResultSecrets = required<HTMLButtonElement>('#toggle-result-secrets');
  const copyMnemonicButton = required<HTMLButtonElement>('#copy-mnemonic');
  const copyWatchOnlyButton = required<HTMLButtonElement>('#copy-watch-only');
  const downloadWatchOnlyButton = required<HTMLButtonElement>('#download-watch-only');
  const descriptorButtons = {
    publicCopy: required<HTMLButtonElement>('#copy-public-descriptors'),
    publicDownload: required<HTMLButtonElement>('#download-public-descriptors'),
    privateCopy: required<HTMLButtonElement>('#copy-private-descriptors'),
    privateDownload: required<HTMLButtonElement>('#download-private-descriptors'),
  };
  const descriptorPanel = required<HTMLElement>('#account-descriptor-export');
  const descriptorDialog = required<HTMLDialogElement>('#account-export-dialog');
  required<HTMLButtonElement>('#open-account-export').addEventListener('click', () => descriptorDialog.showModal());
  required<HTMLButtonElement>('#close-account-export').addEventListener('click', () => descriptorDialog.close());
  const descriptorDescription = required<HTMLElement>('#account-descriptor-description');
  const watchOnlyPanel = required<HTMLElement>('#watch-only-export');
  const watchOnlyDescription = required<HTMLElement>('#watch-only-description');
  const searchAddressButton = addressSearch?.button ?? null;
  const addressSearchPanel = addressSearch?.panel ?? null;
  const selfTestStatus = required<HTMLElement>('#crypto-self-test-status');
  const selfTestDetails = required<HTMLElement>('#crypto-self-test-details');
  const workerRuntime = required<HTMLElement>('#worker-runtime');
  const generate12Button = required<HTMLButtonElement>('#generate-12');
  const generate15Button = required<HTMLButtonElement>('#generate-15');
  const generate18Button = required<HTMLButtonElement>('#generate-18');
  const generate21Button = required<HTMLButtonElement>('#generate-21');
  const generate24Button = required<HTMLButtonElement>('#generate-24');
  const cancelDerivationButton = required<HTMLButtonElement>('#cancel-derivation');
  const expectedAddress = addressSearch?.expectedAddress ?? null;
  const searchStart = addressSearch?.searchStart ?? null;
  const searchCount = addressSearch?.searchCount ?? null;
  const searchResult = addressSearch?.result ?? null;
  const temporaryButtonLabels = new WeakMap<HTMLButtonElement, string>();
  let cryptoControlsEnabled = false;
  let addressSearchAvailable = searchAddressButton !== null && addressSearchPanel !== null;

  return {
    document,
    required,
    controls,
    addressSearch,
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
    resultCoinJoinTab,
    coinJoinBranchTabs,
    resultCoinJoinExternalTab,
    resultCoinJoinInternalTab,
    branchResultContent,
    toggleSensitiveValues,
    toggleResultSecrets,
    copyMnemonicButton,
    copyWatchOnlyButton,
    downloadWatchOnlyButton,
    descriptorButtons,
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
    generate15Button,
    generate18Button,
    generate21Button,
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
      populateCoinSelect(controls.coin, registry);
    },
    configureControls(adapter: CoinAdapter, values?: DerivationControlValues): void {
      configureControls(adapter, controls, registry, values);
      addressSearchAvailable = searchAddressButton !== null && addressSearchPanel !== null;
      if (addressSearchPanel !== null) addressSearchPanel.hidden = false;
      if (searchAddressButton !== null) searchAddressButton.disabled = !cryptoControlsEnabled;
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
      if (button.dataset.iconButton === 'true') {
        const previousTitle = button.title;
        button.classList.add('copied');
        button.title = 'Copied';
        window.setTimeout(() => {
          button.classList.remove('copied');
          button.title = previousTitle;
        }, 900);
        return;
      }
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
      if (searchResult !== null) searchResult.hidden = true;
    },
    showSearchResult(message: string, matched: boolean): void {
      if (searchResult === null) return;
      searchResult.textContent = message;
      searchResult.classList.toggle('search-match', matched);
      searchResult.hidden = false;
    },
    setSearchRunning(running: boolean): void {
      if (running) {
        if (searchAddressButton === null) return;
        temporaryButtonLabels.set(searchAddressButton, searchAddressButton.textContent ?? '');
        searchAddressButton.disabled = true;
        searchAddressButton.textContent = 'Searching…';
        return;
      }
      if (searchAddressButton === null) return;
      searchAddressButton.disabled = !cryptoControlsEnabled || !addressSearchAvailable;
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
      if (expectedAddress !== null) expectedAddress.value = '';
      if (searchStart !== null) searchStart.value = '0';
      if (searchCount !== null) searchCount.value = '100';
      searchResult?.replaceChildren();
      if (searchResult !== null) searchResult.hidden = true;
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
    updateSeedDiagnostic(diagnostic: MnemonicDiagnostic, fingerprint: string | null, revealed: boolean): void {
      const status = (passed: boolean, success: string, failure: string): HTMLDivElement => {
        const row = document.createElement('div');
        row.className = `seed-diagnostic-check ${passed ? 'passed' : 'failed'}`;
        const icon = document.createElement('span');
        icon.textContent = passed ? '✓' : '×';
        const label = document.createElement('span');
        label.textContent = passed ? success : failure;
        row.append(icon, label);
        return row;
      };
      if (diagnostic.wordCount === 0) {
        const note = document.createElement('p');
        note.className = 'field-note';
        note.textContent = 'Enter an English BIP39 recovery phrase to check its structure.';
        seedDiagnostic.replaceChildren(seedDiagnostic.firstElementChild!, note);
        return;
      }
      const checks = document.createElement('div');
      checks.className = 'seed-diagnostic-checks';
      checks.append(
        status(
          diagnostic.wordCountValid,
          `${diagnostic.wordCount} words`,
          `${diagnostic.wordCount} words · expected 12, 15, 18, 21, or 24`,
        ),
        status(
          diagnostic.allWordsKnown,
          'All words in BIP39 English list',
          'One or more words are not in the BIP39 English list',
        ),
        status(
          diagnostic.checksumValid,
          'Checksum valid',
          diagnostic.allWordsKnown && diagnostic.wordCountValid ? 'Checksum invalid' : 'Checksum cannot be checked yet',
        ),
        status(true, 'NFKD normalized', 'NFKD normalization unavailable'),
      );
      const metrics = document.createElement('dl');
      metrics.className = 'seed-diagnostic-metrics';
      const metric = (labelText: string, valueText: string, conceal = false): void => {
        const term = document.createElement('dt');
        term.textContent = labelText;
        const value = document.createElement('dd');
        value.textContent = conceal && !revealed ? '••••••••' : valueText;
        metrics.append(term, value);
      };
      if (diagnostic.entropyBits !== null && diagnostic.checksumBits !== null) {
        metric('Entropy', `${diagnostic.entropyBits} bits`);
        metric('Checksum', `${diagnostic.checksumBits} bits`);
      }
      if (fingerprint !== null) metric('BIP32 master fingerprint', fingerprint, true);
      const problems = document.createElement('div');
      problems.className = 'seed-diagnostic-problems';
      for (const unknown of diagnostic.unknownWords) {
        const item = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `Word ${unknown.index + 1}: ${revealed ? `“${unknown.word}”` : '“••••”'}`;
        const explanation = document.createElement('span');
        explanation.textContent = 'Not in the BIP39 English list.';
        item.append(title, explanation);
        if (unknown.suggestions.length > 0) {
          const suggestions = document.createElement('span');
          suggestions.textContent = `Possible words: ${revealed ? unknown.suggestions.join(', ') : 'reveal recovery source to view'}`;
          item.append(suggestions);
        }
        problems.append(item);
      }
      const constructionDetails = document.createElement('details');
      constructionDetails.className = 'seed-construction-details';
      constructionDetails.open =
        seedDiagnostic.querySelector<HTMLDetailsElement>('.seed-construction-details')?.open ?? false;
      const constructionSummary = document.createElement('summary');
      constructionSummary.textContent = 'Mnemonic construction details';
      constructionDetails.append(constructionSummary);
      if (!revealed) {
        const concealedNote = document.createElement('p');
        concealedNote.className = 'field-note';
        concealedNote.textContent = 'Reveal recovery source to view words, indexes, entropy, and checksum bits.';
        constructionDetails.append(concealedNote);
      } else {
        const construction = diagnostic.construction;
        if (construction !== null) {
          const values = document.createElement('dl');
          values.className = 'seed-construction-values';
          const value = (labelText: string, valueText: string): void => {
            const term = document.createElement('dt');
            term.textContent = labelText;
            const description = document.createElement('dd');
            const code = document.createElement('code');
            code.textContent = valueText;
            description.append(code);
            values.append(term, description);
          };
          value('Entropy · hexadecimal', construction.entropyHex);
          value('Entropy · binary', construction.entropyBinary);
          value('Checksum · supplied', construction.providedChecksum);
          value('Checksum · expected', construction.expectedChecksum);
          value('Entropy + checksum', construction.mnemonicBinary);
          value('Word indexes · 0–2047', construction.wordIndexes.join(', '));
          constructionDetails.append(values);
        } else {
          const unavailable = document.createElement('p');
          unavailable.className = 'field-note';
          unavailable.textContent = 'A checksum-valid BIP39 phrase is required for entropy and checksum details.';
          constructionDetails.append(unavailable);
        }
        const tableWrap = document.createElement('div');
        tableWrap.className = 'seed-word-table-wrap';
        const table = document.createElement('table');
        table.className = 'seed-word-table';
        const header = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const labelText of ['#', 'Word', 'BIP39 index', 'Hex index', '11-bit group', 'Bit role']) {
          const heading = document.createElement('th');
          heading.scope = 'col';
          heading.textContent = labelText;
          headerRow.append(heading);
        }
        header.append(headerRow);
        const body = document.createElement('tbody');
        for (const word of diagnostic.words) {
          const row = document.createElement('tr');
          for (const valueText of [
            String(word.position),
            word.word,
            word.wordlistIndex === null ? 'Unknown' : String(word.wordlistIndex),
            word.indexHex ?? '—',
            word.bits ?? '—',
            diagnostic.checksumBits !== null && word.position === diagnostic.wordCount
              ? `${11 - diagnostic.checksumBits} entropy + ${diagnostic.checksumBits} checksum`
              : word.wordlistIndex === null
                ? 'Unknown'
                : '11 entropy bits',
          ]) {
            const cell = document.createElement('td');
            cell.textContent = valueText;
            row.append(cell);
          }
          body.append(row);
        }
        table.append(header, body);
        tableWrap.append(table);
        constructionDetails.append(tableWrap);
      }
      seedDiagnostic.replaceChildren(seedDiagnostic.firstElementChild!, checks, metrics, problems, constructionDetails);
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
      coinJoinBranchTabs.hidden = true;
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
      const hasReceive = branchStates.has('receive');
      const hasCoinJoin = branchStates.has('coinjoin-external') || branchStates.has('coinjoin-internal');
      resultBranchTabs.hidden = (!hasChange && !hasCoinJoin) || (hasCoinJoin && !hasReceive && !hasChange);
      resultReceiveTab.hidden = !hasReceive;
      resultChangeTab.hidden = !hasChange;
      resultCoinJoinTab.hidden = !hasCoinJoin;
      const activeGroup = resultBranchGroup(activeBranch);
      coinJoinBranchTabs.hidden = !hasCoinJoin || activeGroup !== 'coinjoin';
      if (result !== null) {
        const suffix =
          activeGroup === 'receive'
            ? hasChange || hasCoinJoin
              ? ' · Receive addresses'
              : ''
            : activeGroup === 'change'
              ? ' · Change addresses'
              : '';
        resultTitle.textContent = `${result.title}${suffix}`;
      }
      for (const [button, branch] of [
        [resultReceiveTab, 'receive'],
        [resultChangeTab, 'change'],
      ] as const) {
        const active = activeGroup === branch;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        button.disabled = !branchStates.has(branch);
      }
      const coinJoinActive = activeGroup === 'coinjoin';
      resultCoinJoinTab.classList.toggle('active', coinJoinActive);
      resultCoinJoinTab.setAttribute('aria-selected', String(coinJoinActive));
      resultCoinJoinTab.tabIndex = coinJoinActive ? 0 : -1;
      resultCoinJoinTab.disabled = !hasCoinJoin;
      for (const [button, branch] of [
        [resultCoinJoinExternalTab, 'coinjoin-external'],
        [resultCoinJoinInternalTab, 'coinjoin-internal'],
      ] as const) {
        const active = activeBranch === branch;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        button.disabled = !branchStates.has(branch);
      }
      branchResultContent.setAttribute('aria-labelledby', branchTabButtons[activeBranch].id);
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
        const roleKeys =
          action === 'addresses'
            ? adapter.fieldRoles.addresses
            : action === 'publicKeys'
              ? adapter.fieldRoles.publicKeys
              : action === 'privateKeys'
                ? adapter.fieldRoles.privateKeys
                : null;
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
      const descriptors = result?.accountDescriptors;
      descriptorPanel.hidden = descriptors === undefined;
      if (descriptors === undefined && descriptorDialog.open) descriptorDialog.close();
      descriptorDescription.textContent =
        descriptors === undefined
          ? ''
          : `${result!.title} · ${result!.networkLabel} · account ${descriptors.accountPath}`;
      for (const [action, button] of Object.entries(descriptorButtons)) {
        const privateExport = action === 'privateCopy' || action === 'privateDownload';
        button.disabled = descriptors === undefined || (privateExport && !revealed);
        button.title =
          privateExport && !revealed ? 'Reveal sensitive values before exporting private descriptors.' : '';
      }
      const watchOnly = descriptors === undefined ? result?.watchOnly : undefined;
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
    setRecoverySourceVisibility(revealed: boolean): void {
      mnemonic.classList.toggle('concealed', !revealed);
      passphrase.type = revealed ? 'text' : 'password';
      toggleSensitiveValues.textContent = revealed ? 'Hide recovery source' : 'Reveal recovery source';
      toggleSensitiveValues.setAttribute('aria-pressed', String(revealed));
      copyMnemonicButton.disabled = !revealed || mnemonic.value.trim().length === 0;
    },
    setResultSecretsVisibility(revealed: boolean): void {
      updateSecretVisibility(resultsRoot, revealed);
      toggleResultSecrets.textContent = revealed ? 'Hide all private keys' : 'Reveal all private keys';
      toggleResultSecrets.setAttribute('aria-pressed', String(revealed));
    },
    showResults(): void {
      resultsRoot.hidden = false;
    },
    populateBuildPassport(info: {
      version: string;
      releaseDate: string;
      fingerprint: string;
      checksumFile: string;
      profile: string;
      edition: string;
      coins?: readonly string[];
      features?: readonly string[];
    }): void {
      required<HTMLElement>('#build-version').textContent = info.version;
      required<HTMLElement>('#build-date').textContent = info.releaseDate;
      required<HTMLElement>('#build-edition').textContent = info.edition;
      required<HTMLElement>('#build-profile').textContent = info.profile;
      required<HTMLElement>('#build-coins').textContent = info.coins?.join(', ') ?? 'profile default';
      required<HTMLElement>('#build-features').textContent = info.features?.join(', ') ?? 'profile default';
      required<HTMLElement>('#build-fingerprint').textContent = info.fingerprint;
      required<HTMLElement>('#artifact-checksum-file').textContent = info.checksumFile;
    },
    setCryptoControlsEnabled(enabled: boolean): void {
      cryptoControlsEnabled = enabled;
      deriveButton.disabled = !enabled;
      if (searchAddressButton !== null) searchAddressButton.disabled = !enabled || !addressSearchAvailable;
      for (const button of [generate12Button, generate15Button, generate18Button, generate21Button, generate24Button]) {
        button.disabled = !enabled;
      }
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
      return [...controls.protocolTabs.querySelectorAll<HTMLButtonElement>('[data-adapter-id]')].flatMap(
        (button) => button.dataset.adapterId ?? [],
      );
    },
    focusProtocolButton(adapterId: string): void {
      controls.protocolTabs.querySelector<HTMLButtonElement>(`[data-adapter-id="${adapterId}"]`)?.focus();
    },
    resultBranchEnabled(branch: ResultBranch): boolean {
      return !branchTabButtons[branch].disabled;
    },
    focusResultBranch(branch: ResultBranch): void {
      branchTabButtons[branch].focus();
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
