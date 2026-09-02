import { BUILD_INFO } from '@ckd/build-info';
import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { DashEvoShieldedSource } from '@ckd/dash-network/dash-source.js';
import { downloadText } from '@ckd/export/download.js';
import { createViewerExport, type ViewerExportFormat, type ViewerExportState } from './export.js';
import { formatPlatformCredits } from '@ckd/dash-network/memo.js';
import { formatDashDuffs } from '@ckd/core/dash-units.js';
import {
  runShieldedPageStream,
  SHIELDED_EMPTY_CONFIRMATIONS,
  SHIELDED_MAX_PAGES_PER_SCAN,
  SHIELDED_PAGE_SIZE,
} from '@ckd/dash-network/shielded-stream-policy.js';
import {
  assertCanonicalViewingKey,
  runOrchardRuntimeSelfTest,
  scanEncryptedPage,
} from '@ckd/dash-network/orchard-scanner.js';
import { runBlobWorkerSelfTest } from '@ckd/dash-network/blob-worker-self-test.js';
import {
  queryPlatformAddressHistory,
  type PlatformAddressHistorySnapshot,
  type PlatformAddressTransition,
} from '@ckd/dash-network/platform-address-history.js';
import { DashPlatformAddressSource, type PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import { queryCoreAddress, type CoreAddressSnapshot, type CoreAddressTransaction } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ShieldedActivity, ViewerNetwork } from '@ckd/dash-network/types.js';
import {
  normalizeViewingKey,
  type NormalizedViewingKey,
  type ViewingKeyInputMode,
} from '@ckd/dash-network/viewing-key.js';

type ViewerMode = 'shielded' | 'core' | 'platform';

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Required viewer element #${id} is missing.`);
  return element as T;
}

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

let cancellationRequested = false;
let running = false;
let viewerMode: ViewerMode = 'core';
let currentAbort: AbortController | null = null;
let currentExport: ViewerExportState | null = null;
let queryStarted = 0;
let requestCount = 0;
let remoteDuration = 0;
let localDuration = 0;
let viewerSelfTestPassed = false;

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setStatus(message: string): void {
  statusBox.textContent = message;
  statusBox.hidden = message.length === 0;
}

function clearMessages(): void {
  errorBox.textContent = '';
  errorBox.hidden = true;
  setStatus('');
}

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

function formatDate(timestampMs: number | bigint | null): string {
  if (timestampMs === null) return 'Unavailable';
  const value = typeof timestampMs === 'bigint' ? Number(timestampMs) : timestampMs;
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function directionLabel(record: ShieldedActivity): string {
  if (record.direction === 'received') return 'Received';
  if (record.direction === 'sent') return 'Sent';
  return 'Self / change';
}

function statusLabel(record: ShieldedActivity): string {
  if (record.incoming === undefined) return 'Outgoing view';
  if (record.spent === undefined) return 'Spend state unavailable';
  return record.spent === true ? 'Spent' : 'Unspent';
}

function unavailableCapability(keyKind: ActivitySnapshot['keyKind']): string {
  if (keyKind === 'incoming') return 'Unavailable with IVK';
  if (keyKind === 'outgoing') return 'Unavailable with OVK';
  return 'Unavailable';
}

function amountOrCapability(value: bigint | null, keyKind: ActivitySnapshot['keyKind']): string {
  return value === null ? unavailableCapability(keyKind) : formatPlatformCredits(value);
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
  return detailsCard(
    `direction-${record.direction}`,
    directionLabel(record),
    `Pool position ${record.position}`,
    formatPlatformCredits(note.value),
    [
      ['Status', statusLabel(record)],
      ['Recovered address', note.address],
      ['Memo', note.memo.length === 0 ? '—' : note.memo],
      ['Credits (raw)', note.value.toString()],
      ['Note commitment', record.cmx],
    ],
  );
}

function renderShielded(snapshot: ActivitySnapshot, network: ViewerNetwork): void {
  setExportState({ mode: 'shielded', network, snapshot });
  completeness.classList.remove('viewer-completeness-warning');
  results.hidden = false;
  resultsHeading.textContent = 'Recovered shielded activity';
  resultsDescription.textContent = 'A local view reconstructed from the encrypted pool.';
  ledgerTitle.textContent = 'Activity ledger';
  ledgerOrder.textContent = 'Oldest → newest';
  resultHelp.textContent = 'Results are note-level activity ordered by shielded-pool position. The current DAPI note query does not expose a state-transition hash or exact creation timestamp per encrypted note, so this viewer does not invent transaction IDs or dates. “Sent outputs” exclude notes that also decrypt as this wallet’s own change; protocol fees are not reconstructed here.';
  summary.replaceChildren(
    stat('Spendable balance', amountOrCapability(snapshot.balance, snapshot.keyKind), '◎', true),
    stat('External received', amountOrCapability(snapshot.receivedExternal, snapshot.keyKind), '↓'),
    stat('External sent outputs', amountOrCapability(snapshot.sentExternal, snapshot.keyKind), '↑'),
    stat('Self / change outputs', amountOrCapability(snapshot.selfOrChange, snapshot.keyKind), '↻'),
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
}

function coreDirection(transaction: CoreAddressTransaction): { className: string; label: string } {
  if (transaction.netDuffs > 0n) return { className: 'direction-received', label: 'Received' };
  if (transaction.netDuffs < 0n) return { className: 'direction-sent', label: 'Sent / spent' };
  if (transaction.receivedDuffs > 0n && transaction.spentInputDuffs > 0n) return { className: 'direction-self', label: 'Self / change' };
  return { className: 'direction-neutral', label: 'Related transaction' };
}

function renderCoreTransaction(transaction: CoreAddressTransaction): HTMLElement {
  const direction = coreDirection(transaction);
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

function renderCore(snapshot: CoreAddressSnapshot): void {
  setExportState({ mode: 'core', network: snapshot.network, snapshot });
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

function renderPlatform(snapshot: PlatformAddressSnapshot, history: PlatformAddressHistorySnapshot): void {
  setExportState({ mode: 'platform', network: snapshot.network, snapshot, history });
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
}

function setDiagnosticState(state: 'idle' | 'running' | 'passed' | 'failed', label: string): void {
  diagnosticState.className = `diagnostic-state ${state}`;
  diagnosticState.textContent = label;
}

function startDiagnostics(source: string): void {
  queryStarted = performance.now();
  requestCount = 0;
  remoteDuration = 0;
  localDuration = 0;
  setDiagnosticState('running', 'Running');
  diagnosticMode.textContent = `${viewerMode} · ${networkInput.value}`;
  diagnosticSource.textContent = source;
  diagnosticRequests.textContent = '0';
  diagnosticProof.textContent = 'Pending';
  diagnosticRemoteTime.textContent = '—';
  diagnosticTiming.textContent = 'Running…';
  diagnosticDetail.textContent = 'Input validation started.';
}

function updateTiming(): void {
  const total = Math.round(performance.now() - queryStarted);
  diagnosticTiming.textContent = `remote ${Math.round(remoteDuration)} ms · local ${Math.round(localDuration)} ms · total ${total} ms`;
}

function finishDiagnostics(detail: string): void {
  updateTiming();
  diagnosticRequests.textContent = requestCount.toLocaleString();
  diagnosticDetail.textContent = detail;
  setDiagnosticState('passed', 'Complete');
}

function failDiagnostics(detail: string): void {
  updateTiming();
  diagnosticRequests.textContent = requestCount.toLocaleString();
  diagnosticDetail.textContent = detail;
  setDiagnosticState('failed', 'Stopped');
}

function setRunning(value: boolean): void {
  running = value;
  document.body.classList.toggle('viewer-is-scanning', value);
  scanButton.disabled = value || !viewerSelfTestPassed;
  networkInput.disabled = value;
  keyCapabilityInput.disabled = value || viewerMode !== 'shielded';
  historyLimitInput.disabled = value || viewerMode === 'shielded';
  viewingKeyInput.disabled = value;
  revealButton.disabled = value;
  for (const button of modeButtons) button.disabled = value;
  cancelButton.disabled = !value;
}

function setExportState(state: ViewerExportState | null): void {
  currentExport = state;
  exportActions.hidden = state === null;
  exportCsvButton.disabled = state === null;
  exportJsonButton.disabled = state === null;
}

function downloadExport(format: ViewerExportFormat): void {
  if (currentExport === null) {
    showError('Run a query before exporting data.');
    return;
  }
  const file = createViewerExport(currentExport, format);
  downloadText(file.text, file.filename, file.mimeType);
  setStatus(`Exported ${file.filename}. The input key/address is not included.`);
}

/**
 * Yields between DAPI pages. requestAnimationFrame is deliberately not used: it
 * stops firing in a background tab, which silently stalls a full-pool scan at
 * exactly the moment the user switches away from it to wait.
 */
async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

const SHIELDED_PAINT_INTERVAL_MS = 500;
let lastShieldedPaintAt = 0;

/**
 * Rebuilding the whole ledger and re-sorting every record after each 2,048-action
 * page is quadratic over a large wallet. Intermediate pages repaint at most every
 * SHIELDED_PAINT_INTERVAL_MS; the terminal state is always forced, so a complete
 * or cancelled scan never leaves a stale frame on screen.
 */
function renderShieldedProgress(
  ledger: ShieldedActivityLedger,
  complete: boolean,
  network: ViewerNetwork,
  force: boolean,
): void {
  const now = performance.now();
  if (!force && now - lastShieldedPaintAt < SHIELDED_PAINT_INTERVAL_MS) return;
  lastShieldedPaintAt = now;
  renderShielded(ledger.snapshot(complete), network);
}

async function runShielded(network: ViewerNetwork): Promise<void> {
  const viewingKey: NormalizedViewingKey = normalizeViewingKey(
    viewingKeyInput.value,
    keyCapabilityInput.value as ViewingKeyInputMode,
  );
  if (viewingKey.bundleNetwork !== undefined && viewingKey.bundleNetwork !== network) {
    throw new Error(`This viewing bundle is for ${viewingKey.bundleNetwork}; select that network before scanning.`);
  }
  assertCanonicalViewingKey(viewingKey);
  diagnosticDetail.textContent = `Validated canonical ${viewingKey.kind} viewing capability locally.`;
  const ledger = new ShieldedActivityLedger(viewingKey.kind);
  lastShieldedPaintAt = 0;
  const source = new DashEvoShieldedSource(network);
  setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
  const connectStarted = performance.now();
  await source.connect();
  remoteDuration += performance.now() - connectStarted;
  diagnosticDetail.textContent = 'Connected through trusted quorum discovery. Fetching proof-verified encrypted notes.';
  const outcome = await runShieldedPageStream({
    fetchPage: async (position) => {
      setStatus(`Fetching and verifying pool actions from aligned position ${position}…`);
      const fetchStarted = performance.now();
      const page = await source.fetchPage(position, SHIELDED_PAGE_SIZE);
      remoteDuration += performance.now() - fetchStarted;
      requestCount += 1;
      return page;
    },
    noteCount: (page) => page.notes.length,
    onPage: (page, visit) => {
      diagnosticRequests.textContent = requestCount.toLocaleString();
      diagnosticProof.textContent = `${page.proofHeight} · protocol ${page.protocolVersion}`;
      diagnosticRemoteTime.textContent = formatDate(page.timeMs);
      if (page.notes.length > 0) {
        const scanStarted = performance.now();
        const matches = scanEncryptedPage(viewingKey, visit.position, page.notes, network);
        ledger.applyPage(visit.position, page, matches);
        localDuration += performance.now() - scanStarted;
      } else if (visit.emptyConfirmation < SHIELDED_EMPTY_CONFIRMATIONS) {
        setStatus(`Confirming empty Orchard terminal page ${visit.emptyConfirmation + 1}/${SHIELDED_EMPTY_CONFIRMATIONS} at aligned position ${visit.position}…`);
      }
      renderShieldedProgress(ledger, false, network, false);
      updateTiming();
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
    setStatus(`Scan complete after ${SHIELDED_EMPTY_CONFIRMATIONS} verified empty terminal reads. ${ledger.snapshot(true).scannedNotes} pool actions checked.`);
    finishDiagnostics(`Proof verification and local Orchard recovery completed through aligned position ${outcome.terminalPosition}.`);
  } else {
    renderShieldedProgress(ledger, false, network, true);
    const message = `Stopped at the ${SHIELDED_MAX_PAGES_PER_SCAN.toLocaleString()}-page safety ceiling before the pool end was confirmed. Results are partial.`;
    setStatus(message);
    failDiagnostics(message);
  }
}

async function runCore(network: ViewerNetwork): Promise<void> {
  currentAbort = new AbortController();
  const limit = Number(historyLimitInput.value);
  setStatus(`Querying Dash Core ${network} address history…`);
  diagnosticDetail.textContent = 'Validating the Base58Check address, checking DashScan synchronization, then loading exact-duff totals and history.';
  const remoteStarted = performance.now();
  const snapshot = await queryCoreAddress(viewingKeyInput.value, network, limit, currentAbort.signal);
  remoteDuration += performance.now() - remoteStarted;
  requestCount = snapshot.requests;
  if (cancellationRequested) return;
  renderCore(snapshot);
  diagnosticSource.textContent = snapshot.endpoint;
  diagnosticProof.textContent = `DashScan ${snapshot.indexStatus} · Core height ${snapshot.indexedHeight.toLocaleString()}`;
  diagnosticRemoteTime.textContent = formatDate(snapshot.indexedTimeMs);
  setStatus(`Address query complete. ${snapshot.transactionCount.toLocaleString()} transactions reported; ${snapshot.transactions.length.toLocaleString()} loaded.`);
  finishDiagnostics(`DashScan reported a synchronized index at Core height ${snapshot.indexedHeight.toLocaleString()}. Loaded address totals and ${snapshot.transactions.length.toLocaleString()} newest transaction record(s) in ${snapshot.requests} request(s).`);
}

async function runPlatform(network: ViewerNetwork): Promise<void> {
  currentAbort = new AbortController();
  const source = new DashPlatformAddressSource(network);
  const limit = Number(historyLimitInput.value);
  setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
  diagnosticDetail.textContent = 'Validating the DIP18 address and establishing a trusted DAPI context.';
  const connectStarted = performance.now();
  await source.connect();
  remoteDuration += performance.now() - connectStarted;
  if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
  requestCount = 1;
  const queryStartedAt = performance.now();
  const snapshot = await source.query(viewingKeyInput.value);
  remoteDuration += performance.now() - queryStartedAt;
  if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
  setStatus('Platform state verified. Checking Platform Explorer synchronization and loading address history…');
  diagnosticDetail.textContent = 'DAPI proof verified. Querying the Platform Explorer address index and latest indexed height.';
  const historyStartedAt = performance.now();
  const history = await queryPlatformAddressHistory(
    viewingKeyInput.value,
    network,
    limit,
    currentAbort.signal,
  );
  remoteDuration += performance.now() - historyStartedAt;
  requestCount += history.requests;
  if (cancellationRequested) throw new DOMException('Platform query cancelled.', 'AbortError');
  renderPlatform(snapshot, history);
  diagnosticSource.textContent = `Proof DAPI + ${history.endpoint}`;
  diagnosticRequests.textContent = `1 proof + ${history.requests} Explorer`;
  diagnosticProof.textContent = `DAPI ${snapshot.proofHeight} · Explorer ${history.indexedHeight.toLocaleString()}`;
  diagnosticRemoteTime.textContent = formatDate(history.indexedTimeMs);
  setStatus(`Platform state verified and ${history.transitions.length.toLocaleString()} of ${history.totalTransitions.toLocaleString()} address transitions loaded.`);
  finishDiagnostics(`Verified the GroveDB address-state proof and a ${history.indexStatus} Platform Explorer index. Proof values take precedence if the two sources disagree.`);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (running) return;
  if (!viewerSelfTestPassed) {
    showError('Cryptographic startup self-test has not passed. Queries remain disabled.');
    return;
  }
  void (async () => {
    clearMessages();
    results.hidden = true;
    setExportState(null);
    summary.replaceChildren();
    activityList.replaceChildren();
    cancellationRequested = false;
    currentAbort = null;
    setRunning(true);
    const network = networkInput.value as ViewerNetwork;
    startDiagnostics(
      viewerMode === 'core'
        ? 'DashScan Core API · synchronization checked'
        : viewerMode === 'platform'
          ? 'Dash Platform DAPI proof + Platform Explorer history'
          : 'Dash Platform DAPI · trusted quorum discovery',
    );
    try {
      if (viewerMode === 'shielded') await runShielded(network);
      else if (viewerMode === 'core') await runCore(network);
      else await runPlatform(network);
    } catch (cause) {
      if (cancellationRequested) {
        setStatus('Query cancelled.');
        failDiagnostics('Cancelled by the user. No additional results were applied.');
      } else {
        const message = cause instanceof Error ? cause.message : String(cause);
        showError(message);
        setStatus('');
        failDiagnostics(`Stopped during the current stage. Error: ${message}`);
      }
    } finally {
      currentAbort = null;
      setRunning(false);
    }
  })();
});

cancelButton.addEventListener('click', () => {
  cancellationRequested = true;
  currentAbort?.abort();
  cancelButton.disabled = true;
  setStatus(viewerMode === 'shielded'
    ? 'Cancellation requested; waiting for the current verified DAPI page…'
    : 'Cancellation requested…');
});

revealButton.addEventListener('click', () => {
  if (viewerMode !== 'shielded') return;
  const revealing = viewingKeyInput.type === 'password';
  viewingKeyInput.type = revealing ? 'text' : 'password';
  revealButton.textContent = revealing ? 'Hide key' : 'Reveal key';
  revealButton.setAttribute('aria-pressed', String(revealing));
});

function resetViewer(): void {
  cancellationRequested = true;
  currentAbort?.abort();
  viewingKeyInput.value = '';
  viewingKeyInput.type = viewerMode === 'shielded' ? 'password' : 'text';
  revealButton.textContent = 'Reveal key';
  revealButton.setAttribute('aria-pressed', 'false');
  summary.replaceChildren();
  activityList.replaceChildren();
  setExportState(null);
  results.hidden = true;
  clearMessages();
  setDiagnosticState('idle', 'Idle');
  diagnosticMode.textContent = `${viewerMode} · ${networkInput.value}`;
  diagnosticSource.textContent = 'Not connected';
  diagnosticRequests.textContent = '0';
  diagnosticProof.textContent = '—';
  diagnosticRemoteTime.textContent = '—';
  diagnosticTiming.textContent = '—';
  diagnosticDetail.textContent = 'Select a mode and start a query. Failures are reported at the exact stage that stopped.';
  updateInputMode();
}

clearButton.addEventListener('click', () => {
  resetViewer();
});

exportCsvButton.addEventListener('click', () => downloadExport('csv'));
exportJsonButton.addEventListener('click', () => downloadExport('json'));

function updateInputMode(): void {
  const trimmed = viewingKeyInput.value.trim();
  const length = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '').length;
  const outgoingMode = keyCapabilityInput.value === 'outgoing';
  if (viewerMode === 'shielded') {
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
  } else if (viewerMode === 'core') {
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
  diagnosticMode.textContent = `${viewerMode} · ${networkInput.value}`;
}

function setViewerMode(mode: ViewerMode): void {
  if (running || mode === viewerMode) return;
  viewerMode = mode;
  for (const button of modeButtons) {
    const active = button.dataset.viewerMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  resetViewer();
  setRunning(false);
}

for (const button of modeButtons) {
  button.addEventListener('click', () => setViewerMode(button.dataset.viewerMode as ViewerMode));
}
viewingKeyInput.addEventListener('input', updateInputMode);
keyCapabilityInput.addEventListener('change', updateInputMode);
networkInput.addEventListener('change', updateInputMode);

required<HTMLElement>('viewer-build-version').textContent = BUILD_INFO.version;
required<HTMLElement>('viewer-build-date').textContent = BUILD_INFO.releaseDate;
required<HTMLElement>('viewer-build-fingerprint').textContent = BUILD_INFO.fingerprint;
required<HTMLElement>('viewer-artifact-checksum-file').textContent = BUILD_INFO.checksumFile;
required<HTMLElement>('viewer-build-footer').textContent = `Build ${BUILD_INFO.version} · ${BUILD_INFO.releaseDate} · ${BUILD_INFO.fingerprint.slice(0, 16)}…`;
updateInputMode();
setRunning(false);

async function initializeViewerRuntime(): Promise<void> {
  // Give the initial fail-closed UI a paint opportunity before local WASM work.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  try {
    const blobWorkerDurationMs = await runBlobWorkerSelfTest();
    const report = runOrchardRuntimeSelfTest();
    viewerSelfTestPassed = report.passed;
    selfTestStatus.classList.remove('checking', 'failed');
    selfTestStatus.classList.add('passed');
    selfTestStatus.textContent = 'Cryptographic self-test passed';
    selfTestDetails.textContent = `${report.checks.length + 1} runtime checks passed: ${report.checks.join(' · ')} · Blob Worker execution (${blobWorkerDurationMs.toLocaleString()} ms). Queries are enabled.`;
    runtimeStatus.textContent = 'Orchard recovery runs locally on the main thread · Blob Worker execution verified';
    setRunning(false);
  } catch (cause) {
    viewerSelfTestPassed = false;
    selfTestStatus.classList.remove('checking', 'passed');
    selfTestStatus.classList.add('failed');
    selfTestStatus.textContent = 'Cryptographic self-test failed';
    selfTestDetails.textContent = cause instanceof Error ? cause.message : String(cause);
    runtimeStatus.textContent = 'Blocked · self-test failure';
    setRunning(false);
    showError('Cryptographic startup self-test failed. This build will not query or scan wallet activity.');
  }
}

void initializeViewerRuntime();
