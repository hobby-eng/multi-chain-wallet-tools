import { BUILD_INFO } from '@ckd/build-info';
import { assertValidMnemonic } from '@ckd/core/bip39.js';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { requestRecoveryExport } from './download-client.js';
import { mapRecoveryTasks, RecoveryConcurrencyLimiter } from './concurrency.js';
import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { createRecoveryExport, type RecoveryExportFile, type RecoveryExportFormat } from './export.js';
import { describeUnknownError } from './error-message.js';
import { recoveryNetworkApi } from './network-client.js';
import { SecretEgressGuard } from './secret-guard.js';
import { runRecoverySelfTest } from './self-test.js';
import type {
  RecoveryFinding,
  RecoveryInputMode,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoverySection,
  RecoverySectionId,
  RecoverySeedInput,
  RecoveryWalletResult,
} from './types.js';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required recovery UI element: ${selector}.`);
  return element;
}

const form = required<HTMLFormElement>('#recovery-form');
const coinInput = required<HTMLSelectElement>('#recovery-coin');
const networkInput = required<HTMLSelectElement>('#recovery-network');
const accountInput = required<HTMLInputElement>('#recovery-account');
const singlePanel = required<HTMLElement>('#single-input');
const batchPanel = required<HTMLElement>('#batch-input');
const singleMnemonic = required<HTMLTextAreaElement>('#single-mnemonic');
const singlePassphrase = required<HTMLInputElement>('#single-passphrase');
const batchMnemonics = required<HTMLTextAreaElement>('#batch-mnemonics');
const batchPassphrases = required<HTMLTextAreaElement>('#batch-passphrases');
const batchConcurrencyInput = required<HTMLSelectElement>('#batch-concurrency');
const revealButton = required<HTMLButtonElement>('#reveal-recovery-input');
const clearInputOnStart = required<HTMLInputElement>('#clear-input-on-start');
const coreReceiveInput = required<HTMLInputElement>('#core-receive-count');
const coreChangeInput = required<HTMLInputElement>('#core-change-count');
const platformCountInput = required<HTMLInputElement>('#platform-address-count');
const identityStartInput = required<HTMLInputElement>('#identity-start-index');
const identityGapInput = required<HTMLInputElement>('#identity-gap-limit');
const identityLimitInput = required<HTMLInputElement>('#identity-scan-limit');
const requestConcurrencyInput = required<HTMLSelectElement>('#request-concurrency');
const includeUsedZeroInput = required<HTMLInputElement>('#include-used-zero-balance');
const scanShieldedInput = required<HTMLInputElement>('#scan-shielded');
const estimate = required<HTMLElement>('#scan-estimate');
const startButton = required<HTMLButtonElement>('#start-recovery-scan');
const startButtonLabel = required<HTMLElement>('#start-recovery-scan-label');
const cancelButton = required<HTMLButtonElement>('#cancel-recovery-scan');
const clearButton = required<HTMLButtonElement>('#clear-recovery');
const errorBox = required<HTMLElement>('#recovery-error');
const statusBox = required<HTMLElement>('#recovery-status');
const progressShell = required<HTMLElement>('#recovery-progress');
const progressBar = required<HTMLElement>('#recovery-progress-bar');
const progressText = required<HTMLElement>('#recovery-progress-text');
const walletProgressRoot = required<HTMLElement>('#recovery-wallet-progress');
const resultsSection = required<HTMLElement>('#recovery-results');
const resultList = required<HTMLElement>('#recovery-result-list');
const resultTabs = required<HTMLElement>('#recovery-result-tabs');
const exportCsv = required<HTMLButtonElement>('#export-recovery-csv');
const exportJson = required<HTMLButtonElement>('#export-recovery-json');
const selfTestBadge = required<HTMLElement>('#recovery-self-test');
const passportSelfTest = required<HTMLElement>('#recovery-crypto-self-test-status');
const passportSelfTestDetails = required<HTMLElement>('#recovery-crypto-self-test-details');
const recoveryRuntime = required<HTMLElement>('#recovery-runtime');
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-input-mode]')];

let inputMode: RecoveryInputMode = 'single';
let revealed = false;
let running = false;
let controller: AbortController | null = null;
let currentResults: RecoveryWalletResult[] = [];
let liveFindingCount = 0;
let selfTestPassed = false;
let activeResultId: string | null = null;
let resultTabTouched = false;
let scanCompleted = false;
// This run guard validates both public export payloads once at scan end. The
// payloads are then cached and all registered mnemonic/seed/FVK candidates are
// discarded before the user can click either download button.
const sessionSecretGuard = new SecretEgressGuard();
const validatedExports = new Map<RecoveryExportFormat, RecoveryExportFile>();
const exportTripwireContext: Record<RecoveryExportFormat, string> = {
  csv: 'recovery CSV report export',
  json: 'recovery JSON report export',
};

type WalletProgressState = 'queued' | 'running' | 'complete' | 'failed';
interface WalletProgressView {
  label: string;
  state: WalletProgressState;
  stage: string;
  message: string;
  sections: Map<RecoveryProgress['section'], string>;
}
const walletProgress = new Map<string, WalletProgressView>();
const progressSectionLabels: Record<RecoveryProgress['section'], string> = {
  prepare: 'Preparing locally',
  core: 'Dash Core · L1',
  platform: 'Platform addresses',
  identity: 'Platform identities',
  shielded: 'Orchard pool',
};

function parseInteger(input: HTMLInputElement, label: string, minimum: number): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  }
  return value;
}

function parseConcurrency(input: HTMLSelectElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} must be an integer from 1 to 5.`);
  }
  return value;
}

function scanConfig(): RecoveryScanConfig {
  return {
    network: networkInput.value === 'testnet' ? 'testnet' : 'mainnet',
    account: parseInteger(accountInput, 'Account', 0),
    coreReceiveCount: parseInteger(coreReceiveInput, 'Core receive count', 0),
    coreChangeCount: parseInteger(coreChangeInput, 'Core change count', 0),
    platformAddressCount: parseInteger(platformCountInput, 'Platform address count', 0),
    identityStartIndex: parseInteger(identityStartInput, 'Identity start index', 0),
    identityGapLimit: parseInteger(identityGapInput, 'Identity gap limit', 1),
    identityScanLimit: parseInteger(identityLimitInput, 'Identity scan limit', 1),
    includeUsedZeroBalance: includeUsedZeroInput.checked,
    scanShieldedPool: scanShieldedInput.checked,
  };
}

function recoveryInputs(): RecoverySeedInput[] {
  if (inputMode === 'single') {
    return [{
      id: 'seed-1',
      label: 'Seed phrase #1',
      mnemonic: assertValidMnemonic(singleMnemonic.value),
      passphrase: singlePassphrase.value,
    }];
  }
  const mnemonicLines = batchMnemonics.value.replaceAll('\r', '').split('\n');
  const passphraseLines = batchPassphrases.value.replaceAll('\r', '').split('\n');
  const inputs: RecoverySeedInput[] = [];
  mnemonicLines.forEach((mnemonic, lineIndex) => {
    if (mnemonic.trim().length === 0) return;
    const number = inputs.length + 1;
    inputs.push({
      id: `seed-${number}`,
      label: `Seed phrase #${number} · source line ${lineIndex + 1}`,
      mnemonic: assertValidMnemonic(mnemonic),
      passphrase: passphraseLines[lineIndex] ?? '',
    });
  });
  if (inputs.length === 0) throw new Error('Enter at least one BIP39 seed phrase in batch mode.');
  return inputs;
}

function clearVisibleSecrets(): void {
  singleMnemonic.value = '';
  singlePassphrase.value = '';
  batchMnemonics.value = '';
  batchPassphrases.value = '';
  setRevealed(false);
}

function setRevealed(value: boolean): void {
  revealed = value;
  for (const element of [singleMnemonic, singlePassphrase, batchMnemonics, batchPassphrases]) {
    element.classList.toggle('concealed', !value);
  }
  revealButton.textContent = value ? 'Conceal sensitive input' : 'Reveal sensitive input';
  revealButton.setAttribute('aria-pressed', String(value));
}

function setMode(mode: RecoveryInputMode): void {
  inputMode = mode;
  singlePanel.hidden = mode !== 'single';
  batchPanel.hidden = mode !== 'batch';
  for (const button of modeButtons) {
    const active = button.dataset.inputMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  setRevealed(false);
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError(): void {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setStatus(message: string): void {
  statusBox.textContent = message;
  statusBox.hidden = false;
}

function updateEstimate(): void {
  try {
    const core = parseInteger(coreReceiveInput, 'Core receive count', 0) + parseInteger(coreChangeInput, 'Core change count', 0);
    const platform = parseInteger(platformCountInput, 'Platform address count', 0);
    const coreBatches = Math.ceil(core / 50);
    const platformBatches = Math.ceil(platform / 100);
    const identities = parseInteger(identityLimitInput, 'Identity scan limit', 1);
    const requests = parseConcurrency(requestConcurrencyInput, 'Network concurrency');
    estimate.textContent = `${(coreBatches + platformBatches).toLocaleString()} minimum address batches + gap 20 · about ${(identities * 2).toLocaleString()} identity proof calls per seed phrase (unique + non-unique) · ${requests} network request${requests === 1 ? '' : 's'} at once${includeUsedZeroInput.checked ? ' · zero-balance Core/Platform/Orchard history enabled' : ''}${scanShieldedInput.checked ? ' · Orchard pool' : ''}`;
  } catch {
    estimate.textContent = 'Enter valid scan counts';
  }
}

function setRunning(value: boolean): void {
  running = value;
  document.body.classList.toggle('recovery-is-scanning', value);
  startButton.disabled = value || !selfTestPassed;
  cancelButton.disabled = !value;
  clearButton.disabled = value;
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')) input.disabled = value;
  for (const button of modeButtons) button.disabled = value;
  revealButton.disabled = value;
  if (value) startButtonLabel.textContent = 'Scanning…';
  else if (scanCompleted || currentResults.length > 0) startButtonLabel.textContent = 'Run a new scan';
  else startButtonLabel.textContent = 'Scan Dash holdings';
}

function renderWalletProgress(): void {
  walletProgressRoot.replaceChildren();
  let completed = 0;
  for (const view of walletProgress.values()) {
    const row = document.createElement('div');
    row.className = `wallet-progress-row ${view.state}`;
    const label = document.createElement('strong');
    label.textContent = view.label;
    const detail = document.createElement('span');
    detail.textContent = view.sections.size === 0
      ? `${view.stage} · ${view.message}`
      : [...view.sections.entries()]
        .map(([section, message]) => `${progressSectionLabels[section]}: ${message}`)
        .join(' · ');
    const state = document.createElement('i');
    state.textContent = view.state;
    row.append(label, detail, state);
    walletProgressRoot.append(row);
    if (view.state === 'complete' || view.state === 'failed') completed += 1;
  }
  const total = walletProgress.size;
  progressBar.style.width = total === 0 ? '0%' : `${(completed / total) * 100}%`;
  progressText.textContent = total === 0
    ? 'Preparing…'
    : `Completed ${completed} of ${total} seed phrase scan${total === 1 ? '' : 's'} · every active stage is shown below.`;
}

function initializeWalletProgress(inputs: RecoverySeedInput[]): void {
  walletProgress.clear();
  for (const input of inputs) {
    walletProgress.set(input.id, {
      label: input.label,
      state: 'queued',
      stage: 'Queued',
      message: 'Waiting for a seed-scan slot',
      sections: new Map(),
    });
  }
  renderWalletProgress();
}

function finishWalletProgress(inputId: string, failed = false): void {
  const view = walletProgress.get(inputId);
  if (view === undefined) return;
  view.state = failed ? 'failed' : 'complete';
  view.stage = failed ? 'Stopped' : 'Complete';
  view.message = failed ? 'This wallet did not produce a complete report' : 'All selected Dash recovery sections finished';
  if (!failed) view.sections.clear();
  renderWalletProgress();
}

function updateProgress(progress: RecoveryProgress): void {
  progressShell.hidden = false;
  const view = walletProgress.get(progress.inputId);
  if (view !== undefined) {
    view.state = 'running';
    view.stage = progressSectionLabels[progress.section];
    view.message = progress.message;
    view.sections.set(progress.section, progress.message);
  }
  renderWalletProgress();
  setStatus(`${view?.label ?? progress.inputId}: ${progress.message}`);
}

function copyButton(value: string, label = 'Copy'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    void writeClipboard(value).then(() => {
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = label; }, 1100);
    }).catch((cause: unknown) => showError(cause instanceof Error ? cause.message : String(cause)));
  });
  return button;
}

function findingCard(finding: RecoveryFinding, compact = false): HTMLElement {
  const card = document.createElement('article');
  card.className = 'finding-card';
  const head = document.createElement('div');
  head.className = 'finding-head';
  const identity = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = finding.title;
  const subtitle = document.createElement('small');
  subtitle.textContent = finding.subtitle;
  identity.append(title, subtitle);
  const balance = document.createElement('div');
  balance.className = 'finding-balance';
  balance.textContent = finding.balanceLabel;
  const titleCopy = copyButton(finding.title);
  titleCopy.className = 'compact-copy';
  balance.append(document.createElement('br'), titleCopy);
  head.append(identity, balance);
  card.append(head);
  if (!compact) {
    const fields = document.createElement('dl');
    fields.className = 'finding-fields';
    for (const field of finding.fields) {
      const term = document.createElement('dt');
      term.textContent = field.label;
      const description = document.createElement('dd');
      description.textContent = field.value;
      fields.append(term, description);
      if (field.copyable === true) fields.append(copyButton(field.value));
      else fields.append(document.createElement('span'));
    }
    card.append(fields);
  }
  return card;
}

function renderLiveFinding(inputId: string, section: RecoverySectionId, finding: RecoveryFinding): void {
  resultsSection.hidden = false;
  let live = resultList.querySelector<HTMLElement>('#live-recovery-findings');
  if (live === null) {
    live = document.createElement('section');
    live.id = 'live-recovery-findings';
    live.className = 'live-findings';
    const label = document.createElement('p');
    label.textContent = 'Found while scanning · final proof/state summary will replace this live list';
    live.append(label);
    resultList.prepend(live);
  }
  liveFindingCount += 1;
  if (liveFindingCount <= 200) live.append(findingCard({ ...finding, subtitle: `${inputId} · ${section} · ${finding.subtitle}` }, true));
  else if (liveFindingCount === 201) {
    const note = document.createElement('p');
    note.textContent = 'More than 200 live findings: further rows are retained for the final result and export without expanding the live DOM.';
    live.append(note);
  }
}

function renderMetric(label: string, value: string, tone = 'neutral'): HTMLElement {
  const metric = document.createElement('div');
  metric.className = `section-metric ${tone}`;
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('strong');
  amount.textContent = value;
  metric.append(name, amount);
  return metric;
}

function renderSection(section: RecoverySection): HTMLElement {
  const article = document.createElement('section');
  article.className = `scan-section ${section.state}`;
  const head = document.createElement('div');
  head.className = 'scan-section-head';
  const copy = document.createElement('div');
  const title = document.createElement('h4');
  title.textContent = section.title;
  const description = document.createElement('p');
  description.textContent = section.description;
  copy.append(title, description);
  const state = document.createElement('span');
  state.className = `section-state ${section.state}`;
  state.textContent = section.state;
  head.append(copy, state);
  const metrics = document.createElement('div');
  metrics.className = 'section-metrics';
  metrics.append(...section.metrics.map((metric) => renderMetric(metric.label, metric.value, metric.tone)));
  const proof = document.createElement('p');
  proof.className = 'section-proof';
  proof.textContent = `${section.proof} · source: ${section.source}`;
  article.append(head, metrics, proof);
  if (section.warning !== undefined) {
    const warning = document.createElement('p');
    warning.className = 'section-warning';
    warning.textContent = section.warning;
    article.append(warning);
  }
  const findings = document.createElement('div');
  findings.className = 'finding-list';
  if (section.findings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'finding-empty';
    const emptyMessages: Record<RecoverySectionId, string> = {
      core: 'No funded Dash Core L1 address was found in this section and scanned range.',
      platform: 'No funded Dash Platform payment address was found in this section and scanned range.',
      identity: 'No funded Dash Platform identity was found in this section and scanned range.',
      shielded: 'No spendable Dash Orchard note was found in this section of the complete pool scan.',
    };
    empty.textContent = section.state === 'complete' ? emptyMessages[section.id] : 'No authoritative findings are available for this section.';
    findings.append(empty);
  } else {
    findings.append(...section.findings.map((finding) => findingCard(finding)));
  }
  article.append(findings);
  return article;
}

function renderResults(results: RecoveryWalletResult[]): void {
  resultList.replaceChildren();
  resultTabs.replaceChildren();
  if (!resultTabTouched || !results.some(({ inputId }) => inputId === activeResultId)) {
    activeResultId = results[0]?.inputId ?? null;
  }
  for (const result of results) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'recovery-result-tab';
    const active = result.inputId === activeResultId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
    const failed = result.sections.some(({ state }) => state === 'failed');
    tab.textContent = `${result.label}${failed ? ' · warning' : ' · complete'}`;
    tab.addEventListener('click', () => {
      activeResultId = result.inputId;
      resultTabTouched = true;
      renderResults(currentResults);
    });
    resultTabs.append(tab);
  }
  const result = results.find(({ inputId }) => inputId === activeResultId);
  if (result !== undefined) {
    const wallet = document.createElement('article');
    wallet.className = 'wallet-result';
    const head = document.createElement('div');
    head.className = 'wallet-result-head';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = result.label;
    const subtitle = document.createElement('p');
    subtitle.textContent = `${result.coinLabel} · ${result.network} · completed ${new Date(result.completedAt).toLocaleString()}`;
    copy.append(title, subtitle);
    const state = document.createElement('span');
    state.className = 'wallet-state';
    state.textContent = result.sections.some(({ state: sectionState }) => sectionState === 'failed') ? 'Completed with warnings' : 'Scan complete';
    head.append(copy, state);
    wallet.append(head);
    const overview = document.createElement('section');
    overview.className = 'wallet-overview';
    const overviewTitle = document.createElement('strong');
    overviewTitle.textContent = 'Wallet-wide located balances';
    const overviewNote = document.createElement('p');
    overviewNote.textContent = 'This total includes funded Core addresses, Platform payment addresses, identity credits, and spendable Orchard notes from the completed sections below.';
    const overviewMetrics = document.createElement('div');
    overviewMetrics.className = 'section-metrics wallet-overview-metrics';
    overviewMetrics.append(...result.overview.map((metric) => renderMetric(metric.label, metric.value, metric.tone)));
    overview.append(overviewTitle, overviewNote, overviewMetrics);
    wallet.append(overview);
    // General audit/recovery notices are shown once above the result tabs. Keep
    // result.warnings in JSON exports without repeating them for every wallet.
    wallet.append(...result.sections.map(renderSection));
    resultList.append(wallet);
  }
  resultTabs.hidden = results.length < 2;
  resultsSection.hidden = results.length === 0;
  exportCsv.disabled = !validatedExports.has('csv');
  exportJson.disabled = !validatedExports.has('json');
}

function stageValidatedExports(): void {
  validatedExports.clear();
  try {
    if (currentResults.length === 0) return;
    const date = new Date();
    for (const format of ['csv', 'json'] as const) {
      const file = createRecoveryExport(currentResults, format, date);
      sessionSecretGuard.assertPublic(file.text, exportTripwireContext[format]);
      validatedExports.set(format, file);
    }
  } catch (cause) {
    validatedExports.clear();
    throw cause;
  } finally {
    // Every downloadable byte string has now crossed the tripwire. Retaining
    // mnemonic/seed/FVK candidates for later button clicks is unnecessary.
    sessionSecretGuard.clear();
  }
}

async function downloadExport(format: RecoveryExportFormat): Promise<void> {
  try {
    const file = validatedExports.get(format);
    if (file === undefined) throw new Error('Run and complete a fresh recovery scan before exporting.');
    const filename = await requestRecoveryExport(file.text, format);
    setStatus(`Exported ${filename}. No recovery phrase or private/viewing/spending key is included.`);
  } catch (cause) {
    showError(describeUnknownError(cause));
  }
}

function wipeInputObjects(inputs: RecoverySeedInput[]): void {
  for (const input of inputs) {
    input.mnemonic = '';
    input.passphrase = '';
  }
}

startButton.addEventListener('click', () => {
  if (running) return;
  clearError();
  let inputs: RecoverySeedInput[] = [];
  try {
    inputs = recoveryInputs();
    const config = scanConfig();
    const seedConcurrency = inputMode === 'single' ? 1 : parseConcurrency(batchConcurrencyInput, 'Batch seed concurrency');
    const requestConcurrency = parseConcurrency(requestConcurrencyInput, 'Network concurrency');
    const adapter = getRecoveryCoin(coinInput.value);
    if (!adapter.networks.includes(config.network)) throw new Error(`${adapter.label} does not support ${config.network}.`);
    sessionSecretGuard.clear();
    validatedExports.clear();
    if (clearInputOnStart.checked) clearVisibleSecrets();
    currentResults = [];
    activeResultId = null;
    resultTabTouched = false;
    scanCompleted = false;
    liveFindingCount = 0;
    // Remove the previous report before any asynchronous work starts. This
    // makes a configuration-driven re-scan visibly distinct and prevents a
    // completed old tab from being mistaken for the active run.
    renderResults([]);
    controller = new AbortController();
    const runController = controller;
    const networkLimiter = new RecoveryConcurrencyLimiter(requestConcurrency);
    setRunning(true);
    progressShell.hidden = false;
    initializeWalletProgress(inputs);
    const run = async (): Promise<void> => {
      try {
        const networkApi = await recoveryNetworkApi();
        const orderedResults: Array<RecoveryWalletResult | undefined> = new Array(inputs.length);
        const preparedSections = inputs.length > 1 && config.scanShieldedPool && adapter.prepareBatch !== undefined
          ? adapter.prepareBatch(inputs, config, {
              signal: runController.signal,
              networkApi,
              networkLimiter,
              sessionSecretGuard,
              onProgress: updateProgress,
              onFinding: renderLiveFinding,
            })
          : undefined;
        setStatus(`Scanning ${inputs.length} seed phrase${inputs.length === 1 ? '' : 's'} · up to ${seedConcurrency} seed scan${seedConcurrency === 1 ? '' : 's'} and ${requestConcurrency} network request${requestConcurrency === 1 ? '' : 's'} at once…`);
        await mapRecoveryTasks(inputs, seedConcurrency, async (input, index) => {
          try {
            const result = await adapter.scan(input, config, {
              signal: runController.signal,
              networkApi,
              networkLimiter,
              sessionSecretGuard,
              ...(preparedSections === undefined ? {} : { preparedSections }),
              onProgress: updateProgress,
              onFinding: renderLiveFinding,
            });
            orderedResults[index] = result;
            currentResults = orderedResults.filter((candidate): candidate is RecoveryWalletResult => candidate !== undefined);
            renderResults(currentResults);
            finishWalletProgress(input.id);
            return result;
          } catch (cause) {
            finishWalletProgress(input.id, true);
            runController.abort();
            throw cause;
          } finally {
            input.mnemonic = '';
            input.passphrase = '';
          }
        });
        renderWalletProgress();
        stageValidatedExports();
        renderResults(currentResults);
        setStatus('Recovery scan complete. Review and export the standard-wallet handoff report.');
        scanCompleted = true;
      } catch (cause) {
        for (const view of walletProgress.values()) {
          if (view.state === 'complete' || view.state === 'failed') continue;
          view.state = 'failed';
          view.stage = 'Stopped';
          view.message = 'This wallet did not produce a complete report';
        }
        renderWalletProgress();
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          setStatus('Scan cancelled between bounded operations. Completed wallet reports remain exportable; the active wallet is incomplete and was not added.');
        } else {
          showError(describeUnknownError(cause));
        }
        if (currentResults.length > 0) {
          try {
            stageValidatedExports();
            renderResults(currentResults);
          } catch (exportCause) {
            showError(`Completed reports could not pass the export tripwire: ${describeUnknownError(exportCause)}`);
          }
        }
      } finally {
        wipeInputObjects(inputs);
        sessionSecretGuard.clear();
        controller = null;
        setRunning(false);
      }
    };
    void run();
  } catch (cause) {
    wipeInputObjects(inputs);
    sessionSecretGuard.clear();
    showError(describeUnknownError(cause));
  }
});

for (const button of modeButtons) {
  button.addEventListener('click', () => setMode(button.dataset.inputMode === 'batch' ? 'batch' : 'single'));
}
revealButton.addEventListener('click', () => setRevealed(!revealed));
cancelButton.addEventListener('click', () => {
  controller?.abort();
  cancelButton.disabled = true;
  setStatus('Cancellation requested. Waiting for the current network/proof operation to finish…');
});
clearButton.addEventListener('click', () => {
  clearVisibleSecrets();
  sessionSecretGuard.clear();
  validatedExports.clear();
  currentResults = [];
  activeResultId = null;
  resultTabTouched = false;
  scanCompleted = false;
  resultList.replaceChildren();
  resultTabs.replaceChildren();
  walletProgress.clear();
  walletProgressRoot.replaceChildren();
  startButtonLabel.textContent = 'Scan Dash holdings';
  resultsSection.hidden = true;
  progressShell.hidden = true;
  statusBox.hidden = true;
  clearError();
});
exportCsv.addEventListener('click', () => { void downloadExport('csv'); });
exportJson.addEventListener('click', () => { void downloadExport('json'); });
for (const input of [
  accountInput,
  coreReceiveInput,
  coreChangeInput,
  platformCountInput,
  identityStartInput,
  identityGapInput,
  identityLimitInput,
  requestConcurrencyInput,
  includeUsedZeroInput,
  scanShieldedInput,
]) {
  input.addEventListener('input', updateEstimate);
  input.addEventListener('change', updateEstimate);
}
window.addEventListener('pagehide', () => sessionSecretGuard.clear());

for (const adapter of listRecoveryCoins()) {
  const option = document.createElement('option');
  option.value = adapter.id;
  option.textContent = adapter.label;
  coinInput.append(option);
}
exportCsv.disabled = true;
exportJson.disabled = true;
required<HTMLElement>('#recovery-build-version').textContent = BUILD_INFO.version;
required<HTMLElement>('#recovery-build-date').textContent = BUILD_INFO.releaseDate;
required<HTMLElement>('#recovery-build-fingerprint').textContent = BUILD_INFO.fingerprint;
required<HTMLElement>('#recovery-artifact-checksum-file').textContent = BUILD_INFO.checksumFile;
required<HTMLElement>('#recovery-build-footer').textContent = `v${BUILD_INFO.version} · ${BUILD_INFO.fingerprint.slice(0, 16)}…`;
setMode('single');
updateEstimate();
startButton.disabled = true;
void Promise.all([
  runRecoverySelfTest(),
  recoveryNetworkApi().then(async (networkApi) => {
    const identity = await networkApi.ping();
    if (identity !== 'isolated-network-worker-v1') throw new Error('Recovery Network Worker returned an unexpected identity.');
    return identity;
  }),
]).then(([report]) => {
  selfTestPassed = true;
  selfTestBadge.className = 'self-test-badge passed';
  passportSelfTest.className = 'self-test-badge passed';
  passportSelfTest.textContent = 'Cryptographic self-test passed';
  const checks = [...report.checks, 'Isolated Network Worker RPC boundary'];
  selfTestBadge.textContent = `${checks.length} self-tests passed · ${report.durationMs} ms`;
  passportSelfTestDetails.textContent = `${checks.length} startup checks passed in ${report.durationMs.toLocaleString()} ms: ${checks.join(' · ')}. Scanning is enabled.`;
  recoveryRuntime.textContent = "Opaque-origin Secret Vault · connect-src/worker-src 'none' · isolated Evo Network Worker · scan-end export tripwire · secret candidates discarded before download · shell export broker · max 5 requests";
  startButton.disabled = false;
}).catch((cause: unknown) => {
  selfTestBadge.className = 'self-test-badge failed';
  selfTestBadge.textContent = 'Self-test failed · scanning disabled';
  passportSelfTest.className = 'self-test-badge failed';
  passportSelfTest.textContent = 'Cryptographic self-test failed';
  passportSelfTestDetails.textContent = cause instanceof Error ? cause.message : String(cause);
  recoveryRuntime.textContent = 'Blocked · self-test failure';
  showError(cause instanceof Error ? cause.message : String(cause));
});
