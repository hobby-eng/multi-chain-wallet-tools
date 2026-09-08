import { historyFields } from './history.js';
import { assertWatchOnlyBatchInput, parseWatchOnlyLines, resolveWatchOnlyTargets } from './watch-only.js';
import type { BUILD_INFO } from '@ckd/build-info';
import type { RecoveryExportFormat } from './export.js';
import {
  RECOVERY_CORE_ADDRESS_BATCH,
  RECOVERY_PLATFORM_ADDRESS_BATCH,
} from './network-protocol.js';
import type {
  RecoveryFinding,
  RecoveryCoinAdapter,
  RecoveryInputMode,
  RecoverySourceMode,
  RecoveryProgress,
  RecoverySection,
  RecoverySectionId,
  RecoveryWalletResult,
} from './types.js';

declare const __DASH_COMMUNITY__: boolean;

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
  sourceMode: RecoverySourceMode;
  watchOnlyKeys: string;
  watchOnlyMinimumCount: string;
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
  scanCustomPath: boolean;
  customPathTemplate: string;
  customPathFormat: string;
  customPathCount: string;
  scanLegacyCore: boolean;
  legacyCoreCount: string;
  scanCoinJoin: boolean;
  coinJoinExternalCount: string;
  coinJoinInternalCount: string;
  scanIdentityFunding: boolean;
  identityFundingCount: string;
  identityTopUpIdentityCount: string;
  identityTopUpCount: string;
  scanProviderCollateral: boolean;
  providerCollateralCount: string;
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
  legacyCore: 'Legacy mobile Core',
  coinjoin: 'Dash Mobile CoinJoin · DIP9',
  identityFunding: 'Identity funding',
  providerCollateral: 'Masternode holdings',
  platform: 'Platform addresses',
  identity: 'Platform identities',
  shielded: 'Orchard pool',
};

export type RecoveryComponentGroupId = 'core' | 'platform' | 'identity' | 'shielded';

/**
 * Second-level result tabs. Each scanned seed phrase is split by component so
 * Core L1 addresses, Platform payment addresses, Platform identities and the
 * Orchard pool are never mixed in one list. Every Core-compatible P2PKH family
 * (BIP44, legacy mobile, CoinJoin, identity funding, masternode holdings) is
 * an L1 address set and therefore lives under the Core tab.
 */
const componentGroups: ReadonlyArray<{ id: RecoveryComponentGroupId; label: string; sections: readonly RecoverySectionId[] }> = [
  { id: 'core', label: 'Dash Core · L1', sections: ['core', 'legacyCore', 'coinjoin', 'providerCollateral'] },
  { id: 'platform', label: 'Platform addresses', sections: ['platform'] },
  { id: 'identity', label: 'Platform identities', sections: ['identity'] },
  { id: 'shielded', label: 'Orchard pool', sections: ['shielded'] },
];

function groupSections(result: RecoveryWalletResult, group: (typeof componentGroups)[number]): RecoverySection[] {
  return group.sections
    .map((id) => result.sections.find((section) => section.id === id))
    .filter((section): section is RecoverySection => section !== undefined);
}

function groupSummary(sections: readonly RecoverySection[]): { label: string; tone: 'skipped' | 'failed' | 'partial' | 'complete' } {
  if (sections.length === 0 || sections.every(({ state }) => state === 'skipped')) return { label: 'skipped', tone: 'skipped' };
  const funded = sections.reduce((sum, section) => sum + section.findings.filter(({ balanceAtomic }) => balanceAtomic > 0n).length, 0);
  const listed = sections.reduce((sum, section) => sum + section.findings.length, 0);
  const count = funded === listed ? `${funded} funded` : `${funded} funded · ${listed} listed`;
  if (sections.some(({ state }) => state === 'failed')) return { label: `${count} · warning`, tone: 'failed' };
  if (sections.some(({ state }) => state === 'partial')) return { label: `${count} · partial`, tone: 'partial' };
  return { label: count, tone: 'complete' };
}

const COINJOIN_COIN_TYPE: Record<'mainnet' | 'testnet', number> = { mainnet: 5, testnet: 1 };

function coinJoinPathPattern(network: string): string {
  const coinType = COINJOIN_COIN_TYPE[network as 'mainnet' | 'testnet'] ?? COINJOIN_COIN_TYPE.mainnet;
  return `external m/9'/${coinType}'/4'/0'/0/i · internal m/9'/${coinType}'/4'/0'/1/i`;
}

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
  const coinInput = document.querySelector<HTMLSelectElement>('#recovery-coin');
  let profileCoinId: string | null = null;
  let seedCoinId = '';
  let publicCoinId = '';
  const coinAdapters = new Map<string, RecoveryCoinAdapter>();
  const networkInput = required<HTMLSelectElement>('#recovery-network');
  const scanCoverageDescription = required<HTMLElement>('#scan-coverage-description');
  const genericCoinScanNote = required<HTMLElement>('#generic-coin-scan-note');
  const receiveField = required<HTMLElement>('#recovery-receive-field');
  const receiveLabel = required<HTMLLabelElement>('#recovery-receive-label');
  const changeField = required<HTMLElement>('#recovery-change-field');
  const changeLabel = required<HTMLLabelElement>('#recovery-change-label');
  const customPathOptions = required<HTMLElement>('#custom-path-options');
  const customPathField = required<HTMLElement>('#custom-path-field');
  const scanCustomPathInput = required<HTMLInputElement>('#scan-custom-path');
  const customPathTemplateInput = required<HTMLInputElement>('#custom-path-template');
  const customPathFormatInput = required<HTMLSelectElement>('#custom-path-format');
  const customPathCountInput = required<HTMLInputElement>('#custom-path-count');
  const customPathDescription = required<HTMLElement>('#custom-path-description');
  const dashCoverage = [...document.querySelectorAll<HTMLElement>('[data-dash-coverage]')];
  const accountInput = required<HTMLInputElement>('#recovery-account');
  const sourceGrid = required<HTMLElement>('.recovery-source-grid');
  let sourceMode: RecoverySourceMode = 'seed';
  let seedMode: RecoveryInputMode = 'single';
  const sourceButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-source-mode]')];
  const publicPanel = required<HTMLElement>('#public-input');
  const seedModeTabs = required<HTMLElement>('#seed-mode-tabs');
  const watchOnlyKeys = required<HTMLTextAreaElement>('#watch-only-keys');
  const watchOnlyMinimum = required<HTMLInputElement>('#watch-only-minimum');
  const watchOnlyDetection = required<HTMLElement>('#watch-only-detection');
  const seedCoverage = required<HTMLElement>('#seed-coverage');
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
  const scanLegacyCoreInput = required<HTMLInputElement>('#scan-legacy-core');
  const legacyCoreCountInput = required<HTMLInputElement>('#legacy-core-count');
  const scanCoinJoinInput = required<HTMLInputElement>('#scan-coinjoin');
  const coreReceiveInput = required<HTMLInputElement>('#core-receive-count');
  const coreChangeInput = required<HTMLInputElement>('#core-change-count');
  const coinJoinExternalCountInput = required<HTMLInputElement>('#coinjoin-external-count');
  const coinJoinInternalCountInput = required<HTMLInputElement>('#coinjoin-internal-count');
  const coinJoinPathPreview = required<HTMLElement>('#coinjoin-path-preview');
  const scanIdentityFundingInput = required<HTMLInputElement>('#scan-identity-funding');
  const identityFundingCountInput = required<HTMLInputElement>('#identity-funding-count');
  const identityTopUpIdentityCountInput = required<HTMLInputElement>('#identity-topup-identity-count');
  const identityTopUpCountInput = required<HTMLInputElement>('#identity-topup-count');
  const scanProviderCollateralInput = required<HTMLInputElement>('#scan-provider-collateral');
  const providerCollateralCountInput = required<HTMLInputElement>('#provider-collateral-count');
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
    watchOnlyKeys,
    watchOnlyMinimum,
    ...(coinInput === null ? [] : [coinInput]),
    scanCustomPathInput,
    customPathTemplateInput,
    customPathFormatInput,
    customPathCountInput,
    networkInput,
    accountInput,
    scanCoreInput,
    coreReceiveInput,
    coreChangeInput,
    scanLegacyCoreInput,
    legacyCoreCountInput,
    scanCoinJoinInput,
    coinJoinExternalCountInput,
    coinJoinInternalCountInput,
    scanIdentityFundingInput,
    identityFundingCountInput,
    identityTopUpIdentityCountInput,
    identityTopUpCountInput,
    scanProviderCollateralInput,
    providerCollateralCountInput,
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
  const componentSettings: Record<'core' | 'legacyCore' | 'coinjoin' | 'identityFunding' | 'providerCollateral' | 'platform' | 'identity', HTMLElement[]> = {
    core: [...document.querySelectorAll<HTMLElement>('[data-component-settings="core"]')],
    legacyCore: [...document.querySelectorAll<HTMLElement>('[data-component-settings="legacy-core"]')],
    coinjoin: [...document.querySelectorAll<HTMLElement>('[data-component-settings="coinjoin"]')],
    identityFunding: [...document.querySelectorAll<HTMLElement>('[data-component-settings="identity-funding"]')],
    providerCollateral: [...document.querySelectorAll<HTMLElement>('[data-component-settings="provider-collateral"]')],
    platform: [...document.querySelectorAll<HTMLElement>('[data-component-settings="platform"]')],
    identity: [...document.querySelectorAll<HTMLElement>('[data-component-settings="identity"]')],
  };

  function setComponentSettings(): void {
    const coinId = coinInput?.value ?? profileCoinId ?? 'dash';
    if (sourceMode === 'public') return;
    const dash = coinId === 'dash';
    const customPath = coinAdapters.get(coinId)?.customPath;
    for (const element of dashCoverage) element.hidden = !dash;
    genericCoinScanNote.hidden = dash;
    customPathOptions.hidden = customPath === undefined;
    customPathField.hidden = customPath === undefined || !scanCustomPathInput.checked;
    for (const input of [customPathTemplateInput, customPathFormatInput, customPathCountInput]) {
      input.disabled = customPath === undefined || !scanCustomPathInput.checked;
    }
    if (customPath !== undefined) {
      customPathDescription.textContent = customPath.description;
      customPathTemplateInput.placeholder = customPath.placeholder;
      const selectedFormat = customPathFormatInput.value;
      customPathFormatInput.replaceChildren(...customPath.formats.map((format) => {
        const option = document.createElement('option');
        option.value = format.id;
        option.textContent = format.label;
        return option;
      }));
      customPathFormatInput.value = customPath.formats.some(({ id }) => id === selectedFormat)
        ? selectedFormat
        : (customPath.formats[0]?.id ?? '');
    }
    if (!__DASH_COMMUNITY__ && !dash) {
      for (const elements of Object.values(componentSettings)) {
        for (const element of elements) element.hidden = true;
      }
      receiveField.hidden = false;
      changeField.hidden = coinId === 'ethereum';
      receiveLabel.textContent = coinId === 'bitcoin' ? 'Receive addresses per Bitcoin family' : 'Ethereum EOA address minimum';
      changeLabel.textContent = 'Change addresses per Bitcoin family';
      scanCoverageDescription.textContent = coinId === 'bitcoin'
        ? 'Scan the standard Bitcoin BIP44, BIP49, BIP84, and BIP86 receive/change families.'
        : 'Scan three common Ethereum externally owned account path profiles.';
      genericCoinScanNote.textContent = coinId === 'bitcoin'
        ? 'Bitcoin discovery includes legacy, nested SegWit, native SegWit, and Taproot, extending every receive/change chain through a 20-address post-use gap.'
        : 'Ethereum discovery checks Standard BIP44, Ledger Live, and Legacy Ledger paths by default, extending each through a 20-address post-use gap. Duplicate addresses are queried and counted once. ERC-20 tokens and contract wallets are outside this scan.';
      networkInput.options[0]!.textContent = 'Mainnet';
      networkInput.options[1]!.textContent = 'Testnet';
      return;
    }
    receiveLabel.textContent = 'Core receive minimum';
    changeLabel.textContent = 'Core change minimum';
    scanCoverageDescription.textContent = 'Select the Dash components and address ranges you want to check.';
    networkInput.options[0]!.textContent = 'Mainnet';
    networkInput.options[1]!.textContent = 'Testnet';
    for (const [component, enabled] of [
      ['core', scanCoreInput.checked],
      ['legacyCore', scanCoreInput.checked && scanLegacyCoreInput.checked],
      ['coinjoin', scanCoreInput.checked && scanCoinJoinInput.checked],
      ['identityFunding', scanPlatformIdentitiesInput.checked && scanIdentityFundingInput.checked],
      ['providerCollateral', scanCoreInput.checked && scanProviderCollateralInput.checked],
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
      for (const field of [...finding.fields.filter(field => finding.history === undefined || !['Lifetime received', 'Lifetime sent', 'Lifetime fees spent', 'First seen', 'Last seen'].includes(field.label)), ...(finding.history ? historyFields(finding.history) : [])]) {
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

  function renderSection(section: RecoverySection, coinLabel = 'Dash'): HTMLElement {
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
        legacyCore: 'No funded legacy mobile Core address was found in this section and scanned range.',
        coinjoin: 'No funded Dash Mobile CoinJoin · DIP9 address was found in this section and scanned range.',
        identityFunding: 'No funded identity funding address was found in this section and scanned range.',
        providerCollateral: 'No funded provider collateral/holdings address was found in this section and scanned range.',
        platform: 'No funded Dash Platform payment address was found in this section and scanned range.',
        identity: 'No funded Dash Platform identity was found in this section and scanned range.',
        shielded: 'No spendable Dash Orchard note was found in this section of the complete pool scan.',
      };
      empty.textContent = section.state === 'complete' ? (coinLabel === 'Dash' ? emptyMessages[section.id] : `No funded ${coinLabel} address was found in this section and scanned range.`) : 'No authoritative findings are available for this section.';
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

  let activeComponentGroup: RecoveryComponentGroupId = 'core';

  function renderComponentTabs(result: RecoveryWalletResult): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-results component-results-tabbed';
    const heading = document.createElement('header');
    heading.className = 'component-results-head';
    const title = document.createElement('h4');
    title.textContent = 'Detailed results by recovery type';
    const note = document.createElement('p');
    note.textContent = 'Select a tab to inspect its balances, derivation paths, activity, and recovery details.';
    heading.append(title, note);
    const tabs = document.createElement('div');
    tabs.className = 'component-result-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Scan components for this result');
    const panel = document.createElement('div');
    panel.className = 'component-result-panel';
    panel.setAttribute('role', 'tabpanel');
    const available = componentGroups.filter((group) => groupSections(result, group).length > 0);
    if (!available.some(({ id }) => id === activeComponentGroup)) activeComponentGroup = available[0]?.id ?? 'core';

    const renderPanel = (): void => {
      const group = available.find(({ id }) => id === activeComponentGroup) ?? available[0];
      panel.replaceChildren();
      if (group === undefined) return;
      panel.id = `component-panel-${result.inputId}-${group.id}`;
      panel.setAttribute('aria-label', group.label);
      panel.append(...groupSections(result, group).map((section) => renderSection(section)));
      for (const button of tabs.querySelectorAll<HTMLButtonElement>('[data-component-group]')) {
        const active = button.dataset.componentGroup === group.id;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      }
    };

    available.forEach((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'component-result-tab';
      button.dataset.componentGroup = group.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `component-panel-${result.inputId}-${group.id}`);
      const name = document.createElement('strong');
      name.textContent = group.label;
      const summary = groupSummary(groupSections(result, group));
      const detail = document.createElement('small');
      detail.className = summary.tone;
      detail.textContent = summary.label;
      button.append(name, detail);
      button.addEventListener('click', () => {
        activeComponentGroup = group.id;
        renderPanel();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const index = available.findIndex(({ id }) => id === activeComponentGroup);
        const next = available[(index + (event.key === 'ArrowRight' ? 1 : available.length - 1)) % available.length];
        if (next === undefined) return;
        activeComponentGroup = next.id;
        renderPanel();
        tabs.querySelector<HTMLButtonElement>(`[data-component-group="${next.id}"]`)?.focus();
      });
      tabs.append(button);
    });
    renderPanel();
    wrapper.append(heading, tabs, panel);
    return wrapper;
  }

  for (const [index, button] of sourceButtons.entries()) {
    const select = (): void => {
      if (coinInput !== null) {
        if (sourceMode === 'seed') seedCoinId = coinInput.value;
        else publicCoinId = coinInput.value;
      }
      sourceMode = button.dataset.sourceMode === 'public' ? 'public' : 'seed';
      if (coinInput !== null) coinInput.value = sourceMode === 'public' ? publicCoinId : seedCoinId;
      view.updateEstimate();
    };
    button.addEventListener('click', select);
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? sourceButtons[0] : event.key === 'End' ? sourceButtons.at(-1) : sourceButtons[(index + 1) % sourceButtons.length];
      if (next?.disabled === false) { next.click(); next.focus(); }
    });
  }
  const view = {
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
      const coinId = coinInput?.value ?? profileCoinId;
      if (coinId === null || coinId.length === 0) throw new Error('Recovery coin registry is empty.');
      return {
        coinId,
        sourceMode,
        watchOnlyKeys: watchOnlyKeys.value,
        watchOnlyMinimumCount: watchOnlyMinimum.value,
        network: networkInput.value,
        account: accountInput.value,
        singleMnemonic: singleMnemonic.value,
        singlePassphrase: singlePassphrase.value,
        batchMnemonics: batchMnemonics.value,
        batchPassphrases: batchPassphrases.value,
        batchConcurrency: batchConcurrencyInput.value,
        requestConcurrency: requestConcurrencyInput.value,
        clearInputOnStart: clearInputOnStart.checked,
        scanCore: coinId === 'dash' ? scanCoreInput.checked : true,
        coreReceiveCount: coreReceiveInput.value,
        coreChangeCount: coreChangeInput.value,
        scanCustomPath: scanCustomPathInput.checked,
        customPathTemplate: customPathTemplateInput.value,
        customPathFormat: customPathFormatInput.value,
        customPathCount: customPathCountInput.value,
        scanLegacyCore: coinId === 'dash' && scanCoreInput.checked && scanLegacyCoreInput.checked,
        legacyCoreCount: legacyCoreCountInput.value,
        scanCoinJoin: coinId === 'dash' && scanCoreInput.checked && scanCoinJoinInput.checked,
        coinJoinExternalCount: coinJoinExternalCountInput.value,
        coinJoinInternalCount: coinJoinInternalCountInput.value,
        scanIdentityFunding: coinId === 'dash' && scanPlatformIdentitiesInput.checked && scanIdentityFundingInput.checked,
        identityFundingCount: identityFundingCountInput.value,
        identityTopUpIdentityCount: identityTopUpIdentityCountInput.value,
        identityTopUpCount: identityTopUpCountInput.value,
        scanProviderCollateral: coinId === 'dash' && scanCoreInput.checked && scanProviderCollateralInput.checked,
        providerCollateralCount: providerCollateralCountInput.value,
        scanPlatformAddresses: coinId === 'dash' && scanPlatformAddressesInput.checked,
        platformAddressCount: platformCountInput.value,
        scanPlatformIdentities: coinId === 'dash' && scanPlatformIdentitiesInput.checked,
        identityStartIndex: identityStartInput.value,
        identityGapLimit: identityGapInput.value,
        identityScanLimit: identityLimitInput.value,
        includeUsedZeroBalance: includeUsedZeroInput.checked,
        scanShieldedPool: coinId === 'dash' && scanShieldedInput.checked,
      };
    },
    setMode(mode: RecoveryInputMode): void {
      seedMode = mode;
      singlePanel.hidden = sourceMode !== 'seed' || mode !== 'single';
      batchPanel.hidden = sourceMode !== 'seed' || mode !== 'batch';
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
      watchOnlyKeys.value = '';
      this.updateEstimate();
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
      const publicInput = sourceMode === 'public';
      if (coinInput !== null) {
        const autoOption = coinInput.querySelector<HTMLOptionElement>('option[value="auto"]');
        if (autoOption !== null) {
          autoOption.hidden = !publicInput;
          autoOption.disabled = !publicInput;
        }
        if (publicInput) publicCoinId = coinInput.value;
        else seedCoinId = coinInput.value;
      }
      setComponentSettings();
      publicPanel.hidden = !publicInput;
      required<HTMLElement>('#seed-source-panel').hidden = publicInput;
      seedModeTabs.hidden = publicInput;
      singlePanel.hidden = publicInput || seedMode !== 'single';
      batchPanel.hidden = publicInput || seedMode !== 'batch';
      revealButton.hidden = publicInput;
      for (const button of sourceButtons) {
        const active = button.dataset.sourceMode === sourceMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      }
      accountInput.parentElement!.hidden = publicInput;
      if (coinInput !== null) coinInput.parentElement!.hidden = false;
      sourceGrid.style.gridTemplateColumns = publicInput ? (coinInput === null ? '1fr' : '1.2fr 1fr') : '';
      seedCoverage.hidden = publicInput;
      for (const input of [singleMnemonic, singlePassphrase, batchMnemonics, batchPassphrases, batchConcurrencyInput, accountInput]) input.disabled = publicInput;
      if (coinInput !== null) coinInput.disabled = false;
      watchOnlyMinimum.parentElement!.hidden = !publicInput;
      watchOnlyDetection.textContent = 'Select a coin, or use Auto-detect for formats that identify exactly one coin.';
      if (publicInput) {
        startButtonLabel.textContent = 'Scan public keys';
        networkInput.options[0]!.textContent = 'Mainnet';
        networkInput.options[1]!.textContent = 'Testnet';
        scanCoverageDescription.textContent = 'Public-key discovery · detected coins and supported address types';
        try {
          assertWatchOnlyBatchInput(watchOnlyKeys.value);
          const selectedCoin = coinInput?.value ?? profileCoinId ?? 'dash';
          const candidateAdapters = selectedCoin === 'auto'
            ? [...coinAdapters.values()]
            : [coinAdapters.get(selectedCoin)!];
          const targets = parseWatchOnlyLines(watchOnlyKeys.value).flatMap((line) => resolveWatchOnlyTargets(line, candidateAdapters));
          const labels = [...new Set(targets.map(({ adapterId, material }) => material.detectionLabel ?? coinAdapters.get(adapterId)!.label))];
          const bip32 = targets.find(({ ambiguity }) => ambiguity?.kind === 'bip32')?.ambiguity;
          const sec1 = targets.some(({ ambiguity }) => ambiguity?.kind === 'sec1');
          const needsCoin = selectedCoin === 'auto' && targets.length > parseWatchOnlyLines(watchOnlyKeys.value).length;
          const formatText = needsCoin
            ? `Coin could not be determined uniquely. Select Coin before scanning. Compatible candidates: ${labels.join(' · ')}.`
            : bip32 !== undefined
            ? `Ambiguous BIP32 xpub${bip32.depth === undefined ? '' : ` (depth ${bip32.depth})`}: coin and hardened purpose are not encoded. Compatible scan candidates: ${labels.join(' · ')}. A used address can identify a matching candidate; an unused key cannot be attributed.`
            : sec1
              ? `Ambiguous SEC1 public key: it contains no coin identifier. Compatible exact-address candidates: ${labels.join(' · ')}.`
              : `${labels.join(' · ')}. Recognized encoded format.`;
          const hasEncodedNetwork = targets.some(({ network }) => network !== undefined);
          const hasSelectedNetwork = targets.some(({ network }) => network === undefined);
          const networkText = hasEncodedNetwork && hasSelectedNetwork
            ? 'The encoded network is used where present; other candidates use the selected network.'
            : hasEncodedNetwork ? 'The network encoded in the key is used.' : 'Using the selected network.';
          watchOnlyDetection.textContent = `${formatText} ${networkText} Only the public-key tab is scanned.`;
          estimate.textContent = needsCoin
            ? 'Select one coin to continue'
            : `${targets.length} coin scan${targets.length === 1 ? '' : 's'} · ${estimateInteger(watchOnlyMinimum.value, 1)} minimum addresses per derived branch; single public keys are checked exactly`;
        } catch (cause) {
          watchOnlyDetection.textContent = cause instanceof Error && cause.name === 'PrivateMaterialError'
            ? 'Private material is not accepted in the public-key field.'
            : cause instanceof Error ? cause.message : 'Public key not recognized.';
          estimate.textContent = 'Check the public key input';
        }
        return;
      }
      coinJoinPathPreview.textContent = coinJoinPathPattern(networkInput.value);
      try {
        const coinId = coinInput?.value ?? profileCoinId ?? 'dash';
        if (!__DASH_COMMUNITY__ && coinId === 'bitcoin') {
          const perFamily = estimateInteger(coreReceiveInput.value, 0) + estimateInteger(coreChangeInput.value, 0);
          estimate.textContent = `Bitcoin · 4 standard address families${scanCustomPathInput.checked ? ' + custom path' : ''} · ${(perFamily * 4).toLocaleString()} standard minimum addresses + 20-address post-use gaps · ${estimateConcurrency(requestConcurrencyInput.value)} network requests at once${includeUsedZeroInput.checked ? ' · zero-balance history enabled' : ''}`;
          startButtonLabel.textContent = 'Scan Bitcoin holdings';
          return;
        }
        if (!__DASH_COMMUNITY__ && coinId === 'ethereum') {
          estimate.textContent = `Ethereum EOA · 3 standard wallet profiles${scanCustomPathInput.checked ? ' + custom path' : ''} · ${estimateInteger(coreReceiveInput.value, 1).toLocaleString()} minimum derivations per profile + 20-address post-use gaps · ${estimateConcurrency(requestConcurrencyInput.value)} network requests at once${includeUsedZeroInput.checked ? ' · used zero-balance accounts enabled' : ''}`;
          startButtonLabel.textContent = 'Scan Ethereum holdings';
          return;
        }
        startButtonLabel.textContent = 'Scan Dash holdings';
        const core = scanCoreInput.checked ? estimateInteger(coreReceiveInput.value, 0) + estimateInteger(coreChangeInput.value, 0) : 0;
        const legacyCore = scanCoreInput.checked && scanLegacyCoreInput.checked ? estimateInteger(legacyCoreCountInput.value, 0) * 2 : 0;
        const coinJoin = scanCoreInput.checked && scanCoinJoinInput.checked
          ? estimateInteger(coinJoinExternalCountInput.value, 0) + estimateInteger(coinJoinInternalCountInput.value, 0)
          : 0;
        const identityFunding = 0;
        const providerCollateral = scanCoreInput.checked && scanProviderCollateralInput.checked ? estimateInteger(providerCollateralCountInput.value, 0) : 0;
        const platform = scanPlatformAddressesInput.checked ? estimateInteger(platformCountInput.value, 0) : 0;
        const coreLike = core + legacyCore + coinJoin + identityFunding + providerCollateral;
        const coreBatches = Math.ceil(coreLike / RECOVERY_CORE_ADDRESS_BATCH);
        const platformBatches = Math.ceil(platform / RECOVERY_PLATFORM_ADDRESS_BATCH);
        const identities = scanPlatformIdentitiesInput.checked ? estimateInteger(identityLimitInput.value, 1) : 0;
        const requests = estimateConcurrency(requestConcurrencyInput.value);
        const totalBatches = coreBatches + platformBatches;
        const optionalFamilies = [
          scanCoreInput.checked && scanLegacyCoreInput.checked,
          scanCoreInput.checked && scanCoinJoinInput.checked,
          scanPlatformIdentitiesInput.checked && scanIdentityFundingInput.checked,
          scanCoreInput.checked && scanProviderCollateralInput.checked,
        ].filter(Boolean).length;
        estimate.textContent = `${scanCoreInput.checked ? 'Dash Core BIP44 selected' : 'Dash Core skipped'}${scanCustomPathInput.checked ? ' · custom path selected' : ''} · ${optionalFamilies} optional coverage item${optionalFamilies === 1 ? '' : 's'} · ${totalBatches.toLocaleString()} minimum address batches${totalBatches > 0 ? ' + gap 20' : ''} · about ${identities.toLocaleString()} identity proof calls per seed phrase · ${requests} network request${requests === 1 ? '' : 's'} at once${includeUsedZeroInput.checked ? ' · zero-balance history enabled' : ''}${scanShieldedInput.checked ? ' · complete Orchard pool' : ''}`;
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
      for (const button of [...modeButtons, ...sourceButtons]) button.disabled = value;
      revealButton.disabled = value;
      if (value) startButtonLabel.textContent = 'Scanning…';
      else if (hasCompletedScan) { this.updateEstimate(); startButtonLabel.textContent = 'Run a new scan'; }
      else this.updateEstimate();
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
        : `Completed ${completed} of ${total} scan${total === 1 ? '' : 's'} · every active stage is shown below.`;
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
        const failed = result.sections.some(({ state }) => state === 'failed' || state === 'partial');
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
        state.textContent = result.sections.some(({ state: sectionState }) => sectionState === 'failed' || sectionState === 'partial')
          ? 'Completed with warnings'
          : 'Scan complete';
        head.append(copy, state);
        wallet.append(head);
        for (const message of result.warnings) {
          const warning = document.createElement('p');
          warning.className = 'section-warning';
          warning.textContent = message;
          wallet.append(warning);
        }
        const overview = document.createElement('section');
        overview.className = 'wallet-overview';
        const overviewTitle = document.createElement('strong');
        overviewTitle.textContent = 'Wallet-wide located balances';
        const overviewNote = document.createElement('p');
        overviewNote.textContent = result.coinId === 'dash'
          ? 'This total includes funded Core addresses, Platform payment addresses, identity credits, and spendable Orchard notes from the completed sections below.'
          : `This total includes the ${result.coinLabel} resources found in the completed scan below.`;
        const overviewMetrics = document.createElement('div');
        overviewMetrics.className = 'section-metrics wallet-overview-metrics';
        overviewMetrics.append(...result.overview.map((metric) => renderMetric(metric.label, metric.value, metric.tone)));
        overview.append(overviewTitle, overviewNote, overviewMetrics);
        wallet.append(overview);
        if (result.coinId === 'dash') {
          wallet.append(renderComponentTabs(result));
        } else {
          const sections = document.createElement('div');
          sections.className = 'component-results single-component-results';
          sections.append(...result.sections.map((section) => renderSection(section, result.coinLabel)));
          wallet.append(sections);
        }
        resultList.append(wallet);
      }
      resultTabs.hidden = results.length < 2;
      resultsSection.hidden = results.length === 0;
      exportCsvButton.disabled = !exportFormats.has('csv');
      exportJsonButton.disabled = !exportFormats.has('json');
    },
    resetResults(): void {
      activeComponentGroup = 'core';
      resultList.replaceChildren();
      resultTabs.replaceChildren();
      walletProgressRoot.replaceChildren();
      resultsSection.hidden = true;
      progressShell.hidden = true;
      exportCsvButton.disabled = true;
      exportJsonButton.disabled = true;
    },
    populateCoins(coins: ReadonlyArray<RecoveryCoinAdapter>): void {
      if (coins.length === 0) throw new Error('Recovery coin registry is empty.');
      for (const coin of coins) coinAdapters.set(coin.id, coin);
      if (coinInput === null) {
        if (coins.length !== 1) throw new Error('A profile without a coin selector must register exactly one recovery coin.');
        profileCoinId = coins[0]?.id ?? null;
        return;
      }
      for (const coin of coins) {
        const option = document.createElement('option');
        option.value = coin.id;
        option.textContent = coin.label;
        coinInput.append(option);
      }
      const auto = document.createElement('option');
      auto.value = 'auto';
      auto.textContent = 'Auto-detect (exact formats only)';
      auto.hidden = true;
      auto.disabled = true;
      coinInput.prepend(auto);
      const defaultCoinId = coins[0]?.id ?? '';
      seedCoinId = defaultCoinId;
      publicCoinId = defaultCoinId;
      coinInput.value = seedCoinId;
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
  return view;
}

export type DiscoveryScannerView = ReturnType<typeof createDiscoveryScannerView>;
