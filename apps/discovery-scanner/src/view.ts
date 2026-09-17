import { installSynchronizedNumberedInputs, requireQueryElement } from '@ckd/ui/dom.js';
import type { BUILD_INFO } from '@ckd/build-info';
import type { RecoveryExportFormat } from './export.js';
import type {
  RecoveryFinding,
  RecoveryCoinAdapter,
  RecoveryInputMode,
  RecoverySourceMode,
  RecoveryProgress,
  RecoverySectionId,
  RecoveryWalletResult,
} from './types.js';
import type { MultiSeedAddressResult } from '@ckd/recovery/multi-seed-search.js';
import type { DiscoveryFeatureRuntime } from './feature-selection.js';
import { createDiscoveryRenderers } from './discovery-renderers.js';
import { createDiscoveryResultsView } from './discovery-results-view.js';
import {
  bitcoinScanEstimate,
  coinJoinPathPattern,
  dashScanEstimate,
  estimateInteger,
  ethereumScanEstimate,
} from './scan-estimate.js';

declare const __DASH_COMMUNITY__: boolean;

export { groupRecoveryResultsByCoin } from './discovery-results-view.js';

type WalletProgressState = 'queued' | 'running' | 'complete' | 'failed';

export interface WalletProgressView {
  label: string;
  state: WalletProgressState;
  stage: string;
  message: string;
  sections: ReadonlyMap<RecoveryProgress['section'], string>;
}

export interface RecoveryInputSnapshot {
  coinId: string;
  automaticCandidates?: boolean;
  candidateCoinIds?: string[];
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
  scanCustomRange: boolean;
  customPathRangeEnd: string;
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
  addressSearchEnabled?: boolean;
  addressSearchTargets?: string;
  addressSearchStart?: string;
  addressSearchCount?: string;
}

const progressSectionLabels: Record<RecoveryProgress['section'], string> = {
  prepare: 'Preparing locally',
  core: 'Dash Core · L1',
  legacyCore: 'Legacy mobile Core',
  coinjoin: 'Dash Mobile CoinJoin · DIP9',
  providerCollateral: 'Masternode holdings',
  platform: 'Platform addresses',
  identity: 'Platform identities',
  shielded: 'Orchard pool',
};

export function createDiscoveryScannerView(
  document: Document,
  buildInfo: typeof BUILD_INFO,
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard,
  features: DiscoveryFeatureRuntime,
) {
  const required = <T extends HTMLElement>(selector: string): T =>
    requireQueryElement<T>(document, selector, 'Recovery UI');
  document.body.dataset.seedDiscovery = String(features.seedDiscovery);
  document.body.dataset.watchOnlyDiscovery = String(features.watchOnlyDiscovery);
  document.body.dataset.walletMatcher = String(features.walletMatcher);
  document.body.dataset.customPaths = String(features.customPaths);
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
  const customRangeInput = required<HTMLInputElement>('#custom-path-range');
  const customRangeEndInput = required<HTMLInputElement>('#custom-path-range-end');
  const customRangeFinish = required<HTMLElement>('#custom-range-finish');
  const customPathLabel = required<HTMLLabelElement>('label[for="custom-path-template"]');
  const customRangeSummary = required<HTMLElement>('#custom-range-summary');
  const pathParts = required<HTMLElement>('#custom-path-parts');
  const pathPurpose = required<HTMLOutputElement>('#custom-part-purpose');
  const pathCoin = required<HTMLOutputElement>('#custom-part-coin');
  const pathAccount = required<HTMLInputElement>('#custom-part-account');
  const pathEndAccount = required<HTMLInputElement>('#custom-part-finish-account');
  const pathBranch = required<HTMLInputElement>('#custom-part-branch');
  let previousDefaultPath: string | undefined;
  let previousDefaultFinish: string | undefined;
  pathAccount.addEventListener('input', () => {
    if (features.editCustomPath === undefined) return;
    customPathTemplateInput.value = features.editCustomPath(
      customPathTemplateInput.value,
      'account',
      pathAccount.value,
    );
  });
  pathEndAccount.addEventListener('input', () => {
    if (features.editCustomPath === undefined) return;
    customRangeEndInput.value = features.editCustomPath(customRangeEndInput.value, 'account', pathEndAccount.value);
  });
  pathBranch.addEventListener('input', () => {
    if (features.editCustomPath === undefined) return;
    customPathTemplateInput.value = features.editCustomPath(customPathTemplateInput.value, 'branch', pathBranch.value);
    customRangeEndInput.value = features.editCustomPath(customRangeEndInput.value, 'branch', pathBranch.value);
  });
  const customPathFormatInput = required<HTMLSelectElement>('#custom-path-format');
  const customPathCountInput = required<HTMLInputElement>('#custom-path-count');
  const customPathDescription = required<HTMLElement>('#custom-path-description');
  const dashCoverage = [...document.querySelectorAll<HTMLElement>('[data-dash-coverage]')];
  const accountInput = required<HTMLInputElement>('#recovery-account');
  const sourceGrid = required<HTMLElement>('.recovery-source-grid');
  let sourceMode: RecoverySourceMode = features.seedDiscovery ? 'seed' : 'public';
  let seedMode: RecoveryInputMode = 'single';
  const sourceButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-source-mode]')];
  for (const button of sourceButtons) {
    const mode = button.dataset.sourceMode;
    button.hidden = (mode === 'seed' && !features.seedDiscovery) || (mode === 'public' && !features.watchOnlyDiscovery);
  }
  const publicPanel = required<HTMLElement>('#public-input');
  const seedElement = <T extends HTMLElement>(selector: string, tag: keyof HTMLElementTagNameMap): T => {
    if (features.seedDiscovery) return required<T>(selector);
    return document.createElement(tag) as T;
  };
  const wrappedSeedInput = (selector: string, wrapperClass: string): HTMLInputElement => {
    if (features.seedDiscovery) return required<HTMLInputElement>(selector);
    const wrapper = document.createElement('div');
    wrapper.className = wrapperClass;
    const input = document.createElement('input');
    wrapper.append(input);
    return input;
  };
  // Watch-only artifacts physically omit the seed controls. Detached inert
  // elements keep the shared public-results view small without weakening the
  // build-time guarantee that BIP39 inputs are absent from the HTML artifact.
  const seedSourcePanel = seedElement<HTMLElement>('#seed-source-panel', 'div');
  const seedModeTabs = seedElement<HTMLElement>('#seed-mode-tabs', 'div');
  const watchOnlyKeys = required<HTMLTextAreaElement>('#watch-only-keys');
  const watchOnlyMinimum = required<HTMLInputElement>('#watch-only-minimum');
  const watchOnlyDetection = required<HTMLElement>('#watch-only-detection');
  const seedCoverage = required<HTMLElement>('#seed-coverage');
  const singlePanel = seedElement<HTMLElement>('#single-input', 'div');
  const batchPanel = seedElement<HTMLElement>('#batch-input', 'div');
  const automaticCandidates = wrappedSeedInput('#automatic-candidates', 'candidate-choice');
  const candidateOptions = seedElement<HTMLElement>('#candidate-options', 'div');
  const candidateCoins = seedElement<HTMLElement>('#candidate-coins', 'div');
  const candidateAll = seedElement<HTMLInputElement>('#candidate-all-coins', 'input');
  const candidateCoinInputs: HTMLInputElement[] = [];
  const candidateMode = (): boolean => sourceMode === 'seed' && automaticCandidates.checked;
  automaticCandidates.closest<HTMLElement>('.candidate-choice')!.hidden = !features.seedDiscovery;
  customPathOptions.dataset.featureEnabled = String(features.customPaths);
  const addressSearchPanel = document.querySelector<HTMLElement>('#address-search-panel');
  if (addressSearchPanel !== null) addressSearchPanel.hidden = !features.walletMatcher;

  const singleMnemonic = seedElement<HTMLTextAreaElement>('#single-mnemonic', 'textarea');
  const singlePassphrase = seedElement<HTMLInputElement>('#single-passphrase', 'input');
  const batchMnemonics = seedElement<HTMLTextAreaElement>('#batch-mnemonics', 'textarea');
  const batchPassphrases = seedElement<HTMLTextAreaElement>('#batch-passphrases', 'textarea');
  if (features.seedDiscovery)
    installSynchronizedNumberedInputs([
      { textarea: batchMnemonics, gutter: required<HTMLElement>('#batch-mnemonic-lines') },
      { textarea: batchPassphrases, gutter: required<HTMLElement>('#batch-passphrase-lines') },
    ]);
  const batchConcurrencyInput = features.seedDiscovery
    ? required<HTMLSelectElement>('#batch-concurrency')
    : (() => {
        const wrapper = document.createElement('div');
        wrapper.className = 'batch-concurrency-row';
        const select = document.createElement('select');
        wrapper.append(select);
        return select;
      })();
  const revealButton = seedElement<HTMLButtonElement>('#reveal-recovery-input', 'button');
  const clearInputOnStart = seedElement<HTMLInputElement>('#clear-input-on-start', 'input');
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
  const addressSearchEnabled = document.querySelector<HTMLInputElement>('#address-search-enabled');
  const addressSearchTargets = document.querySelector<HTMLTextAreaElement>('#address-search-targets');
  const addressSearchStart = document.querySelector<HTMLInputElement>('#address-search-start');
  const addressSearchCount = document.querySelector<HTMLInputElement>('#address-search-count');
  const addressSearchResults = document.querySelector<HTMLElement>('#address-search-results');
  const addressSearchProgress = document.querySelector<HTMLElement>('#address-search-progress');
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
  const exportXlsxButton = required<HTMLButtonElement>('#export-recovery-xlsx');
  const exportCsvButton = required<HTMLButtonElement>('#export-recovery-csv');
  const exportJsonButton = required<HTMLButtonElement>('#export-recovery-json');
  const selfTestBadge = required<HTMLElement>('#recovery-self-test');
  const passportSelfTest = required<HTMLElement>('#recovery-crypto-self-test-status');
  const passportSelfTestDetails = required<HTMLElement>('#recovery-crypto-self-test-details');
  const recoveryRuntime = required<HTMLElement>('#recovery-runtime');
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-input-mode]')];
  const estimateInputs = [
    automaticCandidates,
    watchOnlyKeys,
    watchOnlyMinimum,
    ...(coinInput === null ? [] : [coinInput]),
    scanCustomPathInput,
    customPathTemplateInput,
    customRangeInput,
    customRangeEndInput,
    pathAccount,
    pathEndAccount,
    pathBranch,
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
    ...(addressSearchEnabled === null
      ? []
      : [addressSearchEnabled, addressSearchTargets!, addressSearchStart!, addressSearchCount!]),
  ];
  const componentSettings: Record<
    'core' | 'legacyCore' | 'coinjoin' | 'identityFunding' | 'providerCollateral' | 'platform' | 'identity',
    HTMLElement[]
  > = {
    core: [...document.querySelectorAll<HTMLElement>('[data-component-settings="core"]')],
    legacyCore: [...document.querySelectorAll<HTMLElement>('[data-component-settings="legacy-core"]')],
    coinjoin: [...document.querySelectorAll<HTMLElement>('[data-component-settings="coinjoin"]')],
    identityFunding: [...document.querySelectorAll<HTMLElement>('[data-component-settings="identity-funding"]')],
    providerCollateral: [...document.querySelectorAll<HTMLElement>('[data-component-settings="provider-collateral"]')],
    platform: [...document.querySelectorAll<HTMLElement>('[data-component-settings="platform"]')],
    identity: [...document.querySelectorAll<HTMLElement>('[data-component-settings="identity"]')],
  };

  function setComponentSettings(): void {
    const coinId =
      candidateMode() && candidateCoinInputs.some((input) => input.checked && input.value === 'dash')
        ? 'dash'
        : (coinInput?.value ?? profileCoinId ?? 'dash');
    if (sourceMode === 'public') return;
    const dash = coinId === 'dash';
    const parseCustomRange = features.parseCustomAccountRange;
    const describeSelectedCustomPath = features.describeCustomPath;
    const customPath =
      candidateMode() ||
      !features.customPaths ||
      parseCustomRange === undefined ||
      describeSelectedCustomPath === undefined
        ? undefined
        : coinAdapters.get(coinId)?.customPath;
    for (const element of dashCoverage) element.hidden = !dash;
    genericCoinScanNote.hidden = dash;
    customPathOptions.hidden = customPath === undefined;
    customPathField.hidden = customPath === undefined || !scanCustomPathInput.checked;
    for (const input of [customPathTemplateInput, customPathFormatInput, customPathCountInput]) {
      input.disabled = customPath === undefined || !scanCustomPathInput.checked;
    }
    customRangeInput.disabled = customPath === undefined || !scanCustomPathInput.checked;
    customRangeFinish.hidden = !customRangeInput.checked;
    customRangeEndInput.disabled = customRangeInput.disabled || !customRangeInput.checked;
    customPathField.classList.toggle('range-active', customRangeInput.checked);
    customPathLabel.textContent = customRangeInput.checked ? 'Start path' : 'Custom path template';
    required<HTMLLabelElement>('label[for="custom-part-account"]').textContent = customRangeInput.checked
      ? 'Start account · hardened'
      : 'Account · hardened';
    if (customPath !== undefined) {
      if (parseCustomRange === undefined || describeSelectedCustomPath === undefined) {
        throw new Error('Custom-path UI was enabled without its feature runtime.');
      }
      const defaultPath =
        customPath.defaultTemplate?.(networkInput.value === 'testnet' ? 'testnet' : 'mainnet') ??
        customPath.placeholder;
      if (previousDefaultPath === undefined || customPathTemplateInput.value === previousDefaultPath)
        customPathTemplateInput.value = defaultPath;
      previousDefaultPath = defaultPath;
      const parts = customPathTemplateInput.value.trim().split('/');
      const accountMatch = /^(0|[1-9][0-9]*)'$/u.exec(parts[3] ?? '');
      if (accountMatch !== null && Number(accountMatch[1]) < 2147483647) parts[3] = `${Number(accountMatch[1]) + 1}'`;
      const finish = parts.join('/');
      if (previousDefaultFinish === undefined || customRangeEndInput.value === previousDefaultFinish)
        customRangeEndInput.value = finish;
      previousDefaultFinish = finish;
      customRangeSummary.textContent = '';
      if (customRangeInput.checked) {
        try {
          const range = parseCustomRange(customPathTemplateInput.value, customRangeEndInput.value);
          customRangeSummary.textContent = `Custom accounts ${range.first}–${range.last} (inclusive) · ${range.last - range.first + 1} paths · address minimum + 20 per account, extended after activity. Standard scans run once using the Account setting above.`;
        } catch (cause) {
          customRangeSummary.textContent = cause instanceof Error ? cause.message : 'Check the Start and Finish paths.';
        }
      }
      const description = describeSelectedCustomPath(customPathTemplateInput.value);
      pathParts.hidden = description === null;
      if (description !== null) {
        pathPurpose.value = `${description.purpose}'`;
        pathCoin.value = `${description.coin}'`;
        if (document.activeElement !== pathAccount) pathAccount.value = String(description.account);
        if (document.activeElement !== pathBranch) pathBranch.value = String(description.branch);
        const end = describeSelectedCustomPath(customRangeEndInput.value);
        if (document.activeElement !== pathEndAccount) pathEndAccount.value = end === null ? '' : String(end.account);
      }
      pathEndAccount.parentElement!.hidden = !customRangeInput.checked;
      for (const input of [pathAccount, pathBranch]) input.disabled = customRangeInput.disabled;
      pathEndAccount.disabled = customRangeEndInput.disabled;
      customPathDescription.textContent = customPath.description;
      customPathTemplateInput.placeholder = customPath.placeholder;
      const selectedFormat = customPathFormatInput.value;
      customPathFormatInput.replaceChildren(
        ...customPath.formats.map((format) => {
          const option = document.createElement('option');
          option.value = format.id;
          option.textContent = format.label;
          return option;
        }),
      );
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
      receiveLabel.textContent =
        coinId === 'bitcoin' ? 'Receive addresses per Bitcoin family' : 'Ethereum EOA address minimum';
      changeLabel.textContent = 'Change addresses per Bitcoin family';
      scanCoverageDescription.textContent =
        coinId === 'bitcoin'
          ? 'Scan the standard Bitcoin BIP44, BIP49, BIP84, and BIP86 receive/change families.'
          : 'Scan three common Ethereum externally owned account path profiles.';
      genericCoinScanNote.textContent =
        coinId === 'bitcoin'
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

  function showError(message: string): void {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  const renderers = createDiscoveryRenderers(document, writeClipboard, showError);
  const { findingCard } = renderers;
  const resultsView = createDiscoveryResultsView({
    document,
    resultList,
    resultTabs,
    resultsSection,
    walletProgressRoot,
    progressShell,
    exportCsvButton,
    exportJsonButton,
    exportXlsxButton,
    coinOrder: () => [...coinAdapters.keys()],
    renderers,
  });

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
      const next =
        event.key === 'Home'
          ? sourceButtons[0]
          : event.key === 'End'
            ? sourceButtons.at(-1)
            : sourceButtons[(index + 1) % sourceButtons.length];
      if (next?.disabled === false) {
        next.click();
        next.focus();
      }
    });
  }
  const view = {
    form,
    startButton,
    cancelButton,
    clearButton,
    revealButton,
    exportCsvButton,
    exportXlsxButton,
    exportJsonButton,
    modeButtons,
    estimateInputs,
    readInputs(): RecoveryInputSnapshot {
      const coinId = coinInput?.value ?? profileCoinId;
      if (coinId === null || coinId.length === 0) throw new Error('Recovery coin registry is empty.');
      return {
        coinId,
        automaticCandidates: candidateMode(),
        candidateCoinIds: candidateCoinInputs.filter((input) => input.checked).map((input) => input.value),
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
        scanCore: coinId === 'dash' || candidateMode() ? scanCoreInput.checked : true,
        coreReceiveCount: coreReceiveInput.value,
        coreChangeCount: coreChangeInput.value,
        scanCustomPath: !candidateMode() && scanCustomPathInput.checked,
        customPathTemplate: customPathTemplateInput.value,
        scanCustomRange: customRangeInput.checked,
        customPathRangeEnd: customRangeEndInput.value,
        customPathFormat: customPathFormatInput.value,
        customPathCount: customPathCountInput.value,
        scanLegacyCore: (coinId === 'dash' || candidateMode()) && scanCoreInput.checked && scanLegacyCoreInput.checked,
        legacyCoreCount: legacyCoreCountInput.value,
        scanCoinJoin: (coinId === 'dash' || candidateMode()) && scanCoreInput.checked && scanCoinJoinInput.checked,
        coinJoinExternalCount: coinJoinExternalCountInput.value,
        coinJoinInternalCount: coinJoinInternalCountInput.value,
        scanIdentityFunding:
          (coinId === 'dash' || candidateMode()) &&
          scanPlatformIdentitiesInput.checked &&
          scanIdentityFundingInput.checked,
        identityFundingCount: identityFundingCountInput.value,
        identityTopUpIdentityCount: identityTopUpIdentityCountInput.value,
        identityTopUpCount: identityTopUpCountInput.value,
        scanProviderCollateral:
          (coinId === 'dash' || candidateMode()) && scanCoreInput.checked && scanProviderCollateralInput.checked,
        providerCollateralCount: providerCollateralCountInput.value,
        scanPlatformAddresses: (coinId === 'dash' || candidateMode()) && scanPlatformAddressesInput.checked,
        platformAddressCount: platformCountInput.value,
        scanPlatformIdentities: (coinId === 'dash' || candidateMode()) && scanPlatformIdentitiesInput.checked,
        identityStartIndex: identityStartInput.value,
        identityGapLimit: identityGapInput.value,
        identityScanLimit: identityLimitInput.value,
        includeUsedZeroBalance: includeUsedZeroInput.checked,
        scanShieldedPool: (coinId === 'dash' || candidateMode()) && scanShieldedInput.checked,
        addressSearchEnabled: addressSearchEnabled?.checked ?? false,
        addressSearchTargets: addressSearchTargets?.value ?? '',
        addressSearchStart: addressSearchStart?.value ?? '',
        addressSearchCount: addressSearchCount?.value ?? '',
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
      candidateOptions.hidden = !candidateMode();
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
      seedSourcePanel.hidden = publicInput;
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
      for (const input of [
        singleMnemonic,
        singlePassphrase,
        batchMnemonics,
        batchPassphrases,
        batchConcurrencyInput,
        accountInput,
      ])
        input.disabled = publicInput;
      if (addressSearchPanel !== null && !__DASH_COMMUNITY__)
        addressSearchPanel.hidden = publicInput || coinInput?.value !== 'bitcoin';
      if (coinInput !== null) {
        coinInput.disabled = candidateMode();
        coinInput.parentElement!.hidden = candidateMode();
      }
      batchConcurrencyInput.closest<HTMLElement>('.batch-concurrency-row')!.hidden = candidateMode();
      requestConcurrencyInput.disabled = false;
      requestConcurrencyInput.parentElement!.hidden = false;
      includeUsedZeroInput.disabled = false;
      includeUsedZeroInput.parentElement!.hidden = false;

      watchOnlyMinimum.parentElement!.hidden = !publicInput;
      watchOnlyDetection.textContent = 'Select a coin, or use Auto-detect for formats that identify exactly one coin.';
      if (publicInput) {
        startButtonLabel.textContent = 'Scan public keys';
        networkInput.options[0]!.textContent = 'Mainnet';
        networkInput.options[1]!.textContent = 'Testnet';
        scanCoverageDescription.textContent = 'Public-key discovery · detected coins and supported address types';
        try {
          const assertWatchOnlyBatchInput = features.assertWatchOnlyBatchInput;
          const parseWatchOnlyLines = features.parseWatchOnlyLines;
          const resolveWatchOnlyTargets = features.resolveWatchOnlyTargets;
          if (
            assertWatchOnlyBatchInput === undefined ||
            parseWatchOnlyLines === undefined ||
            resolveWatchOnlyTargets === undefined
          ) {
            throw new Error('Watch-only UI was enabled without its feature runtime.');
          }
          assertWatchOnlyBatchInput(watchOnlyKeys.value);
          const selectedCoin = coinInput?.value ?? profileCoinId ?? 'dash';
          const candidateAdapters =
            selectedCoin === 'auto' ? [...coinAdapters.values()] : [coinAdapters.get(selectedCoin)!];
          const targets = parseWatchOnlyLines(watchOnlyKeys.value).flatMap((line) =>
            resolveWatchOnlyTargets(line, candidateAdapters),
          );
          const labels = [
            ...new Set(
              targets.map(({ adapterId, material }) => material.detectionLabel ?? coinAdapters.get(adapterId)!.label),
            ),
          ];
          const bip32 = targets.find(({ ambiguity }) => ambiguity?.kind === 'bip32')?.ambiguity;
          const sec1 = targets.some(({ ambiguity }) => ambiguity?.kind === 'sec1');
          const needsCoin = selectedCoin === 'auto' && targets.some(({ ambiguity }) => ambiguity !== undefined);
          const formatText = needsCoin
            ? `Coin could not be determined uniquely. Select Coin before scanning. Compatible candidates: ${labels.join(' · ')}.`
            : bip32 !== undefined
              ? `Ambiguous BIP32 xpub${bip32.depth === undefined ? '' : ` (depth ${bip32.depth})`}: coin and hardened purpose are not encoded. Compatible scan candidates: ${labels.join(' · ')}. A used address can identify a matching candidate; an unused key cannot be attributed.`
              : sec1
                ? `Ambiguous SEC1 public key: it contains no coin identifier. Compatible exact-address candidates: ${labels.join(' · ')}.`
                : `${labels.join(' · ')}. Recognized encoded format.`;
          const hasEncodedNetwork = targets.some(({ network }) => network !== undefined);
          const hasSelectedNetwork = targets.some(({ network }) => network === undefined);
          const networkText =
            hasEncodedNetwork && hasSelectedNetwork
              ? 'The encoded network is used where present; other candidates use the selected network.'
              : hasEncodedNetwork
                ? 'The network encoded in the key is used.'
                : 'Using the selected network.';
          watchOnlyDetection.textContent = `${formatText} ${networkText} Only the public-key tab is scanned.`;
          estimate.textContent = needsCoin
            ? 'Select one coin to continue'
            : `${targets.length} coin scan${targets.length === 1 ? '' : 's'} · ${estimateInteger(watchOnlyMinimum.value, 1)} minimum addresses per derived branch; single public keys are checked exactly`;
        } catch (cause) {
          watchOnlyDetection.textContent =
            cause instanceof Error && cause.name === 'PrivateMaterialError'
              ? 'Private material is not accepted in the public-key field.'
              : cause instanceof Error
                ? cause.message
                : 'Public key not recognized.';
          estimate.textContent = 'Check the public key input';
        }
        return;
      }
      if (candidateMode()) {
        coreReceiveInput.parentElement!.hidden = false;
        coreChangeInput.parentElement!.hidden = false;
        required<HTMLElement>('label[for="core-receive-count"]').textContent = 'Receive addresses per standard family';
        required<HTMLElement>('label[for="core-change-count"]').textContent =
          'Change addresses per standard family (where supported)';
        startButtonLabel.textContent = seedMode === 'single' ? 'Scan selected coins' : 'Check seed candidates';
        const selected = candidateCoinInputs.filter((input) => input.checked);
        estimate.textContent = `${selected.map((input) => coinAdapters.get(input.value)?.label).join(' · ') || 'Select at least one coin'} · one phrase at a time · selected coins in parallel · shared network concurrency${includeUsedZeroInput.checked ? ' · zero-balance history enabled' : ''}`;
        scanCoverageDescription.textContent =
          'Multi-coin scan coverage · supported standard branches and selected components';
        return;
      }
      coinJoinPathPreview.textContent = coinJoinPathPattern(networkInput.value);
      try {
        const coinId = coinInput?.value ?? profileCoinId ?? 'dash';
        if (!__DASH_COMMUNITY__ && coinId === 'bitcoin') {
          estimate.textContent = bitcoinScanEstimate(coreReceiveInput.value, coreChangeInput.value, {
            customPath: scanCustomPathInput.checked,
            customRange: customRangeInput.checked,
            requests: requestConcurrencyInput.value,
            includeUsedZero: includeUsedZeroInput.checked,
          });
          startButtonLabel.textContent = 'Scan Bitcoin holdings';
          return;
        }
        if (!__DASH_COMMUNITY__ && coinId === 'ethereum') {
          estimate.textContent = ethereumScanEstimate(coreReceiveInput.value, {
            customPath: scanCustomPathInput.checked,
            customRange: customRangeInput.checked,
            requests: requestConcurrencyInput.value,
            includeUsedZero: includeUsedZeroInput.checked,
          });
          startButtonLabel.textContent = 'Scan Ethereum holdings';
          return;
        }
        startButtonLabel.textContent = 'Scan Dash holdings';
        estimate.textContent = dashScanEstimate({
          scanCore: scanCoreInput.checked,
          receiveCount: coreReceiveInput.value,
          changeCount: coreChangeInput.value,
          customPath: scanCustomPathInput.checked,
          scanLegacyCore: scanLegacyCoreInput.checked,
          legacyCoreCount: legacyCoreCountInput.value,
          scanCoinJoin: scanCoinJoinInput.checked,
          coinJoinExternalCount: coinJoinExternalCountInput.value,
          coinJoinInternalCount: coinJoinInternalCountInput.value,
          scanIdentityFunding: scanIdentityFundingInput.checked,
          scanProviderCollateral: scanProviderCollateralInput.checked,
          providerCollateralCount: providerCollateralCountInput.value,
          scanPlatformAddresses: scanPlatformAddressesInput.checked,
          platformCount: platformCountInput.value,
          scanPlatformIdentities: scanPlatformIdentitiesInput.checked,
          identityLimit: identityLimitInput.value,
          requestConcurrency: requestConcurrencyInput.value,
          includeUsedZero: includeUsedZeroInput.checked,
          scanShielded: scanShieldedInput.checked,
        });
      } catch {
        estimate.textContent = 'Enter valid scan counts';
      }
    },
    setRunning(value: boolean, selfTestPassed: boolean, hasCompletedScan: boolean): void {
      document.body.classList.toggle('recovery-is-scanning', value);
      startButton.disabled = value || !selfTestPassed;
      cancelButton.disabled = !value;
      clearButton.disabled = value;
      for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input,select,textarea',
      )) {
        input.disabled = value;
      }
      for (const button of [...modeButtons, ...sourceButtons]) button.disabled = value;
      revealButton.disabled = value;
      if (value) startButtonLabel.textContent = 'Scanning…';
      else if (hasCompletedScan) {
        this.updateEstimate();
        startButtonLabel.textContent = 'Run a new scan';
      } else this.updateEstimate();
    },
    renderAddressSearch(results: readonly MultiSeedAddressResult[], completed: number, total: number): void {
      if (addressSearchResults === null || addressSearchProgress === null) return;
      addressSearchResults.replaceChildren();
      addressSearchProgress.textContent = `Completed ${completed} of ${total} target searches.`;
      for (const result of results) {
        const row = document.createElement('article');
        row.className = 'finding-card';
        const title = document.createElement('strong');
        title.textContent = `${result.seedLabel} · ${result.target.input}`;
        const detail = document.createElement('p');
        detail.textContent =
          result.error !== undefined
            ? `Error: ${result.error}`
            : result.match === null
              ? 'No matching derived address in the selected range.'
              : `Match at index ${result.match.index} · ${result.match.path} · ${result.match.address}`;
        row.append(title, detail);
        addressSearchResults.append(row);
      }
      addressSearchResults.hidden = results.length === 0;
    },
    resetAddressSearch(): void {
      if (addressSearchResults === null || addressSearchProgress === null) return;
      addressSearchResults.replaceChildren();
      addressSearchResults.hidden = true;
      addressSearchProgress.textContent = '';
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
        detail.textContent =
          progress.sections.size === 0
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
      progressText.textContent =
        total === 0
          ? 'Preparing…'
          : `Completed ${completed} of ${total} scan${total === 1 ? '' : 's'} · every active stage is shown below.`;
    },
    progressSectionLabel(section: RecoveryProgress['section']): string {
      return progressSectionLabels[section];
    },
    renderLiveFinding(
      inputId: string,
      section: RecoverySectionId,
      finding: RecoveryFinding,
      findingCount: number,
    ): void {
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
        note.textContent =
          'More than 200 live findings: further rows are retained for the final result and export without expanding the live DOM.';
        live.append(note);
      }
    },
    renderResults(
      results: readonly RecoveryWalletResult[],
      selectedCoinId: string | null,
      exportFormats: ReadonlySet<RecoveryExportFormat>,
      selectCoin: (coinId: string) => void,
    ): void {
      resultsView.render(results, selectedCoinId, exportFormats, selectCoin);
    },
    resetResults(): void {
      resultsView.reset();
    },
    populateCoins(coins: ReadonlyArray<RecoveryCoinAdapter>): void {
      if (coins.length === 0) throw new Error('Recovery coin registry is empty.');
      automaticCandidates.closest<HTMLElement>('.candidate-choice')!.hidden =
        features.seedDiscovery === false || coins.length < 2;
      for (const coin of coins) {
        coinAdapters.set(coin.id, coin);
        const label = document.createElement('label');
        label.className = 'candidate-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = coin.id;
        checkbox.checked = coin === coins[0];
        checkbox.addEventListener('change', () => {
          candidateAll.checked = candidateCoinInputs.every((input) => input.checked);
          candidateAll.indeterminate = !candidateAll.checked && candidateCoinInputs.some((input) => input.checked);
          this.updateEstimate();
        });
        label.append(checkbox, document.createTextNode(` ${coin.label}`));
        candidateCoins.append(label);
        candidateCoinInputs.push(checkbox);
      }
      candidateAll.checked = coins.length === 1;
      candidateAll.addEventListener('change', () => {
        for (const input of candidateCoinInputs) input.checked = candidateAll.checked;
        this.updateEstimate();
      });
      if (coinInput === null) {
        if (coins.length !== 1)
          throw new Error('A profile without a coin selector must register exactly one recovery coin.');
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
      passportSelfTest.textContent = features.seedDiscovery
        ? 'Cryptographic self-test passed'
        : 'Boundary self-test passed';
      selfTestBadge.textContent = `${checks.length} self-tests passed · ${durationMs} ms`;
      passportSelfTestDetails.textContent = `${checks.length} startup checks passed in ${durationMs.toLocaleString()} ms: ${checks.join(' · ')}. Scanning is enabled.`;
      recoveryRuntime.textContent = features.boundaryDescription;
    },
    showSelfTestFailed(message: string): void {
      selfTestBadge.className = 'self-test-badge failed';
      selfTestBadge.textContent = 'Self-test failed · scanning disabled';
      passportSelfTest.className = 'self-test-badge failed';
      passportSelfTest.textContent = features.seedDiscovery
        ? 'Cryptographic self-test failed'
        : 'Boundary self-test failed';
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
      required<HTMLElement>('#recovery-build-footer').textContent =
        `v${buildInfo.version} · ${buildInfo.fingerprint.slice(0, 16)}…`;
    },
  };
  return view;
}

export type DiscoveryScannerView = ReturnType<typeof createDiscoveryScannerView>;
