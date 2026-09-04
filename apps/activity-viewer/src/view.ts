import type { BUILD_INFO } from '@ckd/build-info';
import { formatDashDuffs } from '@ckd/core/dash-units.js';
import { formatPlatformCredits } from '@ckd/dash-network/memo.js';
import type {
  PlatformAddressHistorySnapshot,
  PlatformAddressTransition,
} from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import type { CoreAddressSnapshot, CoreAddressTransaction } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ShieldedActivity, ViewerNetwork } from '@ckd/dash-network/types.js';

export type ViewerMode = 'shielded' | 'core' | 'platform';

function requireElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Required viewer element #${id} is missing.`);
  return element as T;
}

function formatDate(timestampMs: number | bigint | null): string {
  if (timestampMs === null) return 'Unavailable';
  const value = typeof timestampMs === 'bigint' ? Number(timestampMs) : timestampMs;
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

export function createActivityViewerView(document: Document, buildInfo: typeof BUILD_INFO) {
  const required = <T extends HTMLElement>(id: string): T => requireElement<T>(document, id);
  const form = required<HTMLFormElement>('viewer-form');
  const networkInput = required<HTMLSelectElement>('viewer-network');
  const keyCapabilityInput = required<HTMLSelectElement>('viewer-key-capability');
  const capabilityControls = required<HTMLDivElement>('viewer-capability-controls');
  const historyField = required<HTMLDivElement>('viewer-history-field');
  const historyLimitInput = required<HTMLInputElement>('viewer-history-limit');
  const viewingKeyInput = required<HTMLInputElement>('full-viewing-key');
  const inputLabel = required<HTMLLabelElement>('viewer-input-label');
  const inputHelp = required<HTMLParagraphElement>('viewer-input-help');
  const keyMode = required<HTMLSpanElement>('viewer-key-mode');
  const privacyChip = required<HTMLElement>('viewer-privacy-chip');
  const revealButton = required<HTMLButtonElement>('reveal-viewing-key');
  const scanButton = required<HTMLButtonElement>('scan-button');
  const scanButtonLabel = required<HTMLSpanElement>('scan-button-label');
  const cancelButton = required<HTMLButtonElement>('cancel-button');
  const clearButton = required<HTMLButtonElement>('clear-viewer');
  const errorBox = required<HTMLDivElement>('viewer-error');
  const statusBox = required<HTMLDivElement>('viewer-status');
  const results = required<HTMLElement>('viewer-results');
  const resultsHeading = required<HTMLHeadingElement>('viewer-results-heading');
  const resultsDescription = required<HTMLParagraphElement>('viewer-results-description');
  const resultHelp = required<HTMLElement>('viewer-result-help');
  const summary = required<HTMLDivElement>('viewer-summary');
  const activityList = required<HTMLDivElement>('viewer-activity');
  const completeness = required<HTMLParagraphElement>('viewer-completeness');
  const ledgerTitle = required<HTMLElement>('viewer-ledger-title');
  const ledgerOrder = required<HTMLElement>('viewer-ledger-order');
  const exportActions = required<HTMLElement>('viewer-export-actions');
  const exportCsvButton = required<HTMLButtonElement>('viewer-export-csv');
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
  let queryStarted = 0;
  let requestCount = 0;
  let remoteDuration = 0;
  let localDuration = 0;

  function valueElement(className: string, value: string): HTMLSpanElement {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = value;
    return element;
  }

  function stat(label: string, value: string, icon: string, emphasis = false): HTMLDivElement {
    const card = document.createElement('div');
    card.className = emphasis ? 'viewer-stat viewer-stat-balance' : 'viewer-stat';
    card.append(
      valueElement('viewer-stat-icon', icon),
      valueElement('viewer-stat-label', label),
      valueElement('viewer-stat-value', value),
    );
    return card;
  }

  function detailsCard(
    className: string,
    titleText: string,
    subtitle: string,
    amountText: string,
    detailRows: ReadonlyArray<readonly [string, string]>,
    amountClass = '',
  ): HTMLElement {
    const card = document.createElement('article');
    card.className = `viewer-activity-card viewer-address-card ${className}`;
    const head = document.createElement('div');
    head.className = 'viewer-activity-head';
    const title = document.createElement('div');
    title.append(valueElement('viewer-direction', titleText), valueElement('viewer-position', subtitle));
    const amount = valueElement(`viewer-amount ${amountClass}`.trim(), amountText);
    head.append(title, amount);
    const details = document.createElement('dl');
    for (const [label, value] of detailRows) {
      const term = document.createElement('dt');
      term.textContent = label;
      const definition = document.createElement('dd');
      definition.textContent = value;
      details.append(term, definition);
    }
    card.append(head, details);
    return card;
  }

  function renderShieldedActivity(record: ShieldedActivity): HTMLElement {
    const note = record.incoming ?? record.outgoing;
    if (note === undefined) throw new Error('Activity record has no recovered note view.');
    const direction = record.direction === 'received'
      ? 'Received'
      : record.direction === 'sent'
        ? 'Sent'
        : 'Self / change';
    const status = record.incoming === undefined
      ? 'Outgoing view'
      : record.spent === undefined
        ? 'Spend state unavailable'
        : record.spent
          ? 'Spent'
          : 'Unspent';
    return detailsCard(
      `direction-${record.direction}`,
      direction,
      `Pool position ${record.position}`,
      formatPlatformCredits(note.value),
      [
        ['Status', status],
        ['Recovered address', note.address],
        ['Memo', note.memo.length === 0 ? '—' : note.memo],
        ['Credits (raw)', note.value.toString()],
        ['Note commitment', record.cmx],
      ],
    );
  }

  function renderCoreTransaction(transaction: CoreAddressTransaction): HTMLElement {
    const direction = transaction.netDuffs > 0n
      ? { className: 'direction-received', label: 'Received' }
      : transaction.netDuffs < 0n
        ? { className: 'direction-sent', label: 'Sent / spent' }
        : transaction.receivedDuffs > 0n && transaction.spentInputDuffs > 0n
          ? { className: 'direction-self', label: 'Self / change' }
          : { className: 'direction-neutral', label: 'Related transaction' };
    const lockStatus = transaction.chainLocked
      ? 'ChainLocked'
      : transaction.instantLocked
        ? 'InstantSend locked'
        : transaction.confirmations === null
          ? 'Pending / not locked'
          : 'Not reported as locked';
    return detailsCard(
      direction.className,
      direction.label,
      transaction.txid,
      formatDashDuffs(transaction.netDuffs, true),
      [
        ['Date / time', formatDate(transaction.timestampMs)],
        ['Transaction type', transaction.type ?? 'Unavailable'],
        ['Block height', transaction.blockHeight?.toLocaleString() ?? 'Unconfirmed'],
        ['Confirmations', transaction.confirmations?.toLocaleString() ?? 'Unconfirmed'],
        ['Dash lock status', lockStatus],
        ['Outputs received by address', formatDashDuffs(transaction.receivedDuffs)],
        ['Inputs spent from address', formatDashDuffs(transaction.spentInputDuffs)],
        ['Transaction fee', transaction.feeDuffs === null ? 'Unavailable' : formatDashDuffs(transaction.feeDuffs)],
        ['Block hash', transaction.blockHash ?? 'Unconfirmed / unavailable'],
      ],
      transaction.netDuffs < 0n ? 'negative' : transaction.netDuffs > 0n ? 'positive' : '',
    );
  }

  function renderPlatformTransition(transition: PlatformAddressTransition): HTMLElement {
    const direction = transition.incoming
      ? { className: 'direction-received', label: 'Incoming' }
      : { className: 'direction-sent', label: 'Outgoing' };
    return detailsCard(
      direction.className,
      direction.label,
      transition.hash,
      transition.status,
      [
        ['Date / time', formatDate(transition.timestampMs)],
        ['Transition type', transition.type],
        ['Batch type', transition.batchType ?? 'Not a batch transition'],
        ['Block height', transition.blockHeight?.toLocaleString() ?? 'Unavailable'],
        ['Gas used (credits)', transition.gasUsed?.toLocaleString() ?? 'Unavailable'],
        ['Per-transition amount', 'Not exposed by Platform Explorer'],
        ['Error', transition.error ?? 'None reported'],
        ['Block hash', transition.blockHash ?? 'Unavailable'],
      ],
      transition.status === 'SUCCESS' ? 'positive' : 'negative',
    );
  }

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
  required<HTMLElement>('viewer-build-fingerprint').textContent = buildInfo.fingerprint;
  required<HTMLElement>('viewer-artifact-checksum-file').textContent = buildInfo.checksumFile;
  required<HTMLElement>('viewer-build-footer').textContent = `Build ${buildInfo.version} · ${buildInfo.releaseDate} · ${buildInfo.fingerprint.slice(0, 16)}…`;

  return {
    document,
    form,
    networkInput,
    keyCapabilityInput,
    historyLimitInput,
    viewingKeyInput,
    revealButton,
    cancelButton,
    clearButton,
    exportCsvButton,
    exportJsonButton,
    modeButtons,
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
      summary.replaceChildren();
      activityList.replaceChildren();
    },
    setExportAvailable(available: boolean): void {
      exportActions.hidden = !available;
      exportCsvButton.disabled = !available;
      exportJsonButton.disabled = !available;
    },
    renderShielded(snapshot: ActivitySnapshot): void {
      completeness.classList.remove('viewer-completeness-warning');
      results.hidden = false;
      resultsHeading.textContent = 'Recovered shielded activity';
      resultsDescription.textContent = 'A local view reconstructed from the encrypted pool.';
      ledgerTitle.textContent = 'Activity ledger';
      ledgerOrder.textContent = 'Oldest → newest';
      resultHelp.textContent = 'Results are note-level activity ordered by shielded-pool position. The current DAPI note query does not expose a state-transition hash or exact creation timestamp per encrypted note, so this viewer does not invent transaction IDs or dates. “Sent outputs” exclude notes that also decrypt as this wallet’s own change; protocol fees are not reconstructed here.';
      const unavailable = snapshot.keyKind === 'incoming'
        ? 'Unavailable with IVK'
        : snapshot.keyKind === 'outgoing'
          ? 'Unavailable with OVK'
          : 'Unavailable';
      const amount = (value: bigint | null): string => value === null ? unavailable : formatPlatformCredits(value);
      summary.replaceChildren(
        stat('Spendable balance', amount(snapshot.balance), '◎', true),
        stat('External received', amount(snapshot.receivedExternal), '↓'),
        stat('External sent outputs', amount(snapshot.sentExternal), '↑'),
        stat('Self / change outputs', amount(snapshot.selfOrChange), '↻'),
        stat('Pool actions scanned', snapshot.scannedNotes.toString(), '⌁'),
        stat('Recovered notes', snapshot.records.length.toString(), '◇'),
      );
      if (!snapshot.complete) completeness.textContent = 'Partial scan: results are incomplete until the scan reaches the end of the pool.';
      else if (snapshot.keyKind === 'full') completeness.textContent = `Complete full-capability scan from pool position 0. Proof response height ${snapshot.proofHeight}; Platform protocol ${snapshot.protocolVersion}.`;
      else if (snapshot.keyKind === 'incoming') completeness.textContent = `Complete incoming-only scan. Received notes are visible; outgoing activity, spend state, and balance require the 96-byte FVK. Proof height ${snapshot.proofHeight}.`;
      else completeness.textContent = `Complete outgoing-only scan. Sent outputs are visible; incoming activity and balance require the 96-byte FVK. Proof height ${snapshot.proofHeight}.`;
      activityList.replaceChildren(...snapshot.records.map(renderShieldedActivity));
      if (snapshot.records.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = snapshot.complete
          ? `No ${snapshot.keyKind === 'full' ? 'incoming or outgoing' : snapshot.keyKind} notes were recovered by this viewing key.`
          : 'No notes recovered in the scanned portion yet.';
        activityList.append(empty);
      }
    },
    renderCore(snapshot: CoreAddressSnapshot): void {
      completeness.classList.remove('viewer-completeness-warning');
      results.hidden = false;
      resultsHeading.textContent = 'Dash Core address activity';
      resultsDescription.textContent = snapshot.address;
      ledgerTitle.textContent = 'Transaction ledger';
      ledgerOrder.textContent = `Newest ${snapshot.transactions.length.toLocaleString()} of ${snapshot.transactionCount.toLocaleString()}`;
      resultHelp.textContent = 'Core totals come from the Dash-specific DashScan index after its synchronization status and latest indexed block are checked. “Total sent” is the sum of UTXO inputs spent from this address, while “total received” includes outputs returning as change. Each transaction therefore also shows its net effect on the queried address.';
      summary.replaceChildren(
        stat('Current balance', formatDashDuffs(snapshot.balanceDuffs), '◎', true),
        stat('Total received outputs', formatDashDuffs(snapshot.totalReceivedDuffs), '↓'),
        stat('Total spent inputs', formatDashDuffs(snapshot.totalSentDuffs), '↑'),
        stat('Transactions total', snapshot.transactionCount.toLocaleString(), '≡'),
        stat('Balance vs. confirmed flow', formatDashDuffs(snapshot.unconfirmedDuffs, true), '◌'),
        stat('Transactions loaded', snapshot.transactions.length.toLocaleString(), '◇'),
      );
      completeness.textContent = snapshot.transactions.length < snapshot.transactionCount
        ? `Totals cover the full address history. The ledger shows the newest ${snapshot.transactions.length.toLocaleString()} transactions because the display limit is ${snapshot.historyLimit.toLocaleString()}.`
        : 'The complete transaction list reported for this address is displayed.';
      activityList.replaceChildren(...snapshot.transactions.map(renderCoreTransaction));
      if (snapshot.transactions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Dash Core transactions were reported for this address.';
        activityList.append(empty);
      }
    },
    renderPlatform(snapshot: PlatformAddressSnapshot, history: PlatformAddressHistorySnapshot): void {
      results.hidden = false;
      resultsHeading.textContent = 'Dash Platform address state';
      resultsDescription.textContent = history.base58Address === null
        ? snapshot.address
        : `${snapshot.address} · legacy alias ${history.base58Address}`;
      ledgerTitle.textContent = 'Platform transition ledger';
      ledgerOrder.textContent = `Newest ${history.transitions.length.toLocaleString()} of ${history.totalTransitions.toLocaleString()}`;
      resultHelp.textContent = 'Current balance and nonce come from proof-verified Platform DAPI. Lifetime totals and the address-indexed transition list come from the synchronized Dash Platform Explorer. Explorer does not expose the amount attributable to this address on each individual transition, so per-transition amounts are not invented.';
      summary.replaceChildren(
        stat('Current balance', formatPlatformCredits(snapshot.balanceCredits), '◎', true),
        stat('Lifetime incoming', formatPlatformCredits(history.totalIncomingCredits), '↓'),
        stat('Lifetime outgoing', formatPlatformCredits(history.totalOutgoingCredits), '↑'),
        stat('Address transitions', history.totalTransitions.toLocaleString(), '≡'),
        stat('Outgoing address nonce', snapshot.nonce.toLocaleString(), '↗'),
        stat('Verified Platform height', snapshot.proofHeight.toLocaleString(), '✓'),
      );
      const agrees = snapshot.balanceCredits === history.explorerBalanceCredits
        && snapshot.nonce === BigInt(history.explorerNonce);
      completeness.classList.toggle('viewer-completeness-warning', !agrees);
      const proofText = snapshot.exists
        ? `Address state proof verified at Platform height ${snapshot.proofHeight}; protocol ${snapshot.protocolVersion}; Core ChainLocked height ${snapshot.coreChainLockedHeight}.`
        : `No funded state entry exists at proof-verified Platform height ${snapshot.proofHeight}.`;
      const explorerText = `Explorer index ${history.indexStatus} at height ${history.indexedHeight.toLocaleString()} (${formatDate(history.indexedTimeMs)}); ${history.incomingTransitions.toLocaleString()} incoming and ${history.outgoingTransitions.toLocaleString()} outgoing transitions.`;
      completeness.textContent = agrees
        ? `${proofText} ${explorerText} Explorer balance/nonce agree with the DAPI proof.`
        : `${proofText} ${explorerText} WARNING: Explorer balance or nonce differs from the DAPI proof; the proof-verified values shown above take precedence.`;
      activityList.replaceChildren(...history.transitions.map(renderPlatformTransition));
      if (history.transitions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Platform address transitions were reported by the synchronized Explorer index.';
        activityList.append(empty);
      }
    },
    startDiagnostics(mode: ViewerMode, network: ViewerNetwork, source: string): void {
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
    setRunning(value: boolean, selfTestPassed: boolean, mode: ViewerMode): void {
      document.body.classList.toggle('viewer-is-scanning', value);
      scanButton.disabled = value || !selfTestPassed;
      networkInput.disabled = value;
      keyCapabilityInput.disabled = value || mode !== 'shielded';
      historyLimitInput.disabled = value || mode === 'shielded';
      viewingKeyInput.disabled = value;
      revealButton.disabled = value;
      for (const button of modeButtons) button.disabled = value;
      cancelButton.disabled = !value;
    },
    showCancellationRequested(mode: ViewerMode): void {
      cancelButton.disabled = true;
      statusBox.textContent = mode === 'shielded'
        ? 'Cancellation requested; waiting for the current verified DAPI page…'
        : 'Cancellation requested…';
      statusBox.hidden = false;
    },
    toggleViewingKeyReveal(mode: ViewerMode): void {
      if (mode !== 'shielded') return;
      const revealing = viewingKeyInput.type === 'password';
      viewingKeyInput.type = revealing ? 'text' : 'password';
      revealButton.textContent = revealing ? 'Hide key' : 'Reveal key';
      revealButton.setAttribute('aria-pressed', String(revealing));
    },
    resetViewer(mode: ViewerMode): void {
      viewingKeyInput.value = '';
      viewingKeyInput.type = mode === 'shielded' ? 'password' : 'text';
      revealButton.textContent = 'Reveal key';
      revealButton.setAttribute('aria-pressed', 'false');
      summary.replaceChildren();
      activityList.replaceChildren();
      results.hidden = true;
      errorBox.textContent = '';
      errorBox.hidden = true;
      statusBox.textContent = '';
      statusBox.hidden = true;
      setDiagnosticState('idle', 'Idle');
      diagnosticMode.textContent = `${mode} · ${networkInput.value}`;
      diagnosticSource.textContent = 'Not connected';
      diagnosticRequests.textContent = '0';
      diagnosticProof.textContent = '—';
      diagnosticRemoteTime.textContent = '—';
      diagnosticTiming.textContent = '—';
      diagnosticDetail.textContent = 'Select a mode and start a query. Failures are reported at the exact stage that stopped.';
      this.updateInputMode(mode);
    },
    setViewerMode(mode: ViewerMode): void {
      for (const button of modeButtons) {
        const active = button.dataset.viewerMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
    updateInputMode(mode: ViewerMode): void {
      const trimmed = viewingKeyInput.value.trim();
      const length = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '').length;
      const outgoingMode = keyCapabilityInput.value === 'outgoing';
      if (mode === 'shielded') {
        privacyChip.lastChild!.textContent = ' Key processed locally';
        capabilityControls.hidden = false;
        historyField.hidden = true;
        revealButton.hidden = false;
        viewingKeyInput.type = revealButton.getAttribute('aria-pressed') === 'true' ? 'text' : 'password';
        viewingKeyInput.placeholder = outgoingMode
          ? 'Paste OVK explicitly labeled Outgoing Viewing Key (64 hex)'
          : 'Paste viewing bundle, FVK (192), or IVK (128 hex)';
        inputLabel.replaceChildren(document.createTextNode('Raw Orchard Viewing Key '), keyMode);
        inputHelp.replaceChildren(
          Object.assign(document.createElement('strong'), { textContent: '96-byte Full Viewing Key (FVK) is recommended: ' }),
          document.createTextNode('it finds received and sent activity, derives note nullifiers, and identifies spent notes. IVK shows received notes only; OVK shows sent outputs only.'),
        );
        scanButtonLabel.textContent = 'Scan complete shielded pool';
        if (!outgoingMode && trimmed.startsWith('{')) keyMode.textContent = 'Viewing bundle · FVK';
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
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = networkInput.value === 'mainnet' ? 'Paste X… or 7… Dash Core address' : 'Paste y… or 8… testnet address';
        inputLabel.replaceChildren(document.createTextNode('Dash Core public address '), keyMode);
        keyMode.textContent = 'Public L1 lookup';
        inputHelp.textContent = 'Queries the Dash-specific DashScan index for Mainnet or Testnet. Its synchronization status and latest indexed block are checked first. The public address is sent to DashScan; no private or viewing key is used.';
        scanButtonLabel.textContent = 'Load Core address activity';
      } else {
        privacyChip.lastChild!.textContent = ' Proof + public history';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = networkInput.value === 'mainnet' ? 'Paste dash1k… Platform address' : 'Paste tdash1k… Platform address';
        inputLabel.replaceChildren(document.createTextNode('Dash Platform payment address '), keyMode);
        keyMode.textContent = 'DIP18 · proof verified';
        inputHelp.textContent = 'Verifies current balance and outgoing nonce with a GroveDB proof, then loads synchronized address totals and transitions from Dash Platform Explorer. The public address is sent to both network services.';
        scanButtonLabel.textContent = 'Verify state & load Platform history';
      }
      diagnosticMode.textContent = `${mode} · ${networkInput.value}`;
    },
    showSelfTestPassed(checks: readonly string[], blobWorkerDurationMs: number): void {
      selfTestStatus.classList.remove('checking', 'failed');
      selfTestStatus.classList.add('passed');
      selfTestStatus.textContent = 'Cryptographic self-test passed';
      selfTestDetails.textContent = `${checks.length + 1} runtime checks passed: ${checks.join(' · ')} · Blob Worker execution (${blobWorkerDurationMs.toLocaleString()} ms). Queries are enabled.`;
      runtimeStatus.textContent = 'Orchard recovery runs locally on the main thread · Blob Worker execution verified';
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
