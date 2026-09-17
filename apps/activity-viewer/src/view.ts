import { requireIdElement } from '@ckd/ui/dom.js';
import type { BUILD_INFO } from '@ckd/build-info';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import { createActivityRenderers, formatDate } from './activity-renderers.js';
import { createActivityResultsView } from './activity-results-view.js';
import { looksLikeAutoOrchardInput } from './detection.js';

export type ViewerMode = 'shielded' | 'core' | 'platform' | 'identity';
export type ViewerQueryMode = 'single' | 'batch';
export type ViewerDetectionMode = 'auto' | 'advanced';

export interface ViewerBatchResultOption {
  id: string;
  label: string;
  status: 'complete' | 'failed';
  error?: string;
}

export function createActivityViewerView(document: Document, buildInfo: typeof BUILD_INFO) {
  const required = <T extends HTMLElement>(id: string): T =>
    requireIdElement<T>(document, id, 'Activity Viewer template');
  const form = required<HTMLFormElement>('viewer-form');
  const networkInput = required<HTMLSelectElement>('viewer-network');
  const keyCapabilityInput = required<HTMLSelectElement>('viewer-key-capability');
  const capabilityControls = required<HTMLDivElement>('viewer-capability-controls');
  const historyField = required<HTMLDivElement>('viewer-history-field');
  const historyLimitInput = required<HTMLInputElement>('viewer-history-limit');
  const batchControls = required<HTMLDivElement>('viewer-batch-controls');
  const batchConcurrencyInput = required<HTMLSelectElement>('viewer-batch-concurrency');
  const singleInputPanel = required<HTMLDivElement>('viewer-single-input-panel');
  const batchInputPanel = required<HTMLDivElement>('viewer-batch-input-panel');
  const viewingKeyInput = required<HTMLInputElement>('full-viewing-key');
  const batchInput = required<HTMLTextAreaElement>('viewer-batch-input');
  const advancedModes = required<HTMLDivElement>('viewer-advanced-modes');
  const inputLabel = required<HTMLLabelElement>('viewer-input-label');
  const inputHelp = required<HTMLParagraphElement>('viewer-input-help');
  const keyMode = required<HTMLSpanElement>('viewer-key-mode');
  const privacyChip = required<HTMLElement>('viewer-privacy-chip');
  const revealButton = required<HTMLButtonElement>('reveal-viewing-key');
  const revealBatchButton = required<HTMLButtonElement>('reveal-batch-input');
  const scanButton = required<HTMLButtonElement>('scan-button');
  const scanButtonLabel = required<HTMLSpanElement>('scan-button-label');
  const cancelButton = required<HTMLButtonElement>('cancel-button');
  const clearButton = required<HTMLButtonElement>('clear-viewer');
  const errorBox = required<HTMLDivElement>('viewer-error');
  const statusBox = required<HTMLDivElement>('viewer-status');
  const results = required<HTMLElement>('viewer-results');
  const resultsHeading = required<HTMLHeadingElement>('viewer-results-heading');
  const resultsDescription = required<HTMLParagraphElement>('viewer-results-description');
  const batchResults = required<HTMLDivElement>('viewer-batch-results');
  const resultHelp = required<HTMLElement>('viewer-result-help');
  const summary = required<HTMLDivElement>('viewer-summary');
  const activityList = required<HTMLDivElement>('viewer-activity');
  const completeness = required<HTMLParagraphElement>('viewer-completeness');
  const ledgerTitle = required<HTMLElement>('viewer-ledger-title');
  const ledgerOrder = required<HTMLElement>('viewer-ledger-order');
  const exportActions = required<HTMLElement>('viewer-export-actions');
  const exportCsvButton = required<HTMLButtonElement>('viewer-export-csv');
  const exportXlsxButton = required<HTMLButtonElement>('viewer-export-xlsx');
  const exportJsonButton = required<HTMLButtonElement>('viewer-export-json');
  const diagnosticState = required<HTMLElement>('diagnostic-state');
  const diagnosticMode = required<HTMLElement>('diagnostic-mode');
  const diagnosticSource = required<HTMLElement>('diagnostic-source');
  const diagnosticRequests = required<HTMLElement>('diagnostic-requests');
  const diagnosticProof = required<HTMLElement>('diagnostic-proof');
  const diagnosticRemoteTime = required<HTMLElement>('diagnostic-remote-time');
  const diagnosticTiming = required<HTMLElement>('diagnostic-timing');
  const diagnosticDetail = required<HTMLElement>('diagnostic-detail');
  const selfTestStatus = required<HTMLElement>('viewer-crypto-self-test-status');
  const selfTestDetails = required<HTMLElement>('viewer-crypto-self-test-details');
  const runtimeStatus = required<HTMLElement>('viewer-runtime');
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-viewer-mode]')];
  const queryModeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-query-mode]')];
  const detectionModeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-detection-mode]')];
  let queryRunning = false;
  let cryptoReady = false;
  let activeMode: ViewerMode = 'shielded';
  let queryStarted = 0;
  let requestCount = 0;
  let remoteDuration = 0;
  let localDuration = 0;
  let queryMode: ViewerQueryMode = 'single';
  let detectionMode: ViewerDetectionMode = 'auto';
  const renderers = createActivityRenderers(document);
  const activityResults = createActivityResultsView({
    document,
    results,
    resultsHeading,
    resultsDescription,
    resultHelp,
    summary,
    activityList,
    completeness,
    ledgerTitle,
    ledgerOrder,
    renderers,
  });

  function setDiagnosticState(state: 'idle' | 'running' | 'passed' | 'failed', label: string): void {
    diagnosticState.className = `diagnostic-state ${state}`;
    diagnosticState.textContent = label;
  }

  function updateTiming(): void {
    const total = Math.round(performance.now() - queryStarted);
    diagnosticTiming.textContent = `remote ${Math.round(remoteDuration)} ms · local ${Math.round(localDuration)} ms · total ${total} ms`;
  }

  required<HTMLElement>('viewer-build-version').textContent = buildInfo.version;
  required<HTMLElement>('viewer-build-date').textContent = buildInfo.releaseDate;
  required<HTMLElement>('viewer-build-edition').textContent = buildInfo.edition;
  required<HTMLElement>('viewer-build-profile').textContent = buildInfo.profile;
  required<HTMLElement>('viewer-build-fingerprint').textContent = buildInfo.fingerprint;
  required<HTMLElement>('viewer-artifact-checksum-file').textContent = buildInfo.checksumFile;
  required<HTMLElement>('viewer-build-footer').textContent =
    `Build ${buildInfo.version} · ${buildInfo.releaseDate} · ${buildInfo.fingerprint.slice(0, 16)}…`;

  return {
    document,
    form,
    networkInput,
    keyCapabilityInput,
    historyLimitInput,
    viewingKeyInput,
    batchInput,
    batchConcurrencyInput,
    revealButton,
    revealBatchButton,
    cancelButton,
    clearButton,
    exportCsvButton,
    exportXlsxButton,
    exportJsonButton,
    modeButtons,
    queryModeButtons,
    detectionModeButtons,
    ...activityResults,
    showError(message: string): void {
      errorBox.textContent = message;
      errorBox.hidden = false;
    },
    setStatus(message: string): void {
      statusBox.textContent = message;
      statusBox.hidden = message.length === 0;
    },
    clearMessages(): void {
      errorBox.textContent = '';
      errorBox.hidden = true;
      statusBox.textContent = '';
      statusBox.hidden = true;
    },
    clearResults(): void {
      results.hidden = true;
      batchResults.hidden = true;
      batchResults.replaceChildren();
      summary.replaceChildren();
      activityList.replaceChildren();
    },
    clearQueryInput(): void {
      viewingKeyInput.value = '';
      batchInput.value = '';
      viewingKeyInput.type = 'text';
      batchInput.classList.remove('concealed');
      revealButton.textContent = 'Reveal key';
      revealButton.setAttribute('aria-pressed', 'false');
      revealBatchButton.textContent = 'Reveal keys';
      revealBatchButton.setAttribute('aria-pressed', 'false');
    },
    renderBatchResults(
      options: readonly ViewerBatchResultOption[],
      activeId: string | null,
      activate: (id: string) => void,
    ): void {
      batchResults.replaceChildren(
        ...options.map((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `viewer-batch-result ${option.status}${option.id === activeId ? ' active' : ''}`;
          button.textContent = option.label;
          button.disabled = option.status === 'failed';
          button.setAttribute('aria-pressed', String(option.id === activeId));
          if (option.error !== undefined) button.title = option.error;
          if (option.status === 'complete') button.addEventListener('click', () => activate(option.id));
          return button;
        }),
      );
      batchResults.hidden = options.length === 0;
    },
    hideBatchResults(): void {
      batchResults.hidden = true;
      batchResults.replaceChildren();
    },
    setExportAvailable(available: boolean): void {
      exportActions.hidden = !available;
      exportCsvButton.disabled = !available;
      exportXlsxButton.disabled = !available;
      exportJsonButton.disabled = !available;
    },
    setExportBusy(busy: boolean): void {
      exportActions.setAttribute('aria-busy', String(busy));
      exportCsvButton.disabled = busy;
      exportXlsxButton.disabled = busy;
      exportJsonButton.disabled = busy;
    },
    setDetectionMode(mode: ViewerDetectionMode, viewerMode: ViewerMode): void {
      detectionMode = mode;
      advancedModes.hidden = mode !== 'advanced';
      for (const button of detectionModeButtons) {
        const active = button.dataset.detectionMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      this.updateInputMode(viewerMode);
    },
    setDiagnosticMode(mode: ViewerMode | 'auto' | 'mixed', network: ViewerNetwork): void {
      diagnosticMode.textContent = `${mode} · ${network}`;
    },
    startDiagnostics(mode: ViewerMode | 'auto' | 'mixed', network: ViewerNetwork, source: string): void {
      queryStarted = performance.now();
      requestCount = 0;
      remoteDuration = 0;
      localDuration = 0;
      setDiagnosticState('running', 'Running');
      diagnosticMode.textContent = `${mode} · ${network}`;
      diagnosticSource.textContent = source;
      diagnosticRequests.textContent = '0';
      diagnosticProof.textContent = 'Pending';
      diagnosticRemoteTime.textContent = '—';
      diagnosticTiming.textContent = 'Running…';
      diagnosticDetail.textContent = 'Input validation started.';
    },
    addRemoteDuration(duration: number): void {
      remoteDuration += duration;
    },
    addLocalDuration(duration: number): void {
      localDuration += duration;
    },
    recordRequest(): void {
      requestCount += 1;
      diagnosticRequests.textContent = requestCount.toLocaleString();
    },
    recordRequests(count: number): void {
      requestCount += count;
      diagnosticRequests.textContent = requestCount.toLocaleString();
    },
    setRequestCount(count: number): void {
      requestCount = count;
      diagnosticRequests.textContent = count.toLocaleString();
    },
    setDiagnosticProof(value: string): void {
      diagnosticProof.textContent = value;
    },
    setDiagnosticRemoteTime(timestampMs: number | bigint | null): void {
      diagnosticRemoteTime.textContent = formatDate(timestampMs);
    },
    setDiagnosticSource(value: string): void {
      diagnosticSource.textContent = value;
    },
    setDiagnosticDetail(value: string): void {
      diagnosticDetail.textContent = value;
    },
    updateTiming,
    finishDiagnostics(detail: string): void {
      updateTiming();
      diagnosticRequests.textContent = requestCount.toLocaleString();
      diagnosticDetail.textContent = detail;
      setDiagnosticState('passed', 'Complete');
    },
    failDiagnostics(detail: string): void {
      updateTiming();
      diagnosticRequests.textContent = requestCount.toLocaleString();
      diagnosticDetail.textContent = detail;
      setDiagnosticState('failed', 'Stopped');
    },
    canStartQuery(): boolean {
      return cryptoReady && !queryRunning;
    },
    isQueryRunning(): boolean {
      return queryRunning;
    },
    setExternalRunning(value: boolean): void {
      this.setRunning(value, cryptoReady, activeMode);
    },
    setRunning(value: boolean, selfTestPassed: boolean, mode: ViewerMode): void {
      queryRunning = value;
      cryptoReady = selfTestPassed;
      activeMode = mode;
      const coinInput = document.querySelector<HTMLSelectElement>('#viewer-coin');
      if (coinInput !== null) coinInput.disabled = value;
      document.body.classList.toggle('viewer-is-scanning', value);
      scanButton.disabled = value || !selfTestPassed;
      networkInput.disabled = value;
      keyCapabilityInput.disabled = value || detectionMode !== 'advanced' || mode !== 'shielded';
      historyLimitInput.disabled = value || (detectionMode === 'advanced' && mode === 'shielded');
      batchConcurrencyInput.disabled = value || queryMode !== 'batch';
      viewingKeyInput.disabled = value;
      batchInput.disabled = value;
      revealButton.disabled = value;
      revealBatchButton.disabled = value;
      for (const button of modeButtons) button.disabled = value;
      for (const button of queryModeButtons) button.disabled = value;
      for (const button of detectionModeButtons) button.disabled = value;
      cancelButton.disabled = !value;
    },
    showCancellationRequested(mode: ViewerMode): void {
      cancelButton.disabled = true;
      statusBox.textContent =
        mode === 'shielded' && detectionMode === 'advanced'
          ? 'Cancellation requested; waiting for the current verified DAPI page…'
          : 'Cancellation requested; waiting for the current network operation…';
      statusBox.hidden = false;
    },
    toggleViewingKeyReveal(mode: ViewerMode): void {
      if (mode !== 'shielded' && detectionMode !== 'auto') return;
      if (queryMode === 'batch') {
        const revealing = batchInput.classList.contains('concealed');
        batchInput.classList.toggle('concealed', !revealing);
        revealBatchButton.textContent = revealing ? 'Hide keys' : 'Reveal keys';
        revealBatchButton.setAttribute('aria-pressed', String(revealing));
      } else {
        const revealing = viewingKeyInput.type === 'password';
        viewingKeyInput.type = revealing ? 'text' : 'password';
        revealButton.textContent = revealing ? 'Hide key' : 'Reveal key';
        revealButton.setAttribute('aria-pressed', String(revealing));
      }
    },
    resetViewer(mode: ViewerMode): void {
      viewingKeyInput.value = '';
      batchInput.value = '';
      viewingKeyInput.type = detectionMode === 'advanced' && mode === 'shielded' ? 'password' : 'text';
      batchInput.classList.toggle('concealed', detectionMode === 'advanced' && mode === 'shielded');
      revealButton.textContent = 'Reveal key';
      revealButton.setAttribute('aria-pressed', 'false');
      revealBatchButton.textContent = 'Reveal keys';
      revealBatchButton.setAttribute('aria-pressed', 'false');
      summary.replaceChildren();
      activityList.replaceChildren();
      batchResults.replaceChildren();
      batchResults.hidden = true;
      results.hidden = true;
      errorBox.textContent = '';
      errorBox.hidden = true;
      statusBox.textContent = '';
      statusBox.hidden = true;
      setDiagnosticState('idle', 'Idle');
      diagnosticMode.textContent = `${detectionMode === 'auto' ? 'auto' : mode} · ${networkInput.value}`;
      diagnosticSource.textContent = 'Not connected';
      diagnosticRequests.textContent = '0';
      diagnosticProof.textContent = '—';
      diagnosticRemoteTime.textContent = '—';
      diagnosticTiming.textContent = '—';
      diagnosticDetail.textContent =
        'Enter an input and start a query. Failures are reported at the exact stage that stopped.';
      this.updateInputMode(mode);
    },
    setViewerMode(mode: ViewerMode): void {
      for (const button of modeButtons) {
        const active = button.dataset.viewerMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
    setQueryMode(mode: ViewerQueryMode, viewerMode: ViewerMode): void {
      queryMode = mode;
      singleInputPanel.hidden = mode !== 'single';
      batchInputPanel.hidden = mode !== 'batch';
      batchControls.hidden = mode !== 'batch';
      inputLabel.htmlFor = mode === 'batch' ? 'viewer-batch-input' : 'full-viewing-key';
      for (const button of queryModeButtons) {
        const active = button.dataset.queryMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      this.updateInputMode(viewerMode);
    },
    updateInputMode(mode: ViewerMode): void {
      const activeInput = queryMode === 'batch' ? batchInput.value : viewingKeyInput.value;
      const trimmed = activeInput.trim();
      const batchCount =
        queryMode === 'batch'
          ? new Set(
              batchInput.value
                .replaceAll('\r', '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            ).size
          : 1;
      const length = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '').length;
      const outgoingMode = keyCapabilityInput.value === 'outgoing';
      if (detectionMode === 'auto') {
        const values =
          queryMode === 'batch'
            ? batchInput.value
                .replaceAll('\r', '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            : [trimmed];
        const containsOrchard = values.some(looksLikeAutoOrchardInput);
        privacyChip.lastChild!.textContent = containsOrchard
          ? ' Auto detection · viewing keys stay local'
          : ' Automatic local detection';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = queryMode !== 'single' || !containsOrchard;
        revealBatchButton.hidden = queryMode !== 'batch' || !containsOrchard;
        viewingKeyInput.type =
          containsOrchard && revealButton.getAttribute('aria-pressed') !== 'true' ? 'password' : 'text';
        batchInput.classList.toggle(
          'concealed',
          containsOrchard && revealBatchButton.getAttribute('aria-pressed') !== 'true',
        );
        viewingKeyInput.placeholder = 'Core, Platform, Identity, or Orchard viewing key';
        batchInput.placeholder = 'One Core, Platform, Identity, or Orchard input per line';
        inputLabel.replaceChildren(document.createTextNode('Any supported Dash lookup '), keyMode);
        keyMode.textContent =
          queryMode === 'batch'
            ? `${batchCount.toLocaleString()} input${batchCount === 1 ? '' : 's'} · mixed types allowed`
            : containsOrchard
              ? 'Orchard viewing key · local scan'
              : 'Auto detect';
        inputHelp.textContent =
          queryMode === 'batch'
            ? 'Enter one value per line. Core, Platform, Identity, and Orchard inputs may be mixed. Detection happens locally before networking; Orchard pages are fetched once for every detected viewing key.'
            : 'The type is detected locally before any request. Use Advanced to force a type, or prefixes such as core:, platform:, identity:, orchard-fvk:, orchard-ivk:, and orchard-ovk: for ambiguous values.';
        scanButtonLabel.textContent =
          queryMode === 'batch' ? 'Detect & load mixed batch' : 'Detect type & load activity';
        diagnosticMode.textContent = `auto · ${networkInput.value}`;
        return;
      }
      if (mode !== 'shielded') {
        batchInput.classList.remove('concealed');
        revealBatchButton.textContent = 'Reveal keys';
        revealBatchButton.setAttribute('aria-pressed', 'false');
      }
      if (mode === 'shielded') {
        privacyChip.lastChild!.textContent = ' Key processed locally';
        capabilityControls.hidden = false;
        historyField.hidden = true;
        revealButton.hidden = queryMode !== 'single';
        revealBatchButton.hidden = queryMode !== 'batch';
        viewingKeyInput.type = revealButton.getAttribute('aria-pressed') === 'true' ? 'text' : 'password';
        viewingKeyInput.placeholder = outgoingMode
          ? 'Paste OVK explicitly labeled Outgoing Viewing Key (64 hex)'
          : 'Paste viewing bundle, FVK (192), or IVK (128 hex)';
        batchInput.placeholder = outgoingMode ? 'One 64-hex OVK per line' : 'One viewing bundle, FVK, or IVK per line';
        batchInput.classList.toggle('concealed', revealBatchButton.getAttribute('aria-pressed') !== 'true');
        inputLabel.replaceChildren(document.createTextNode('Raw Orchard Viewing Key '), keyMode);
        inputHelp.replaceChildren(
          Object.assign(document.createElement('strong'), {
            textContent: '96-byte Full Viewing Key (FVK) is recommended: ',
          }),
          document.createTextNode(
            `it finds received and sent activity, derives note nullifiers, and identifies spent notes. IVK shows received notes only; OVK shows sent outputs only.${queryMode === 'batch' ? ' Enter one key or one-line viewing bundle per line; each verified pool page is reused across the batch.' : ''}`,
          ),
        );
        scanButtonLabel.textContent =
          queryMode === 'batch' ? 'Scan batch across shielded pool' : 'Scan complete shielded pool';
        if (queryMode === 'batch')
          keyMode.textContent = `${batchCount.toLocaleString()} viewing key${batchCount === 1 ? '' : 's'}`;
        else if (!outgoingMode && trimmed.startsWith('{')) keyMode.textContent = 'Viewing bundle · FVK';
        else if (outgoingMode && length === 64) keyMode.textContent = 'OVK · outgoing only';
        else if (outgoingMode) keyMode.textContent = 'Explicit OVK mode';
        else if (length === 192) keyMode.textContent = 'FVK · complete view';
        else if (length === 128) keyMode.textContent = 'IVK · incoming only';
        else if (length === 64) keyMode.textContent = '32-byte input · select OVK mode';
        else keyMode.textContent = 'Auto-detected by length';
      } else if (mode === 'core') {
        privacyChip.lastChild!.textContent = ' Public address lookup';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder =
          networkInput.value === 'mainnet' ? 'Paste X… or 7… Dash Core address' : 'Paste y… or 8… testnet address';
        batchInput.placeholder =
          networkInput.value === 'mainnet'
            ? 'One X… or 7… Dash Core address per line'
            : 'One y… or 8… testnet address per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Core public address '), keyMode);
        keyMode.textContent =
          queryMode === 'batch' ? `${batchCount.toLocaleString()} public addresses` : 'Public L1 lookup';
        inputHelp.textContent = `Queries the Dash-specific DashScan index for Mainnet or Testnet. Its synchronization status and latest indexed block are checked first. ${queryMode === 'batch' ? 'Enter one address per line. ' : ''}Public addresses are sent to DashScan; no private or viewing key is used.`;
        scanButtonLabel.textContent = queryMode === 'batch' ? 'Load Core address batch' : 'Load Core address activity';
      } else if (mode === 'platform') {
        privacyChip.lastChild!.textContent = ' Proof + public history';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder =
          networkInput.value === 'mainnet' ? 'Paste dash1k… Platform address' : 'Paste tdash1k… Platform address';
        batchInput.placeholder =
          networkInput.value === 'mainnet'
            ? 'One dash1k… Platform address per line'
            : 'One tdash1k… Platform address per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Platform payment address '), keyMode);
        keyMode.textContent =
          queryMode === 'batch' ? `${batchCount.toLocaleString()} Platform addresses` : 'DIP18 · proof verified';
        inputHelp.textContent = `Verifies current balance and outgoing nonce with a GroveDB proof, then loads synchronized address totals and transitions from Dash Platform Explorer. ${queryMode === 'batch' ? 'Enter one address per line. ' : ''}Public addresses are sent to both network services.`;
        scanButtonLabel.textContent =
          queryMode === 'batch' ? 'Verify Platform address batch' : 'Verify state & load Platform history';
      } else {
        privacyChip.lastChild!.textContent = ' Public Identity proof + history';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = 'Identity ID, idhex:<hex>, tx:<registration hash>, key, or name';
        batchInput.placeholder = 'One Identity ID, name, HASH160, public key, or prefixed hash per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Platform Identity lookup '), keyMode);
        if (queryMode === 'batch') keyMode.textContent = `${batchCount.toLocaleString()} Identity lookups`;
        else if (/^idhex:/iu.test(trimmed)) keyMode.textContent = 'Hex Identity ID · explicit public input';
        else if (/^(?:tx|transition):/iu.test(trimmed))
          keyMode.textContent = 'Registration transition · local owner verification';
        else if (/^(?:0x)?[0-9a-f]{40}$/iu.test(trimmed))
          keyMode.textContent = 'Registered public-key HASH160 · auto-detected';
        else if (/^(?:0x)?(?:02|03)[0-9a-f]{64}$/iu.test(trimmed))
          keyMode.textContent = 'ECDSA public key · local HASH160';
        else if (/^(?:0x)?[0-9a-f]{96}$/iu.test(trimmed)) keyMode.textContent = 'BLS public key · local HASH160';
        else if (/\.dash$/iu.test(trimmed)) keyMode.textContent = 'DPNS name · proof resolved';
        else keyMode.textContent = 'Identity ID / public key';
        inputHelp.textContent = `Accepts ${queryMode === 'batch' ? 'one value per line: ' : ''}a public Base58 Identity ID, idhex:<64-hex Identity ID>, tx:<64-hex registration transition>, the 40-hex HASH160 fingerprint of a registered public key, a compressed ECDSA/BLS public key, or a DPNS name with or without .dash. Bare 64-hex input remains blocked because it could be a private key.`;
        scanButtonLabel.textContent =
          queryMode === 'batch' ? 'Verify Identity batch & load activity' : 'Verify Identity & load activity';
      }
      diagnosticMode.textContent = `${mode} · ${networkInput.value}`;
    },
    showSelfTestPassed(checks: readonly string[], blobWorkerDurationMs: number): void {
      selfTestStatus.classList.remove('checking', 'failed');
      selfTestStatus.classList.add('passed');
      selfTestStatus.textContent = 'Cryptographic self-test passed';
      selfTestDetails.textContent = `${checks.length + 1} runtime checks passed: ${checks.join(' · ')} · Blob Worker execution (${blobWorkerDurationMs.toLocaleString()} ms). Queries are enabled.`;
      runtimeStatus.textContent =
        'Core, Platform, Identity & Orchard network reads · Orchard key processing local · Blob Worker verified';
    },
    showSelfTestFailed(message: string): void {
      selfTestStatus.classList.remove('checking', 'passed');
      selfTestStatus.classList.add('failed');
      selfTestStatus.textContent = 'Cryptographic self-test failed';
      selfTestDetails.textContent = message;
      runtimeStatus.textContent = 'Blocked · self-test failure';
    },
  };
}

export type ActivityViewerView = ReturnType<typeof createActivityViewerView>;
