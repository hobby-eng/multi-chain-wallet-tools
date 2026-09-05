import type { BUILD_INFO } from '@ckd/build-info';
import type { RecoveryExportFormat } from './export.js';
import {
  RECOVERY_CORE_ADDRESS_BATCH,
  RECOVERY_PLATFORM_ADDRESS_BATCH,
} from './network-protocol.js';
import type {
  RecoveryFinding,
  RecoveryInputMode,
  RecoveryProgress,
  RecoverySection,
  RecoverySectionId,
  RecoveryWalletResult,
} from './types.js';

export type WalletProgressState = 'queued' | 'running' | 'complete' | 'failed';

export interface WalletProgressView {
  label: string;
  state: WalletProgressState;
  stage: string;
  message: string;
  sections: ReadonlyMap<RecoveryProgress['section'], string>;
}

export interface RecoveryInputSnapshot {
  coinId: string;
  network: string;
  account: string;
  singleMnemonic: string;
  singlePassphrase: string;
  batchMnemonics: string;
  batchPassphrases: string;
  batchConcurrency: string;
  requestConcurrency: string;
  clearInputOnStart: boolean;
  scanCore: boolean;
  coreReceiveCount: string;
  coreChangeCount: string;
  scanPlatformAddresses: boolean;
  platformAddressCount: string;
  scanPlatformIdentities: boolean;
  identityStartIndex: string;
  identityGapLimit: string;
  identityScanLimit: string;
  includeUsedZeroBalance: boolean;
  scanShieldedPool: boolean;
}

const progressSectionLabels: Record<RecoveryProgress['section'], string> = {
  prepare: 'Preparing locally',
  core: 'Dash Core · L1',
  platform: 'Platform addresses',
  identity: 'Platform identities',
  shielded: 'Orchard pool',
};

function requireElement<T extends HTMLElement>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required recovery UI element: ${selector}.`);
  return element;
}

function estimateInteger(value: string, minimum: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error('Invalid estimate input.');
  return number;
}

function estimateConcurrency(value: string): number {
  const number = estimateInteger(value, 1);
  if (number > 5) throw new Error('Invalid estimate concurrency.');
  return number;
}

export function createDiscoveryScannerView(
  document: Document,
  buildInfo: typeof BUILD_INFO,
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard,
) {
  const required = <T extends HTMLElement>(selector: string): T => requireElement<T>(document, selector);
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
  const scanCoreInput = required<HTMLInputElement>('#scan-core');
  const coreReceiveInput = required<HTMLInputElement>('#core-receive-count');
  const coreChangeInput = required<HTMLInputElement>('#core-change-count');
  const scanPlatformAddressesInput = required<HTMLInputElement>('#scan-platform-addresses');
  const platformCountInput = required<HTMLInputElement>('#platform-address-count');
  const scanPlatformIdentitiesInput = required<HTMLInputElement>('#scan-platform-identities');
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
  const exportCsvButton = required<HTMLButtonElement>('#export-recovery-csv');
  const exportJsonButton = required<HTMLButtonElement>('#export-recovery-json');
  const selfTestBadge = required<HTMLElement>('#recovery-self-test');
  const passportSelfTest = required<HTMLElement>('#recovery-crypto-self-test-status');
  const passportSelfTestDetails = required<HTMLElement>('#recovery-crypto-self-test-details');
  const recoveryRuntime = required<HTMLElement>('#recovery-runtime');
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-input-mode]')];
  const estimateInputs = [
    accountInput,
    scanCoreInput,
    coreReceiveInput,
    coreChangeInput,
    scanPlatformAddressesInput,
    platformCountInput,
    scanPlatformIdentitiesInput,
    identityStartInput,
    identityGapInput,
    identityLimitInput,
    requestConcurrencyInput,
    includeUsedZeroInput,
    scanShieldedInput,
  ];
  const componentSettings: Record<'core' | 'platform' | 'identity', HTMLElement[]> = {
    core: [...document.querySelectorAll<HTMLElement>('[data-component-settings="core"]')],
    platform: [...document.querySelectorAll<HTMLElement>('[data-component-settings="platform"]')],
    identity: [...document.querySelectorAll<HTMLElement>('[data-component-settings="identity"]')],
  };

  function setComponentSettings(): void {
    for (const [component, enabled] of [
      ['core', scanCoreInput.checked],
      ['platform', scanPlatformAddressesInput.checked],
      ['identity', scanPlatformIdentitiesInput.checked],
    ] as const) {
      for (const element of componentSettings[component]) element.hidden = !enabled;
    }
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

  function showError(message: string): void {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  return {
    form,
    startButton,
    cancelButton,
    clearButton,
    revealButton,
    exportCsvButton,
    exportJsonButton,
    modeButtons,
    estimateInputs,
    readInputs(): RecoveryInputSnapshot {
      return {
        coinId: coinInput.value,
        network: networkInput.value,
        account: accountInput.value,
        singleMnemonic: singleMnemonic.value,
        singlePassphrase: singlePassphrase.value,
        batchMnemonics: batchMnemonics.value,
        batchPassphrases: batchPassphrases.value,
        batchConcurrency: batchConcurrencyInput.value,
        requestConcurrency: requestConcurrencyInput.value,
        clearInputOnStart: clearInputOnStart.checked,
        scanCore: scanCoreInput.checked,
        coreReceiveCount: coreReceiveInput.value,
        coreChangeCount: coreChangeInput.value,
        scanPlatformAddresses: scanPlatformAddressesInput.checked,
        platformAddressCount: platformCountInput.value,
        scanPlatformIdentities: scanPlatformIdentitiesInput.checked,
        identityStartIndex: identityStartInput.value,
        identityGapLimit: identityGapInput.value,
        identityScanLimit: identityLimitInput.value,
        includeUsedZeroBalance: includeUsedZeroInput.checked,
        scanShieldedPool: scanShieldedInput.checked,
      };
    },
    setMode(mode: RecoveryInputMode): void {
      singlePanel.hidden = mode !== 'single';
      batchPanel.hidden = mode !== 'batch';
      for (const button of modeButtons) {
        const active = button.dataset.inputMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
    setRevealed(value: boolean): void {
      for (const element of [singleMnemonic, singlePassphrase, batchMnemonics, batchPassphrases]) {
        element.classList.toggle('concealed', !value);
      }
      revealButton.textContent = value ? 'Conceal sensitive input' : 'Reveal sensitive input';
      revealButton.setAttribute('aria-pressed', String(value));
    },
    clearVisibleSecrets(): void {
      singleMnemonic.value = '';
      singlePassphrase.value = '';
      batchMnemonics.value = '';
      batchPassphrases.value = '';
    },
    showError,
    clearError(): void {
      errorBox.hidden = true;
      errorBox.textContent = '';
    },
    setStatus(message: string): void {
      statusBox.textContent = message;
      statusBox.hidden = false;
    },
    hideStatus(): void {
      statusBox.hidden = true;
    },
    updateEstimate(): void {
      setComponentSettings();
      try {
        const core = scanCoreInput.checked
          ? estimateInteger(coreReceiveInput.value, 0) + estimateInteger(coreChangeInput.value, 0)
          : 0;
        const platform = scanPlatformAddressesInput.checked ? estimateInteger(platformCountInput.value, 0) : 0;
        const coreBatches = Math.ceil(core / RECOVERY_CORE_ADDRESS_BATCH);
        const platformBatches = Math.ceil(platform / RECOVERY_PLATFORM_ADDRESS_BATCH);
        const identities = scanPlatformIdentitiesInput.checked ? estimateInteger(identityLimitInput.value, 1) : 0;
        const requests = estimateConcurrency(requestConcurrencyInput.value);
        const components = [scanCoreInput, scanPlatformAddressesInput, scanPlatformIdentitiesInput, scanShieldedInput]
          .filter(({ checked }) => checked).length;
        estimate.textContent = components === 0
          ? 'Select at least one component'
          : `${components} component${components === 1 ? '' : 's'} · ${(coreBatches + platformBatches).toLocaleString()} minimum address batches${coreBatches + platformBatches > 0 ? ' + gap 20' : ''} · about ${(identities * 2).toLocaleString()} identity proof calls per seed phrase · ${requests} network request${requests === 1 ? '' : 's'} at once${includeUsedZeroInput.checked ? ' · zero-balance history enabled' : ''}${scanShieldedInput.checked ? ' · complete Orchard pool' : ''}`;
      } catch {
        estimate.textContent = 'Enter valid scan counts';
      }
    },
    setRunning(value: boolean, selfTestPassed: boolean, hasCompletedScan: boolean): void {
      document.body.classList.toggle('recovery-is-scanning', value);
      startButton.disabled = value || !selfTestPassed;
      cancelButton.disabled = !value;
      clearButton.disabled = value;
      for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')) {
        input.disabled = value;
      }
      for (const button of modeButtons) button.disabled = value;
      revealButton.disabled = value;
      if (value) startButtonLabel.textContent = 'Scanning…';
      else if (hasCompletedScan) startButtonLabel.textContent = 'Run a new scan';
      else startButtonLabel.textContent = 'Scan Dash holdings';
    },
    showProgress(): void {
      progressShell.hidden = false;
    },
    renderWalletProgress(walletProgress: ReadonlyMap<string, WalletProgressView>): void {
      walletProgressRoot.replaceChildren();
      let completed = 0;
      for (const progress of walletProgress.values()) {
        const row = document.createElement('div');
        row.className = `wallet-progress-row ${progress.state}`;
        const label = document.createElement('strong');
        label.textContent = progress.label;
        const detail = document.createElement('span');
        detail.textContent = progress.sections.size === 0
          ? `${progress.stage} · ${progress.message}`
          : [...progress.sections.entries()]
            .map(([section, message]) => `${progressSectionLabels[section]}: ${message}`)
            .join(' · ');
        const state = document.createElement('i');
        state.textContent = progress.state;
        row.append(label, detail, state);
        walletProgressRoot.append(row);
        if (progress.state === 'complete' || progress.state === 'failed') completed += 1;
      }
      const total = walletProgress.size;
      progressBar.style.width = total === 0 ? '0%' : `${(completed / total) * 100}%`;
      progressText.textContent = total === 0
        ? 'Preparing…'
        : `Completed ${completed} of ${total} seed phrase scan${total === 1 ? '' : 's'} · every active stage is shown below.`;
    },
    progressSectionLabel(section: RecoveryProgress['section']): string {
      return progressSectionLabels[section];
    },
    renderLiveFinding(inputId: string, section: RecoverySectionId, finding: RecoveryFinding, findingCount: number): void {
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
      if (findingCount <= 200) {
        live.append(findingCard({ ...finding, subtitle: `${inputId} · ${section} · ${finding.subtitle}` }, true));
      } else if (findingCount === 201) {
        const note = document.createElement('p');
        note.textContent = 'More than 200 live findings: further rows are retained for the final result and export without expanding the live DOM.';
        live.append(note);
      }
    },
    renderResults(
      results: readonly RecoveryWalletResult[],
      activeResultId: string | null,
      exportFormats: ReadonlySet<RecoveryExportFormat>,
      selectResult: (inputId: string) => void,
    ): void {
      resultList.replaceChildren();
      resultTabs.replaceChildren();
      for (const result of results) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'recovery-result-tab';
        const active = result.inputId === activeResultId;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-pressed', String(active));
        const failed = result.sections.some(({ state }) => state === 'failed');
        tab.textContent = `${result.label}${failed ? ' · warning' : ' · complete'}`;
        tab.addEventListener('click', () => selectResult(result.inputId));
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
        state.textContent = result.sections.some(({ state: sectionState }) => sectionState === 'failed')
          ? 'Completed with warnings'
          : 'Scan complete';
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
        wallet.append(...result.sections.map(renderSection));
        resultList.append(wallet);
      }
      resultTabs.hidden = results.length < 2;
      resultsSection.hidden = results.length === 0;
      exportCsvButton.disabled = !exportFormats.has('csv');
      exportJsonButton.disabled = !exportFormats.has('json');
    },
    resetResults(): void {
      resultList.replaceChildren();
      resultTabs.replaceChildren();
      walletProgressRoot.replaceChildren();
      resultsSection.hidden = true;
      progressShell.hidden = true;
      exportCsvButton.disabled = true;
      exportJsonButton.disabled = true;
    },
    populateCoins(coins: ReadonlyArray<{ id: string; label: string }>): void {
      for (const coin of coins) {
        const option = document.createElement('option');
        option.value = coin.id;
        option.textContent = coin.label;
        coinInput.append(option);
      }
    },
    showSelfTestPassed(checks: readonly string[], durationMs: number): void {
      selfTestBadge.className = 'self-test-badge passed';
      passportSelfTest.className = 'self-test-badge passed';
      passportSelfTest.textContent = 'Cryptographic self-test passed';
      selfTestBadge.textContent = `${checks.length} self-tests passed · ${durationMs} ms`;
      passportSelfTestDetails.textContent = `${checks.length} startup checks passed in ${durationMs.toLocaleString()} ms: ${checks.join(' · ')}. Scanning is enabled.`;
      recoveryRuntime.textContent = "Opaque-origin Secret Vault · connect-src/worker-src 'none' · isolated Evo Network Worker · scan-end export tripwire · secret candidates discarded before download · shell export broker · max 5 requests";
    },
    showSelfTestFailed(message: string): void {
      selfTestBadge.className = 'self-test-badge failed';
      selfTestBadge.textContent = 'Self-test failed · scanning disabled';
      passportSelfTest.className = 'self-test-badge failed';
      passportSelfTest.textContent = 'Cryptographic self-test failed';
      passportSelfTestDetails.textContent = message;
      recoveryRuntime.textContent = 'Blocked · self-test failure';
      showError(message);
    },
    setBuildInfo(): void {
      required<HTMLElement>('#recovery-build-version').textContent = buildInfo.version;
      required<HTMLElement>('#recovery-build-date').textContent = buildInfo.releaseDate;
      required<HTMLElement>('#recovery-build-edition').textContent = buildInfo.edition;
      required<HTMLElement>('#recovery-build-profile').textContent = buildInfo.profile;
      required<HTMLElement>('#recovery-build-fingerprint').textContent = buildInfo.fingerprint;
      required<HTMLElement>('#recovery-artifact-checksum-file').textContent = buildInfo.checksumFile;
      required<HTMLElement>('#recovery-build-footer').textContent = `v${buildInfo.version} · ${buildInfo.fingerprint.slice(0, 16)}…`;
    },
  };
}

export type DiscoveryScannerView = ReturnType<typeof createDiscoveryScannerView>;
