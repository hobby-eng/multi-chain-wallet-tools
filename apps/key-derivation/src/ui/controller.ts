import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode, ResultField } from '@ckd/core/types.js';
import { displayedFields, type ExportAction, type ExportFormat } from '@ckd/export/formatter.js';
import { applySharedDerivationControls, readControls, type DerivationControlValues } from './inputs.js';
import { createBranchResultState, type BranchResultState, type ResultBranch } from './result-branches.js';
import { runStreamedDerivation } from './streamed-derivation.js';
import { invertSelection, selectAll, selectNone } from './selection.js';
import { DerivationCancelledError, DerivationWorkerClient } from '../workers/derive-client.js';

import type { KeyDerivationView } from './view.js';
import type { AddressSearchRunner } from './address-search-feature.js';
import type { RecoverySourceReference, RecoverySourceTarget } from './recovery-source-link.js';
import { installMnemonicDiagnosticFeature } from './mnemonic-diagnostic-feature.js';
import { createResultExportController } from './result-export-controller.js';
import { installAccountExportController } from './account-export-controller.js';
import { createLargeRequestPolicy } from './large-request-policy.js';
import { installRecoverySourceController } from './recovery-source-controller.js';
import { AdapterSettingsStore } from './adapter-settings.js';
import { AutomaticDerivationScheduler } from './automatic-derivation.js';
import { runStartupSelfTests } from './startup-self-test.js';
import { installResultTabNavigation, type TopLevelResultTab } from './result-tab-navigation.js';

const BASIC_WINDOW_SIZE = 200;
const ADVANCED_WINDOW_SIZE = 24;
interface KeyDerivationDependencies {
  coinFamilies: typeof import('@ckd/coins/registry.js').COIN_FAMILIES;
  getAdapterFamilyId: typeof import('@ckd/coins/registry.js').getAdapterFamilyId;
  getCoinAdapter: typeof import('@ckd/coins/registry.js').getCoinAdapter;
  getDefaultCoinAdapter: typeof import('@ckd/coins/registry.js').getDefaultCoinAdapter;
  buildInfo: typeof import('@ckd/build-info').BUILD_INFO;
  generateMnemonic: typeof import('@ckd/core/bip39.js').generateMnemonic;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  runBip39SelfTest: typeof import('@ckd/bip39-self-test').runBip39SelfTest;
  runRecoveryBackupSelfTest: typeof import('@ckd/recovery-backup/self-test.js').runRecoveryBackupSelfTest;
  setRecoveryControlsEnabled(enabled: boolean): void;
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard;
  downloadBlob: typeof import('@ckd/export/download.js').downloadBlob;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
  createWorker(): DerivationWorkerClient;
  addressSearch?: AddressSearchRunner;
  openRecoverySource?(reference: RecoverySourceReference, target: RecoverySourceTarget): void;
  installSilentPaymentFeature?: typeof import('./silent-payment-feature.js').installSilentPaymentFeature;
  installBip85Feature?: typeof import('./bip85-feature.js').installBip85Feature;
  installBip38EncryptionFeature?: ReturnType<
    typeof import('./bip38-encryption-feature.js').createBip38EncryptionInstaller
  >;
  installMessageSigningFeature?: ReturnType<
    typeof import('./message-signing-feature.js').createMessageSigningInstaller
  >;
}

export function createKeyDerivationController(view: KeyDerivationView, dependencies: KeyDerivationDependencies) {
  let started = false;
  return {
    start(): void {
      if (started) return;
      started = true;
      const {
        coinFamilies,
        getAdapterFamilyId,
        getCoinAdapter,
        getDefaultCoinAdapter,
        buildInfo,
        generateMnemonic,
        mnemonicToSeed,
        runBip39SelfTest,
        runRecoveryBackupSelfTest,
        setRecoveryControlsEnabled,
        writeClipboard,
        downloadBlob,
        downloadText,
        createWorker,
        addressSearch,
        openRecoverySource,
        installSilentPaymentFeature,
        installBip85Feature,
        installBip38EncryptionFeature,
        installMessageSigningFeature,
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
        resultCoinJoinTab,
        resultCoinJoinExternalTab,
        resultCoinJoinInternalTab,
        toggleSensitiveValues,
        toggleResultSecrets,
        copyMnemonicButton,
        copyWatchOnlyButton,
        downloadWatchOnlyButton,
        descriptorButtons,
        cancelDerivationButton,
        expectedAddress,
        searchStart,
        searchCount,
        searchAddressButton,
        addressSearch: addressSearchFields,
        generate12Button,
        generate15Button,
        generate18Button,
        generate21Button,
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
      let recoverySourceRevealed = false;
      let resultSecretsRevealed = false;
      let derivationRevision = 0;
      let derivationsInFlight = 0;
      let cancellationRequested = false;
      let resultWindowStart = 0;
      let activeDerivationWorker: DerivationWorkerClient | null = null;
      let mainRecoverySourceRevision = 0;
      let activeFeatureTab: 'silent-payment' | 'bip85' | 'coinjoin' | null = null;
      let cryptoReady = false;
      const adapterSettings = new AdapterSettingsStore(getAdapterFamilyId);
      const automaticDerivation = new AutomaticDerivationScheduler(window);
      /** Remembers which CoinJoin sub-branch was last shown, so re-activating the Dash Mobile CoinJoin · DIP9 tab returns to it. */
      let activeCoinJoinBranch: 'coinjoin-external' | 'coinjoin-internal' = 'coinjoin-external';

      function optionalElement<T extends Element>(selector: string): T | null {
        return typeof document.querySelector === 'function' ? document.querySelector<T>(selector) : null;
      }

      const includeSilentPayment = optionalElement<HTMLInputElement>('#include-silent-payment');
      const silentPaymentTab = optionalElement<HTMLButtonElement>('#silent-payment-tab');
      const silentPaymentPanel = optionalElement<HTMLElement>('#silent-payment-panel');
      const includeBip85 = optionalElement<HTMLInputElement>('#include-bip85');
      const bip85Tab = optionalElement<HTMLButtonElement>('#bip85-tab');
      const bip85Panel = optionalElement<HTMLElement>('#bip85-panel');
      const coinJoinTab = optionalElement<HTMLButtonElement>('#coinjoin-tab');
      const derivationPanel = optionalElement<HTMLElement>('#derivation-panel');
      const mainResults = optionalElement<HTMLElement>('#results');

      const resultExport = createResultExportController({
        secretsRevealed: () => resultSecretsRevealed,
        writeClipboard,
        downloadBlob,
        flashCopied: (button) => view.flashCopied(button),
        setDownloadPreparing: (button, preparing) => view.setDownloadPreparing(button, preparing),
        showError,
        showStatus,
      });
      const copyText = resultExport.copyText;

      const bip38Feature = installBip38EncryptionFeature?.({
        document,
        controls,
        adapter: () => adapter,
        result: () => currentResult,
        branch: () => activeResultBranch,
        mnemonic: () => mnemonic.value,
        passphrase: () => passphrase.value,
        mnemonicToSeed,
        createWorker,
        render: () => renderCurrent(),
      });
      const encryptedBip38ByBranch = bip38Feature?.encryptedByBranch ?? new Map<ResultBranch, Map<number, string>>();
      const visibleBip38RowsByBranch = bip38Feature?.visibleRowsByBranch ?? new Map<ResultBranch, number>();

      const mnemonicDiagnostic = installMnemonicDiagnosticFeature({
        document,
        view,
        mnemonic,
        passphrase,
        sourceRevealed: () => recoverySourceRevealed,
        mnemonicToSeed,
      });
      const updateWordCount = mnemonicDiagnostic.update;
      const mnemonicMayBeComplete = mnemonicDiagnostic.mayBeComplete;

      let bip85Feature: ReturnType<typeof import('./bip85-feature.js').installBip85Feature> | null = null;
      const messageSigning = installMessageSigningFeature?.({
        document,
        mainSource: () => ({ adapter, controls, mnemonic: mnemonic.value, passphrase: passphrase.value }),
        bip85Source: () =>
          bip85Feature?.childSource() ?? { adapter: null, controls: null, mnemonic: null, passphrase: '' },
        mnemonicToSeed,
        createWorker,
        copy: (button, text) => {
          void copyText(button, text, false);
        },
      });
      bip85Feature =
        installBip85Feature?.({
          document,
          coinFamilies,
          getAdapterFamilyId,
          getCoinAdapter,
          getDefaultCoinAdapter,
          parentMnemonic: () => mnemonic.value,
          parentPassphrase: () => passphrase.value,
          isActive: () => activeFeatureTab === 'bip85',
          mnemonicMayBeComplete,
          cryptoReady: () => cryptoReady,
          secretsRevealed: () => resultSecretsRevealed,
          setSecretsRevealed: (revealed) => setResultSecretsVisibility(revealed),
          mnemonicToSeed,
          createWorker,
          ...(messageSigning === undefined ? {} : { messageSigning }),
          copyText,
          copyBulkFrom: resultExport.copyRows,
          downloadRowsFrom: resultExport.downloadRows,
          downloadText,
          showError,
          showStatus,
        }) ?? null;

      const largeRequestPolicy = createLargeRequestPolicy({
        adapter: () => adapter,
        activeFeatureTab: () => activeFeatureTab,
        showConfirmation: () => view.showLargeRequestConfirmation(),
        showStatus,
      });

      function placeResultSecretsToggle(): void {
        // The child-wallet result has its own nearby synchronized control. Keeping
        // the global control in the BIP85 heading duplicates the same action far
        // above the keys and makes the workspace harder to understand.
        if (activeFeatureTab === 'bip85') {
          toggleResultSecrets.hidden = true;
          return;
        }
        toggleResultSecrets.hidden = false;
        const slotSelector =
          activeFeatureTab === 'silent-payment'
            ? '#silent-payment-secret-control-slot'
            : currentResult === null
              ? '#default-result-secret-control-slot'
              : '#main-result-secret-control-slot';
        optionalElement<HTMLElement>(slotSelector)?.append(toggleResultSecrets);
      }

      function setFeatureTab(next: 'silent-payment' | 'bip85' | 'coinjoin' | null): void {
        activeFeatureTab = next;
        const supplemental = next === 'silent-payment' || next === 'bip85';
        derivationPanel?.classList.toggle('feature-tab-active', supplemental);
        if (silentPaymentPanel !== null) silentPaymentPanel.hidden = next !== 'silent-payment';
        if (bip85Panel !== null) bip85Panel.hidden = next !== 'bip85';
        for (const button of controls.protocolTabs.querySelectorAll<HTMLButtonElement>('.protocol-tab')) {
          const selected = next === null ? button.dataset.adapterId === adapter.id : button.dataset.featureTab === next;
          button.classList.toggle('active', selected);
          button.setAttribute('aria-checked', String(selected));
          button.tabIndex = selected ? 0 : -1;
        }
        if (mainResults !== null) mainResults.hidden = supplemental || currentResult === null;
        placeResultSecretsToggle();
        updateActivePathPreview();
      }

      function updateActivePathPreview(): void {
        view.updatePathPreview(adapter);
        if (activeFeatureTab !== 'coinjoin' || adapter.coinJoin === undefined) return;
        try {
          const input = readControls(adapter, controls);
          const paths = adapter.coinJoin.pathPreview(input);
          controls.preview.textContent = `${paths.external}  ·  ${paths.internal}`;
        } catch {
          // The regular control validation will surface partially edited values.
        }
      }

      function syncFeatureToggle(
        checkbox: HTMLInputElement | null,
        tab: HTMLButtonElement | null,
        feature: 'silent-payment' | 'bip85' | 'coinjoin',
      ): void {
        if (checkbox === null || tab === null) return;
        if (feature === 'silent-payment') {
          const available = installSilentPaymentFeature !== undefined;
          checkbox.closest<HTMLElement>('label')!.hidden = !available;
          checkbox.disabled = !available;
          if (!available) checkbox.checked = false;
        }
        tab.hidden = checkbox.disabled || !checkbox.checked;
        if (!checkbox.checked && activeFeatureTab === feature) {
          setFeatureTab(null);
          scheduleAutomaticDerivation();
        }
      }

      includeSilentPayment?.addEventListener('change', () =>
        syncFeatureToggle(includeSilentPayment, silentPaymentTab, 'silent-payment'),
      );
      includeBip85?.addEventListener('change', () => syncFeatureToggle(includeBip85, bip85Tab, 'bip85'));
      controls.includeCoinJoin.addEventListener('change', () =>
        syncFeatureToggle(controls.includeCoinJoin, coinJoinTab, 'coinjoin'),
      );
      silentPaymentTab?.addEventListener('click', () => {
        if (installSilentPaymentFeature === undefined) return;
        cancelAutomaticDerivation();
        stopActiveDerivation('Derivation mode changed to Silent Payments.');
        derivationRevision += 1;
        clearResults();
        setFeatureTab('silent-payment');
        if (mnemonicMayBeComplete()) silentPaymentFeature?.derive();
      });
      bip85Tab?.addEventListener('click', () => {
        cancelAutomaticDerivation();
        stopActiveDerivation('Derivation mode changed to BIP85.');
        derivationRevision += 1;
        clearResults();
        setFeatureTab('bip85');
        if (mnemonicMayBeComplete()) void bip85Feature?.derive();
      });
      coinJoinTab?.addEventListener('click', () => {
        if (adapter.coinJoin === undefined) return;
        cancelAutomaticDerivation();
        stopActiveDerivation('Derivation mode changed to Dash Mobile CoinJoin.');
        invalidateAddressSearch();
        derivationRevision += 1;
        clearResults();
        largeRequestPolicy.clear();
        view.resetDeriveAction();
        setFeatureTab('coinjoin');
        if (mnemonicMayBeComplete()) void deriveCurrent(true);
      });
      const silentPaymentFeature = installSilentPaymentFeature?.({
        document,
        mnemonic: () => mnemonic.value,
        passphrase: () => passphrase.value,
        mnemonicToSeed,
        createWorker,
        isActive: () => activeFeatureTab === 'silent-payment',
        mnemonicMayBeComplete,
      });

      function stopActiveDerivation(message = 'Derivation superseded by a new request.'): void {
        activeDerivationWorker?.terminate(new DerivationCancelledError(message));
        activeDerivationWorker = null;
      }

      function invalidateAddressSearch(): void {
        addressSearch?.invalidate();
        view.hideSearchResult();
      }

      function clearResults(): void {
        if (messageSigning?.activeSource() === 'main') {
          messageSigning?.close();
        }
        bip38Feature?.cancel('BIP38 encryption cancelled because results changed.');
        encryptedBip38ByBranch.clear();
        visibleBip38RowsByBranch.clear();
        view.clearResults(currentResult, branchResultStates);
        branchResultStates.clear();
        currentResult = null;
        selected = new Set();
        activeResultBranch = 'receive';
        resultWindowStart = 0;
        placeResultSecretsToggle();
        updateBulkActions();
      }

      function updateResultBranchTabs(): void {
        view.updateResultBranchTabs(currentResult, branchResultStates, activeResultBranch);
      }

      function activateResultBranch(branch: ResultBranch, render = true): void {
        const state = branchResultStates.get(branch);
        if (state === undefined) return;
        activeResultBranch = branch;
        if (branch === 'coinjoin-external' || branch === 'coinjoin-internal') activeCoinJoinBranch = branch;
        currentResult = state.result;
        selected = state.selected;
        resultWindowStart = state.windowStart;
        updateResultBranchTabs();
        placeResultSecretsToggle();
        if (render) {
          renderCurrent();
          if (bip38Feature?.isReady() === true) bip38Feature?.start();
        }
      }

      /** Selecting the top-level Dash Mobile CoinJoin · DIP9 tab restores whichever nested External/Internal branch was last shown. */
      function activateCoinJoinTab(render = true): void {
        const remembered = branchResultStates.has(activeCoinJoinBranch)
          ? activeCoinJoinBranch
          : branchResultStates.has('coinjoin-external')
            ? 'coinjoin-external'
            : 'coinjoin-internal';
        activateResultBranch(remembered, render);
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
        const signingFormat = currentResult === null ? null : (messageSigning?.format(currentResult.id) ?? null);
        const rowLimit = visibleBip38RowsByBranch.get(activeResultBranch);
        const canEncryptBip38 =
          bip38Feature !== undefined && currentResult !== null && bip38Feature.supportsResult(currentResult.id);
        bip38Feature?.syncAvailability(canEncryptBip38);
        return {
          mode: displayMode,
          selected,
          secretsRevealed: resultSecretsRevealed,
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
          canSignMessages: signingFormat !== null,
          onSignMessage(index: number, address: string) {
            if (currentResult !== null) {
              messageSigning?.open(currentResult, activeResultBranch, 'main', index, address);
            }
          },
          encryptedBip38: encryptedBip38ByBranch.get(activeResultBranch) ?? new Map<number, string>(),
          ...(rowLimit === undefined ? {} : { rowLimit }),
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
          resultSecretsRevealed,
        );
      }

      function updateBulkActions(): void {
        view.updateBulkActions(currentResult, selected, adapter, displayMode, resultSecretsRevealed);
      }

      function sensitiveField(scope: 'summary' | 'row', fieldKey: string, rowIndex?: number): ResultField | undefined {
        if (currentResult === null) return undefined;
        if (scope === 'row' && fieldKey === 'bip38EncryptedKey' && rowIndex !== undefined) {
          const value = encryptedBip38ByBranch.get(activeResultBranch)?.get(rowIndex);
          return value === undefined
            ? undefined
            : {
                key: fieldKey,
                label: 'Encrypted private key · BIP38',
                value,
                secret: true,
              };
        }
        if (scope === 'summary') {
          return [...currentResult.basicSummary, ...currentResult.summary].find((field) => field.key === fieldKey);
        }
        const row = currentResult.rows.find((candidate) => candidate.index === rowIndex);
        return row === undefined ? undefined : displayedFields(row, 'advanced').find((field) => field.key === fieldKey);
      }

      async function copyBulk(button: HTMLButtonElement, action: ExportAction): Promise<void> {
        if (currentResult === null) return;
        await resultExport.copyRows(button, action, {
          adapter,
          result: currentResult,
          selected,
          mode: displayMode,
          format: exportFormat.value as ExportFormat,
        });
      }

      async function downloadSelectedRows(button: HTMLButtonElement, action: ExportAction): Promise<void> {
        if (currentResult === null) return;
        await resultExport.downloadRows(
          button,
          action,
          {
            adapter,
            result: currentResult,
            selected,
            mode: displayMode,
            format: exportFormat.value as ExportFormat,
          },
          updateBulkActions,
        );
      }

      function setRecoverySourceVisibility(revealed: boolean): void {
        recoverySourceRevealed = revealed;
        view.setRecoverySourceVisibility(revealed);
        updateWordCount();
      }

      function setResultSecretsVisibility(revealed: boolean): void {
        resultSecretsRevealed = revealed;
        view.setResultSecretsVisibility(revealed);
        bip85Feature?.setSecretsVisible(revealed);
        optionalElement<HTMLElement>('#silent-payment-result')?.classList.toggle('revealed', revealed);
        updateBulkActions();
      }

      function cancelAutomaticDerivation(): void {
        automaticDerivation.cancel();
      }

      function scheduleAutomaticDerivation(): void {
        automaticDerivation.schedule(
          () => cryptoReady && mnemonicMayBeComplete(),
          () => {
            if (activeFeatureTab === 'silent-payment') {
              silentPaymentFeature?.derive();
            } else if (activeFeatureTab === 'bip85') {
              void bip85Feature?.derive();
            } else {
              void deriveCurrent(true);
            }
          },
        );
      }

      function rememberCurrentSettings(): void {
        try {
          adapterSettings.remember(adapter, readControls(adapter, controls));
        } catch {
          // Invalid partially edited controls are not persisted across variants.
        }
      }

      function resetForAdapter(next: CoinAdapter, autoDerive = true): void {
        cancelAutomaticDerivation();
        invalidateAddressSearch();
        rememberCurrentSettings();
        stopActiveDerivation();
        derivationRevision += 1;
        clearResults();
        activeCoinJoinBranch = 'coinjoin-external';
        largeRequestPolicy.clear();
        view.resetDeriveAction();
        adapter = next;
        adapterSettings.selectVariant(adapter);
        const remembered = adapterSettings.controlsFor(adapter);
        view.configureControls(adapter, applySharedDerivationControls(adapter, remembered.values, remembered.shared));
        syncFeatureToggle(includeSilentPayment, silentPaymentTab, 'silent-payment');
        syncFeatureToggle(controls.includeCoinJoin, coinJoinTab, 'coinjoin');
        clearMessages();
        view.hideSearchResult();
        if (autoDerive && mnemonicMayBeComplete()) void deriveCurrent(true);
      }

      view.populateCoinSelect();
      const initialCoinFamily = coinFamilies[0]!;
      adapter = getDefaultCoinAdapter(initialCoinFamily.id);
      adapterSettings.selectVariant(adapter);
      view.configureControls(adapter);
      syncFeatureToggle(controls.includeCoinJoin, coinJoinTab, 'coinjoin');
      updateWordCount();
      updateModeButtons();
      updateBulkActions();

      function populateBuildPassport(): void {
        view.populateBuildPassport(buildInfo);
      }

      function setCryptoControlsEnabled(enabled: boolean): void {
        view.setCryptoControlsEnabled(enabled);
        setRecoveryControlsEnabled(enabled);
      }

      async function initializeCryptoRuntime(): Promise<void> {
        setCryptoControlsEnabled(false);
        try {
          const report = await runStartupSelfTests({ runBip39SelfTest, runRecoveryBackupSelfTest, createWorker });
          cryptoReady = report.passed;
          if (!report.passed) throw new Error('A cryptographic startup check returned a failed result.');
          view.showCryptoSelfTestPassed(report.checks, report.durationMs);
          setCryptoControlsEnabled(true);
          scheduleAutomaticDerivation();
        } catch (cause) {
          cryptoReady = false;
          view.showCryptoSelfTestFailed(cause);
          setCryptoControlsEnabled(false);
          showError('Cryptographic self-test failed. This build will not derive wallet keys.');
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
        if (!largeRequestPolicy.authorize(input, automatic)) return;
        clearMessages();
        clearResults();
        cancellationRequested = false;
        view.showDerivationRunning();
        derivationsInFlight += 1;
        const revision = ++derivationRevision;
        const requestedAdapter = adapter;
        const requestedFeatureTab = activeFeatureTab;
        const derivationLabel =
          requestedFeatureTab === 'coinjoin' ? 'Dash Mobile CoinJoin · DIP9' : requestedAdapter.variantLabel;
        let seed: Uint8Array | null = null;
        const worker = createWorker();
        activeDerivationWorker = worker;
        try {
          showStatus('Initialising cryptography locally…');
          await worker.ready();
          if (revision !== derivationRevision || requestedAdapter !== adapter) return;
          adapterSettings.remember(requestedAdapter, input);
          seed = mnemonicToSeed(mnemonic.value, passphrase.value);
          const resultBranches = largeRequestPolicy.plannedBranches(input);
          const totalRequested = input.count * resultBranches.length;
          if (totalRequested > 1000) {
            showStatus(
              `Large request: ${totalRequested.toLocaleString()} results will be generated and displayed in batches. Keep this tab open; you can cancel immediately.`,
            );
          }
          const outcome = await runStreamedDerivation({
            worker,
            adapter: requestedAdapter,
            input,
            branches: resultBranches,
            seed,
            isStale: () => revision !== derivationRevision || requestedAdapter !== adapter,
            isCancelled: () => cancellationRequested,
            onInitialBatch: (resultBranch, result) => {
              const state = createBranchResultState(result);
              branchResultStates.set(resultBranch, state);
              view.showResults();
              if (activeFeatureTab !== null && activeFeatureTab !== 'coinjoin' && mainResults !== null)
                mainResults.hidden = true;
              if (currentResult === null) activateResultBranch(resultBranch, false);
              updateResultBranchTabs();
              if (activeResultBranch === resultBranch) renderStreamingProgress(true);
            },
            onAppendedBatch: (resultBranch, rows) => {
              const state = branchResultStates.get(resultBranch);
              if (state === undefined) throw new Error('The result branch state was lost during streamed derivation.');
              for (const row of rows) state.selected.add(row.index);
              if (activeResultBranch === resultBranch) renderStreamingProgress(false);
            },
            onProgress: (resultBranch, branchCount, totalCount) => {
              const branchProgress =
                requestedAdapter.addressBranches === undefined
                  ? ''
                  : ` ${resultBranch} branch ${branchCount.toLocaleString()} of ${input.count.toLocaleString()};`;
              showStatus(
                `Derived${branchProgress} ${totalCount.toLocaleString()} of ${totalRequested.toLocaleString()} total results for ${derivationLabel}.`,
              );
            },
            yieldTurn: yieldToBrowser,
          });
          if (outcome.stale) return;
          const generatedTotal = outcome.generated;
          if (currentResult !== null) renderStreamingProgress(true);
          updateBulkActions();
          if (cancellationRequested) {
            showStatus(
              `Generation cancelled after ${generatedTotal.toLocaleString()} of ${totalRequested.toLocaleString()} results. Displayed partial branches remain available.`,
            );
          } else if (automatic) {
            showStatus(`Automatically derived ${generatedTotal.toLocaleString()} results for ${derivationLabel}.`);
          } else {
            showStatus(`Derived ${generatedTotal.toLocaleString()} results for ${derivationLabel}.`);
          }
          if (!cancellationRequested && bip38Feature?.isReady() === true) bip38Feature?.start();
          if (!automatic) view.scrollResultsIntoView();
        } catch (cause) {
          if (revision !== derivationRevision) return;
          if (cause instanceof DerivationCancelledError && cancellationRequested) {
            if (branchResultStates.size === 0) clearResults();
            const generated = [...branchResultStates.values()].reduce(
              (sum, state) => sum + state.result.rows.length,
              0,
            );
            showStatus(
              `Generation cancelled after ${generated.toLocaleString()} results. The worker stopped immediately; displayed results remain available.`,
            );
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
        setFeatureTab(null);
        const remembered = adapterSettings.variantForFamily(controls.coin.value);
        resetForAdapter(
          remembered === undefined ? getDefaultCoinAdapter(controls.coin.value) : getCoinAdapter(remembered),
        );
      });
      controls.includeLegacyMobile.addEventListener('change', () => {
        if (!controls.includeLegacyMobile.checked && adapter.id === 'dash-legacy-mobile') {
          resetForAdapter(getCoinAdapter('dash-core'));
          return;
        }
        resetForAdapter(adapter, false);
      });
      controls.protocolTabs.addEventListener('click', (event) => {
        const id = view.protocolAdapterIdFrom(event.target);
        if (id === undefined) return;
        setFeatureTab(null);
        if (id === adapter.id) {
          cancelAutomaticDerivation();
          stopActiveDerivation('Derivation mode changed.');
          invalidateAddressSearch();
          derivationRevision += 1;
          clearResults();
          largeRequestPolicy.clear();
          view.resetDeriveAction();
          if (mnemonicMayBeComplete()) void deriveCurrent(true);
          return;
        }
        resetForAdapter(getCoinAdapter(id));
        view.focusProtocolButton(id);
      });
      controls.protocolTabs.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const adapterIds = view.protocolAdapterIds();
        const current = adapterIds.indexOf(adapter.id);
        if (current < 0 || adapterIds.length === 0) return;
        event.preventDefault();
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? adapterIds.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + adapterIds.length) % adapterIds.length;
        const id = adapterIds[nextIndex];
        if (id === undefined) return;
        resetForAdapter(getCoinAdapter(id));
        view.focusProtocolButton(id);
      });
      if (openRecoverySource !== undefined) {
        installRecoverySourceController({
          document,
          open: openRecoverySource,
          childReference: () => bip85Feature?.sourceReference() ?? null,
          originalReference: () => {
            const revision = mainRecoverySourceRevision;
            return {
              label: 'Original recovery phrase',
              read: () =>
                revision === mainRecoverySourceRevision
                  ? { mnemonic: mnemonic.value, passphrase: passphrase.value }
                  : null,
            };
          },
          showError,
        });
      }

      for (const control of [
        controls.network,
        controls.account,
        controls.branchInput,
        controls.branchSelect,
        controls.includeChange,
        controls.includeCoinJoin,
        controls.start,
        controls.count,
      ]) {
        const refresh = (): void => {
          stopActiveDerivation();
          invalidateAddressSearch();
          derivationRevision += 1;
          if (currentResult !== null) clearResults();
          updateActivePathPreview();
          rememberCurrentSettings();
          largeRequestPolicy.clear();
          view.resetDeriveAction();
          scheduleAutomaticDerivation();
        };
        control.addEventListener('input', refresh);
        control.addEventListener('change', refresh);
      }
      for (const input of [mnemonic, passphrase]) {
        input.addEventListener('input', () => {
          mainRecoverySourceRevision += 1;
          stopActiveDerivation();
          invalidateAddressSearch();
          derivationRevision += 1;
          if (currentResult !== null) clearResults();
          updateWordCount();
          largeRequestPolicy.clear();
          view.resetDeriveAction();
          scheduleAutomaticDerivation();
        });
      }

      for (const input of [expectedAddress, searchStart, searchCount])
        input?.addEventListener('input', invalidateAddressSearch);

      toggleSensitiveValues.addEventListener('click', () => setRecoverySourceVisibility(!recoverySourceRevealed));
      toggleResultSecrets.addEventListener('click', () => setResultSecretsVisibility(!resultSecretsRevealed));
      for (const [words, generateButton] of [
        [12, generate12Button],
        [15, generate15Button],
        [18, generate18Button],
        [21, generate21Button],
        [24, generate24Button],
      ] as const) {
        generateButton.addEventListener('click', () => {
          mainRecoverySourceRevision += 1;
          cancelAutomaticDerivation();
          invalidateAddressSearch();
          derivationRevision += 1;
          clearResults();
          clearMessages();
          try {
            view.setGeneratedMnemonic(generateMnemonic(words), adapter.defaults.count);
            rememberCurrentSettings();
            updateWordCount();
            showStatus(
              `Generated a new ${words}-word BIP39 recovery phrase using crypto.getRandomValues(). Deriving ${adapter.defaults.count} results…`,
            );
            void deriveCurrent(true);
          } catch (cause) {
            showError(cause instanceof Error ? cause.message : 'Secure phrase generation failed.');
          }
        });
      }

      clearAllButton.addEventListener('click', () => {
        mainRecoverySourceRevision += 1;
        cancellationRequested = true;
        cancelAutomaticDerivation();
        stopActiveDerivation('Derivation cleared by the user.');
        invalidateAddressSearch();
        derivationRevision += 1;
        largeRequestPolicy.clear();
        // Browser strings are immutable, so this only releases DOM references; mutable seed bytes are zeroed separately.
        clearResults();
        activeCoinJoinBranch = 'coinjoin-external';
        adapterSettings.clear();
        view.configureControls(adapter);
        setRecoverySourceVisibility(false);
        setResultSecretsVisibility(false);
        clearMessages();
        messageSigning?.invalidate();
        if (messageSigning?.isOpen() === true) messageSigning.close();
        bip38Feature?.reset();
        bip85Feature?.reset();
        silentPaymentFeature?.cancelScheduledRefresh();
        if (includeSilentPayment !== null) {
          includeSilentPayment.checked = false;
        }
        if (includeBip85 !== null) includeBip85.checked = false;
        syncFeatureToggle(includeSilentPayment, silentPaymentTab, 'silent-payment');
        syncFeatureToggle(includeBip85, bip85Tab, 'bip85');
        setFeatureTab(null);
        const silentPaymentLabelsField = optionalElement<HTMLInputElement>('#silent-payment-labels');
        if (silentPaymentLabelsField !== null) silentPaymentLabelsField.value = '';
        optionalElement<HTMLElement>('#silent-payment-result')?.setAttribute('hidden', '');
        optionalElement<HTMLElement>('#silent-payment-error')?.setAttribute('hidden', '');
        optionalElement<HTMLElement>('#silent-payment-labeled-list')?.replaceChildren();
        view.clearAllInputs();
        mnemonicDiagnostic.reset();
      });

      function concealSensitiveValues(): void {
        if (recoverySourceRevealed) setRecoverySourceVisibility(false);
        if (resultSecretsRevealed) setResultSecretsVisibility(false);
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') concealSensitiveValues();
      });
      window.addEventListener('blur', concealSensitiveValues);

      modeBasic.addEventListener('click', () => {
        displayMode = 'basic';
        setActiveWindowStart(0);
        updateModeButtons();
        renderCurrent();
      });
      modeAdvanced.addEventListener('click', () => {
        displayMode = 'advanced';
        setActiveWindowStart(0);
        updateModeButtons();
        renderCurrent();
      });

      const topLevelTabButtons: ReadonlyArray<readonly [HTMLButtonElement, TopLevelResultTab]> = [
        [resultReceiveTab, 'receive'],
        [resultChangeTab, 'change'],
        [resultCoinJoinTab, 'coinjoin'],
      ];
      installResultTabNavigation({
        topLevel: topLevelTabButtons,
        coinJoinBranches: [
          [resultCoinJoinExternalTab, 'coinjoin-external'],
          [resultCoinJoinInternalTab, 'coinjoin-internal'],
        ],
        activateTopLevel(tab) {
          if (tab === 'coinjoin') activateCoinJoinTab();
          else activateResultBranch(tab);
        },
        activateBranch: activateResultBranch,
        branchEnabled: view.resultBranchEnabled,
        focusBranch: view.focusResultBranch,
      });

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
        replaceActiveSelection(
          invertSelection(
            currentResult.rows.map((row) => row.index),
            selected,
          ),
        );
        renderCurrent();
      });

      exportFormat.addEventListener('change', updateBulkActions);

      copyMnemonicButton.addEventListener('click', () => {
        if (!recoverySourceRevealed || mnemonic.value.trim().length === 0) {
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

      installAccountExportController({
        document,
        buttons: descriptorButtons,
        result: () => currentResult,
        secretsRevealed: () => resultSecretsRevealed,
        copyText,
        downloadText,
        showError,
        showStatus,
      });

      copyWatchOnlyButton.addEventListener('click', () => {
        const watchOnly = currentResult?.watchOnly;
        if (watchOnly === undefined) return;
        void copyText(copyWatchOnlyButton, watchOnly.text, true);
      });

      downloadWatchOnlyButton.addEventListener('click', () => {
        const watchOnly = currentResult?.watchOnly;
        if (watchOnly === undefined) return;
        if (!resultSecretsRevealed) {
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

      searchAddressButton?.addEventListener('click', () => {
        if (addressSearch === undefined) return;
        if (!cryptoReady) {
          showError('Cryptographic self-test has not completed successfully. Address search is blocked.');
          return;
        }
        invalidateAddressSearch();
        addressSearch.start({
          adapter,
          controls,
          fields: addressSearchFields!,
          mnemonic,
          passphrase,
          view,
          readControls,
          mnemonicToSeed,
          createWorker,
        });
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
