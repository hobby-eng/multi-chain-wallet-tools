import { coreImportCommand } from './descriptor-export.js';
import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode, ResultField } from '@ckd/core/types.js';
import {
  displayedFields,
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
  type ExportAction,
  type ExportFormat,
} from '@ckd/export/formatter.js';
import {
  configureControls,
  populateCoinSelect,
  readControls,
  updatePathPreview,
  type CoinMetadataRegistry,
  type DerivationControlValues,
  type DerivationControls,
} from './inputs.js';
import {
  createBranchResultState,
  planResultBranches,
  type BranchResultState,
  type ResultBranch,
} from './result-branches.js';
import { clearDerivationResult } from './secrets.js';
import { renderResults, updateSecretVisibility } from './results.js';
import { invertSelection, selectAll, selectNone } from './selection.js';
import { DerivationCancelledError, DerivationWorkerClient } from '../workers/derive-client.js';
import type { MessageSigningFormat } from '../workers/protocol.js';

declare const __DASH_COMMUNITY__: boolean;
import type { KeyDerivationView } from './view.js';
import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import { entropyToEnglishMnemonic } from '@ckd/core/bip39.js';

const BASIC_WINDOW_SIZE = 200;
const ADVANCED_WINDOW_SIZE = 24;
const LARGE_REQUEST_CONFIRM_THRESHOLD = 10_000;
// The download path streams row-sized chunks, but the clipboard needs one
// contiguous string. Refuse past the point where building it would risk the tab
// rather than letting the copy fail as an out-of-memory crash.
const CLIPBOARD_VALUE_LIMIT = 200_000;

interface KeyDerivationDependencies {
  coinFamilies: typeof import('@ckd/coins/registry.js').COIN_FAMILIES;
  getAdapterFamilyId: typeof import('@ckd/coins/registry.js').getAdapterFamilyId;
  getCoinAdapter: typeof import('@ckd/coins/registry.js').getCoinAdapter;
  getDefaultCoinAdapter: typeof import('@ckd/coins/registry.js').getDefaultCoinAdapter;
  buildInfo: typeof import('@ckd/build-info').BUILD_INFO;
  generateMnemonic: typeof import('@ckd/core/bip39.js').generateMnemonic;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  runBip39SelfTest: typeof import('@ckd/bip39-self-test').runBip39SelfTest;
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard;
  downloadBlob: typeof import('@ckd/export/download.js').downloadBlob;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
  createWorker(): DerivationWorkerClient;
}

export function createKeyDerivationController(
  view: KeyDerivationView,
  dependencies: KeyDerivationDependencies,
) {
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
        writeClipboard,
        downloadBlob,
        downloadText,
        createWorker,
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
        copyMnemonicButton,
        copyWatchOnlyButton,
        downloadWatchOnlyButton,
        descriptorButtons,
        cancelDerivationButton,
        expectedAddress,
        searchStart,
        searchCount,
        searchAddressButton,
        messageSignerDialog,
        messageSignerMessage,
        signMessageButton,
        closeMessageSignerButton,
        messageSignatureOutput,
        copyMessageSignature,
        generate12Button,
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
let sensitiveValuesRevealed = false;
let derivationRevision = 0;
let derivationsInFlight = 0;
let cancellationRequested = false;
let resultWindowStart = 0;
let activeDerivationWorker: DerivationWorkerClient | null = null;
let activeMessageSigningWorker: DerivationWorkerClient | null = null;
let messageSigningRevision = 0;
let activeMessageSigning: {
  index: number;
  address: string;
  path: string;
  source: 'main' | 'bip85';
  resultId: string;
  resultBranch: ResultBranch;
} | null = null;
const encryptedBip38ByBranch = new Map<ResultBranch, Map<number, string>>();
const visibleBip38RowsByBranch = new Map<ResultBranch, number>();
let bulkBip38Revision = 0;
let activeBulkBip38Worker: DerivationWorkerClient | null = null;
let derivedBip85Mnemonic: string | null = null;
let bip85SecretRevealed = false;
let activeFeatureTab: 'silent-payment' | 'bip85' | 'coinjoin' | null = null;
let pendingBip85Refresh: number | null = null;
let pendingSilentPaymentRefresh: number | null = null;
let bip85ChildPassphraseRevealed = false;
let pendingBip85WalletRefresh: number | null = null;
let cryptoReady = false;
let pendingLargeRequestFingerprint: string | null = null;
let pendingAutomaticDerivation: number | null = null;
const lastVariantByCoin = new Map<string, string>();
const settingsByAdapter = new Map<string, DerivationControlValues>();
const includeChangeByCoin = new Map<string, boolean>();
const includeCoinJoinByCoin = new Map<string, boolean>();
interface AddressSearchOperation {
  revision: number;
  worker: DerivationWorkerClient | null;
  seed: Uint8Array | null;
}
let addressSearchRevision = 0;
let activeAddressSearch: AddressSearchOperation | null = null;
/** Remembers which CoinJoin sub-branch was last shown, so re-activating the Dash Mobile CoinJoin · DIP9 tab returns to it. */
let activeCoinJoinBranch: 'coinjoin-external' | 'coinjoin-internal' = 'coinjoin-external';

function optionalElement<T extends Element>(selector: string): T | null {
  return typeof document.querySelector === 'function' ? document.querySelector<T>(selector) : null;
}

const deriveSilentPaymentButton = optionalElement<HTMLButtonElement>('#derive-silent-payment');
const includeSilentPayment = optionalElement<HTMLInputElement>('#include-silent-payment');
const silentPaymentTab = optionalElement<HTMLButtonElement>('#silent-payment-tab');
const silentPaymentPanel = optionalElement<HTMLElement>('#silent-payment-panel');
const includeBip85 = optionalElement<HTMLInputElement>('#include-bip85');
const bip85Tab = optionalElement<HTMLButtonElement>('#bip85-tab');
const bip85Panel = optionalElement<HTMLElement>('#bip85-panel');
const coinJoinTab = optionalElement<HTMLButtonElement>('#coinjoin-tab');
const derivationPanel = optionalElement<HTMLElement>('#derivation-panel');
const mainResults = optionalElement<HTMLElement>('#results');
const bulkBip38Panel = optionalElement<HTMLElement>('#bulk-bip38-panel');
const enableBulkBip38 = optionalElement<HTMLInputElement>('#enable-bulk-bip38');
const bulkBip38Fields = optionalElement<HTMLElement>('#bulk-bip38-fields');
const bulkBip38Passphrase = optionalElement<HTMLInputElement>('#bulk-bip38-passphrase');
const toggleBulkBip38Passphrase = optionalElement<HTMLButtonElement>('#toggle-bulk-bip38-passphrase');
const bulkBip38Status = optionalElement<HTMLElement>('#bulk-bip38-status');
const bulkBip38Error = optionalElement<HTMLElement>('#bulk-bip38-error');
const messageSignerFormatField = optionalElement<HTMLElement>('#message-signer-format-field');
const messageSignerFormatSelect = optionalElement<HTMLSelectElement>('#message-signer-format-select');
const messageSignerFormatOutput = optionalElement<HTMLElement>('#message-signer-format');

function setFeatureTab(next: 'silent-payment' | 'bip85' | 'coinjoin' | null): void {
  activeFeatureTab = next;
  const supplemental = next === 'silent-payment' || next === 'bip85';
  derivationPanel?.classList.toggle('feature-tab-active', supplemental);
  if (silentPaymentPanel !== null) silentPaymentPanel.hidden = next !== 'silent-payment';
  if (bip85Panel !== null) bip85Panel.hidden = next !== 'bip85';
  for (const button of controls.protocolTabs.querySelectorAll<HTMLButtonElement>('.protocol-tab')) {
    const selected = next === null
      ? button.dataset.adapterId === adapter.id
      : button.dataset.featureTab === next;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  if (mainResults !== null) mainResults.hidden = supplemental || currentResult === null;
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
  tab.hidden = !checkbox.checked;
  if (!checkbox.checked && activeFeatureTab === feature) setFeatureTab(null);
}

includeSilentPayment?.addEventListener('change', () => syncFeatureToggle(includeSilentPayment, silentPaymentTab, 'silent-payment'));
includeBip85?.addEventListener('change', () => syncFeatureToggle(includeBip85, bip85Tab, 'bip85'));
controls.includeCoinJoin.addEventListener('change', () => syncFeatureToggle(controls.includeCoinJoin, coinJoinTab, 'coinjoin'));
silentPaymentTab?.addEventListener('click', () => {
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation mode changed to Silent Payments.');
  derivationRevision += 1;
  clearResults();
  setFeatureTab('silent-payment');
  if (mnemonicMayBeComplete()) deriveSilentPaymentButton?.click();
});
bip85Tab?.addEventListener('click', () => {
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation mode changed to BIP85.');
  derivationRevision += 1;
  clearResults();
  setFeatureTab('bip85');
  if (mnemonicMayBeComplete()) deriveBip85Button?.click();
});
coinJoinTab?.addEventListener('click', () => {
  if (adapter.coinJoin === undefined) return;
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation mode changed to Dash Mobile CoinJoin.');
  invalidateAddressSearch();
  derivationRevision += 1;
  clearResults();
  pendingLargeRequestFingerprint = null;
  view.resetDeriveAction();
  setFeatureTab('coinjoin');
  if (mnemonicMayBeComplete()) void deriveCurrent(true);
});
function parseSilentPaymentLabels(raw: string): number[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  const labels = trimmed.split(',').map((part) => part.trim()).filter((part) => part !== '').map((part) => {
    const label = Number(part);
    if (!Number.isSafeInteger(label) || label < 1 || label > 0xffffffff) {
      throw new Error(`"${part}" is not a valid label. Use whole numbers from 1 to 4294967295, separated by commas.`);
    }
    return label;
  });
  return [...new Set(labels)].sort((left, right) => left - right);
}

function scheduleSilentPaymentRefresh(): void {
  const result = optionalElement<HTMLElement>('#silent-payment-result');
  if (result === null || result.hidden || deriveSilentPaymentButton === null) return;
  if (pendingSilentPaymentRefresh !== null) window.clearTimeout(pendingSilentPaymentRefresh);
  pendingSilentPaymentRefresh = window.setTimeout(() => {
    pendingSilentPaymentRefresh = null;
    deriveSilentPaymentButton.click();
  }, 300);
}

deriveSilentPaymentButton?.addEventListener('click', () => {
  const network = optionalElement<HTMLSelectElement>('#silent-payment-network');
  const account = optionalElement<HTMLInputElement>('#silent-payment-account');
  const labelsInput = optionalElement<HTMLInputElement>('#silent-payment-labels');
  const result = optionalElement<HTMLElement>('#silent-payment-result');
  const error = optionalElement<HTMLElement>('#silent-payment-error');
  const labeledList = optionalElement<HTMLElement>('#silent-payment-labeled-list');
  if (network === null || account === null || labelsInput === null || result === null || error === null || labeledList === null) return;
  error.hidden = true;
  result.hidden = true;
  let labels: number[];
  try {
    labels = parseSilentPaymentLabels(labelsInput.value);
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    error.hidden = false;
    return;
  }
  deriveSilentPaymentButton.disabled = true;
  void (async () => {
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      worker = createWorker();
      const derived = await worker.deriveSilentPayment(
        seed,
        network.value === 'testnet' ? 'testnet' : 'mainnet',
        Number(account.value),
        labels,
      );
      const assign = (selector: string, value: string): void => {
        const output = optionalElement<HTMLElement>(selector);
        if (output !== null) output.textContent = value;
      };
      assign('#silent-payment-address', derived.address);
      assign('#silent-payment-change-address', derived.changeAddress);
      labeledList.replaceChildren(...derived.labeledAddresses.map(({ label, address }) => {
        const row = document.createElement('div');
        row.className = 'row';
        const rowLabel = document.createElement('span');
        rowLabel.className = 'row-label';
        rowLabel.textContent = `Label ${label}`;
        const value = document.createElement('code');
        value.className = 'value';
        value.textContent = address;
        row.append(rowLabel, value);
        return row;
      }));
      assign('#silent-payment-scan-path', derived.scanPath);
      assign('#silent-payment-scan-key', derived.scanPublicKey);
      assign('#silent-payment-spend-path', derived.spendPath);
      assign('#silent-payment-spend-key', derived.spendPublicKey);
      result.hidden = false;
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false;
    } finally {
      seed?.fill(0);
      worker?.terminate();
      deriveSilentPaymentButton.disabled = false;
    }
  })();
});

optionalElement<HTMLSelectElement>('#silent-payment-network')?.addEventListener('change', scheduleSilentPaymentRefresh);
optionalElement<HTMLInputElement>('#silent-payment-account')?.addEventListener('input', scheduleSilentPaymentRefresh);
optionalElement<HTMLInputElement>('#silent-payment-labels')?.addEventListener('input', scheduleSilentPaymentRefresh);

const bip85Application = optionalElement<HTMLSelectElement>('#bip85-application');
const bip85WordsField = optionalElement<HTMLElement>('#bip85-words-field');
const bip85BytesField = optionalElement<HTMLElement>('#bip85-bytes-field');
const bip85WifField = optionalElement<HTMLElement>('#bip85-wif-field');
const deriveBip85Button = optionalElement<HTMLButtonElement>('#derive-bip85');
const openBip85WalletButton = optionalElement<HTMLButtonElement>('#open-bip85-wallet');
const toggleBip85SecretButton = optionalElement<HTMLButtonElement>('#toggle-bip85-secret');
const toggleBip85ChildPassphraseButton = optionalElement<HTMLButtonElement>('#toggle-bip85-child-passphrase');
const bip85WalletWorkspace = optionalElement<HTMLElement>('#bip85-wallet-workspace');
const bip85WalletResults = optionalElement<HTMLElement>('#bip85-wallet-results');
const bip85WalletSummary = optionalElement<HTMLElement>('#bip85-wallet-summary');
const bip85WalletNotices = optionalElement<HTMLElement>('#bip85-wallet-notices');
const bip85WalletList = optionalElement<HTMLElement>('#bip85-wallet-list');
const bip85WalletBranchTabs = optionalElement<HTMLElement>('#bip85-wallet-branch-tabs');
const bip85WalletError = optionalElement<HTMLElement>('#bip85-wallet-error');
const bip85WalletStatus = optionalElement<HTMLElement>('#bip85-wallet-status');
const deriveBip85WalletButton = optionalElement<HTMLButtonElement>('#derive-bip85-wallet');
const bip85WalletBasicButton = optionalElement<HTMLButtonElement>('#bip85-wallet-basic');
const bip85WalletAdvancedButton = optionalElement<HTMLButtonElement>('#bip85-wallet-advanced');
let bip85WalletAdapter: CoinAdapter | null = null;
let bip85WalletControls: DerivationControls | null = null;
let bip85WalletMode: DisplayMode = 'basic';
let bip85WalletWindowStart = 0;
let bip85WalletSelected = new Set<number>();
let bip85WalletActiveBranch: ResultBranch = 'receive';
const bip85WalletBranchResults = new Map<ResultBranch, DerivationResult>();
let bip85WalletRevision = 0;
let activeBip85WalletWorker: DerivationWorkerClient | null = null;

function createBip85WalletControls(): DerivationControls | null {
  const required = <T extends Element>(selector: string): T | null => optionalElement<T>(selector);
  const nested = {
    coin: required<HTMLSelectElement>('#bip85-wallet-coin'),
    protocolTabs: required<HTMLElement>('#bip85-wallet-tabs'),
    legacyMobileField: required<HTMLElement>('#bip85-wallet-legacy-field'),
    includeLegacyMobile: required<HTMLInputElement>('#bip85-wallet-legacy-toggle'),
    network: required<HTMLSelectElement>('#bip85-wallet-network'),
    networkField: required<HTMLElement>('#bip85-wallet-network-field'),
    accountField: required<HTMLElement>('#bip85-wallet-account-field'),
    accountLabel: required<HTMLLabelElement>('#bip85-wallet-account-label'),
    account: required<HTMLInputElement>('#bip85-wallet-account'),
    branchField: required<HTMLElement>('#bip85-wallet-branch-field'),
    branchLabel: required<HTMLLabelElement>('#bip85-wallet-branch-label'),
    branchInput: required<HTMLInputElement>('#bip85-wallet-branch-input'),
    branchSelect: required<HTMLSelectElement>('#bip85-wallet-branch-select'),
    changeField: required<HTMLElement>('#bip85-wallet-change-field'),
    changeHelp: required<HTMLElement>('#bip85-wallet-change-help'),
    includeChange: required<HTMLInputElement>('#bip85-wallet-include-change'),
    coinJoinField: required<HTMLElement>('#bip85-wallet-coinjoin-field'),
    includeCoinJoin: required<HTMLInputElement>('#bip85-wallet-include-coinjoin'),
    coinJoinHelp: required<HTMLElement>('#bip85-wallet-coinjoin-help'),
    startLabel: required<HTMLLabelElement>('#bip85-wallet-start-label'),
    start: required<HTMLInputElement>('#bip85-wallet-start'),
    countLabel: required<HTMLLabelElement>('#bip85-wallet-count-label'),
    count: required<HTMLInputElement>('#bip85-wallet-count'),
    preview: required<HTMLElement>('#bip85-wallet-path'),
  };
  return Object.values(nested).some((element) => element === null)
    ? null
    : nested as unknown as DerivationControls;
}

const bip85WalletRegistry: CoinMetadataRegistry = {
  COIN_FAMILIES: coinFamilies,
  getAdapterFamilyId,
  getCoinFamily(id: string) {
    const family = coinFamilies.find((candidate) => candidate.id === id);
    if (family === undefined) throw new Error(`Unsupported coin family: ${id}.`);
    return family;
  },
};

function clearBip85WalletResults(): void {
  if (pendingBip85WalletRefresh !== null) window.clearTimeout(pendingBip85WalletRefresh);
  pendingBip85WalletRefresh = null;
  if (activeMessageSigning?.source === 'bip85') {
    invalidateMessageSigning();
    view.closeMessageSigner();
  }
  bip85WalletRevision += 1;
  activeBip85WalletWorker?.terminate(new DerivationCancelledError('Child-wallet derivation superseded.'));
  activeBip85WalletWorker = null;
  for (const result of bip85WalletBranchResults.values()) clearDerivationResult(result);
  bip85WalletBranchResults.clear();
  bip85WalletSelected.clear();
  bip85WalletWindowStart = 0;
  if (bip85WalletResults !== null) bip85WalletResults.hidden = true;
  bip85WalletSummary?.replaceChildren();
  bip85WalletNotices?.replaceChildren();
  bip85WalletList?.replaceChildren();
  bip85WalletBranchTabs?.replaceChildren();
}

function nestedWalletField(
  result: DerivationResult,
  scope: 'summary' | 'row',
  fieldKey: string,
  rowIndex?: number,
): ResultField | undefined {
  if (scope === 'summary') return [...result.basicSummary, ...result.summary].find(({ key }) => key === fieldKey);
  const row = result.rows.find(({ index }) => index === rowIndex);
  return row === undefined ? undefined : displayedFields(row, 'advanced').find(({ key }) => key === fieldKey);
}

function renderBip85Wallet(): void {
  const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
  if (result === undefined || bip85WalletSummary === null || bip85WalletNotices === null || bip85WalletList === null || bip85WalletResults === null) return;
  const signingFormat = messageSigningFormat(result.id);
  renderResults(bip85WalletSummary, bip85WalletList, bip85WalletNotices, result, {
    mode: bip85WalletMode,
    selected: bip85WalletSelected,
    secretsRevealed: sensitiveValuesRevealed,
    windowStart: bip85WalletWindowStart,
    windowSize: bip85WalletMode === 'basic' ? BASIC_WINDOW_SIZE : ADVANCED_WINDOW_SIZE,
    onWindowChange(start) {
      bip85WalletWindowStart = start;
      renderBip85Wallet();
    },
    onSelectionChange(index, isSelected) {
      if (isSelected) bip85WalletSelected.add(index);
      else bip85WalletSelected.delete(index);
    },
    canSignMessages: signingFormat !== null,
    onSignMessage(index, address) {
      openMessageSignerForResult(result, bip85WalletActiveBranch, 'bip85', index, address);
    },
    encryptedBip38: new Map(),
  });
  updateSecretVisibility(bip85WalletResults, sensitiveValuesRevealed);
  bip85WalletResults.hidden = false;
}

function renderBip85WalletBranches(): void {
  if (bip85WalletBranchTabs === null) return;
  const entries = [...bip85WalletBranchResults.keys()];
  bip85WalletBranchTabs.hidden = entries.length < 2;
  bip85WalletBranchTabs.replaceChildren(...entries.map((branch) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `result-branch-tab${branch === bip85WalletActiveBranch ? ' active' : ''}`;
    button.textContent = branch === 'receive'
      ? 'Receive'
      : branch === 'change'
        ? 'Change'
        : branch === 'coinjoin-external'
          ? 'CoinJoin · External'
          : 'CoinJoin · Internal';
    button.addEventListener('click', () => {
      bip85WalletActiveBranch = branch;
      bip85WalletWindowStart = 0;
      renderBip85WalletBranches();
      renderBip85Wallet();
    });
    return button;
  }));
}

function scheduleBip85WalletRefresh(): void {
  if (bip85WalletWorkspace?.hidden !== false || derivedBip85Mnemonic === null) return;
  if (pendingBip85WalletRefresh !== null) window.clearTimeout(pendingBip85WalletRefresh);
  pendingBip85WalletRefresh = window.setTimeout(() => {
    pendingBip85WalletRefresh = null;
    void deriveBip85Wallet();
  }, 300);
}

function configureBip85Wallet(next: CoinAdapter): void {
  if (bip85WalletControls === null) return;
  bip85WalletAdapter = next;
  clearBip85WalletResults();
  configureControls(next, bip85WalletControls, bip85WalletRegistry);
  scheduleBip85WalletRefresh();
}

function initializeBip85Wallet(): void {
  if (bip85WalletControls !== null) return;
  bip85WalletControls = createBip85WalletControls();
  if (bip85WalletControls === null) return;
  populateCoinSelect(bip85WalletControls.coin, bip85WalletRegistry);
  const initialFamily = coinFamilies[0];
  if (initialFamily === undefined) return;
  configureBip85Wallet(getDefaultCoinAdapter(initialFamily.id));
  bip85WalletControls.coin.addEventListener('change', () => {
    if (bip85WalletControls === null) return;
    configureBip85Wallet(getDefaultCoinAdapter(bip85WalletControls.coin.value));
  });
  bip85WalletControls.protocolTabs.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const id = event.target.closest<HTMLButtonElement>('[data-adapter-id]')?.dataset.adapterId;
    if (id !== undefined && id !== bip85WalletAdapter?.id) configureBip85Wallet(getCoinAdapter(id));
  });
  for (const control of [
    bip85WalletControls.network,
    bip85WalletControls.account,
    bip85WalletControls.branchInput,
    bip85WalletControls.branchSelect,
    bip85WalletControls.includeChange,
    bip85WalletControls.includeCoinJoin,
    bip85WalletControls.start,
    bip85WalletControls.count,
  ]) {
    control.addEventListener('input', () => {
      if (bip85WalletAdapter === null || bip85WalletControls === null) return;
      clearBip85WalletResults();
      updatePathPreview(bip85WalletAdapter, bip85WalletControls);
      scheduleBip85WalletRefresh();
    });
  }
}

async function deriveBip85Wallet(): Promise<void> {
  if (derivedBip85Mnemonic === null || bip85WalletAdapter === null || bip85WalletControls === null || deriveBip85WalletButton === null) return;
  const requestedAdapter = bip85WalletAdapter;
  const requestedControls = bip85WalletControls;
  const requestedMnemonic = derivedBip85Mnemonic;
  if (!cryptoReady) {
    if (bip85WalletError !== null) {
      bip85WalletError.textContent = 'Cryptographic self-test has not completed successfully.';
      bip85WalletError.hidden = false;
    }
    return;
  }
  let input: DerivationControlValues;
  try {
    input = readControls(requestedAdapter, requestedControls);
    if (input.count > 200) throw new Error('The embedded child-wallet view is limited to 200 results per branch.');
  } catch (cause) {
    if (bip85WalletError !== null) {
      bip85WalletError.textContent = cause instanceof Error ? cause.message : String(cause);
      bip85WalletError.hidden = false;
    }
    return;
  }
  clearBip85WalletResults();
  const revision = bip85WalletRevision;
  if (bip85WalletError !== null) bip85WalletError.hidden = true;
  if (bip85WalletStatus !== null) {
    bip85WalletStatus.textContent = 'Deriving child wallet results locally…';
    bip85WalletStatus.hidden = false;
  }
  deriveBip85WalletButton.disabled = true;
  let seed: Uint8Array | null = null;
  const worker = createWorker();
  activeBip85WalletWorker = worker;
  try {
    const childPassphrase = optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.value ?? '';
    seed = mnemonicToSeed(requestedMnemonic, childPassphrase);
    const { includeChange, includeCoinJoin, ...baseInput } = input;
    const branches = planResultBranches(requestedAdapter, baseInput.branch, includeChange, includeCoinJoin);
    const nextResults = new Map<ResultBranch, DerivationResult>();
    for (const { kind, branch, workerAdapterId } of branches) {
      const result = await worker.derive(workerAdapterId ?? requestedAdapter.id, {
        ...baseInput,
        branch,
        seed,
      });
      nextResults.set(kind, result);
    }
    if (revision !== bip85WalletRevision) {
      for (const result of nextResults.values()) clearDerivationResult(result);
      return;
    }
    for (const [kind, result] of nextResults) {
      bip85WalletBranchResults.set(kind, result);
      for (const row of result.rows) bip85WalletSelected.add(row.index);
    }
    bip85WalletActiveBranch = branches[0]?.kind ?? 'receive';
    renderBip85WalletBranches();
    renderBip85Wallet();
    if (bip85WalletStatus !== null) {
      bip85WalletStatus.textContent = `Derived ${input.count.toLocaleString()} result${input.count === 1 ? '' : 's'} per selected branch from the child seed.`;
    }
  } catch (cause) {
    if (revision !== bip85WalletRevision) return;
    clearBip85WalletResults();
    if (bip85WalletError !== null) {
      bip85WalletError.textContent = cause instanceof Error ? cause.message : String(cause);
      bip85WalletError.hidden = false;
    }
    if (bip85WalletStatus !== null) bip85WalletStatus.hidden = true;
  } finally {
    seed?.fill(0);
    if (activeBip85WalletWorker === worker) activeBip85WalletWorker = null;
    worker.terminate(new DerivationCancelledError('Child-wallet worker released.'));
    if (activeBip85WalletWorker === null) deriveBip85WalletButton.disabled = false;
  }
}

deriveBip85WalletButton?.addEventListener('click', () => void deriveBip85Wallet());
bip85WalletBasicButton?.addEventListener('click', () => {
  bip85WalletMode = 'basic';
  bip85WalletBasicButton?.classList.add('active');
  bip85WalletAdvancedButton?.classList.remove('active');
  bip85WalletWindowStart = 0;
  renderBip85Wallet();
});
bip85WalletAdvancedButton?.addEventListener('click', () => {
  bip85WalletMode = 'advanced';
  bip85WalletAdvancedButton?.classList.add('active');
  bip85WalletBasicButton?.classList.remove('active');
  bip85WalletWindowStart = 0;
  renderBip85Wallet();
});
bip85WalletResults?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('[data-copy-field]');
  const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
  if (button === null || result === undefined) return;
  event.stopPropagation();
  const scope = button.dataset.copyScope;
  const fieldKey = button.dataset.copyField;
  if ((scope !== 'summary' && scope !== 'row') || fieldKey === undefined) return;
  const rowIndex = button.dataset.copyRow === undefined ? undefined : Number(button.dataset.copyRow);
  const field = nestedWalletField(result, scope, fieldKey, rowIndex);
  if (field !== undefined) void copyText(button, field.value, field.secret);
}, true);

function setBip85SecretVisibility(revealed: boolean): void {
  bip85SecretRevealed = revealed;
  const result = optionalElement<HTMLElement>('#bip85-result');
  const output = optionalElement<HTMLTextAreaElement>('#bip85-output');
  result?.classList.toggle('revealed', revealed);
  output?.classList.toggle('concealed', !revealed);
  if (toggleBip85SecretButton !== null) {
    toggleBip85SecretButton.textContent = revealed ? 'Hide' : 'Reveal';
    toggleBip85SecretButton.setAttribute('aria-pressed', String(revealed));
  }
}

toggleBip85SecretButton?.addEventListener('click', () => setBip85SecretVisibility(!bip85SecretRevealed));

function setBip85ChildPassphraseVisibility(revealed: boolean): void {
  bip85ChildPassphraseRevealed = revealed;
  const input = optionalElement<HTMLInputElement>('#bip85-child-passphrase');
  if (input !== null) input.type = revealed ? 'text' : 'password';
  if (toggleBip85ChildPassphraseButton !== null) {
    toggleBip85ChildPassphraseButton.textContent = revealed ? 'Hide' : 'Show';
    toggleBip85ChildPassphraseButton.setAttribute('aria-pressed', String(revealed));
  }
}

toggleBip85ChildPassphraseButton?.addEventListener('click', () => setBip85ChildPassphraseVisibility(!bip85ChildPassphraseRevealed));

function syncBip85Controls(): void {
  const application = bip85Application?.value;
  if (bip85WordsField !== null) bip85WordsField.hidden = application !== 'bip39';
  if (bip85BytesField !== null) bip85BytesField.hidden = application !== 'hex';
  if (bip85WifField !== null) bip85WifField.hidden = application !== 'wif';
}

bip85Application?.addEventListener('change', () => {
  syncBip85Controls();
  scheduleBip85Refresh();
});
syncBip85Controls();

function scheduleBip85Refresh(): void {
  const result = optionalElement<HTMLElement>('#bip85-result');
  if (result === null || result.hidden || deriveBip85Button === null) return;
  if (pendingBip85Refresh !== null) window.clearTimeout(pendingBip85Refresh);
  pendingBip85Refresh = window.setTimeout(() => {
    pendingBip85Refresh = null;
    deriveBip85Button.click();
  }, 300);
}

deriveBip85Button?.addEventListener('click', () => {
  const index = optionalElement<HTMLInputElement>('#bip85-index');
  const words = optionalElement<HTMLSelectElement>('#bip85-words');
  const bytes = optionalElement<HTMLInputElement>('#bip85-bytes');
  const output = optionalElement<HTMLTextAreaElement>('#bip85-output');
  const path = optionalElement<HTMLElement>('#bip85-path');
  const result = optionalElement<HTMLElement>('#bip85-result');
  const error = optionalElement<HTMLElement>('#bip85-error');
  if (bip85Application === null || index === null || words === null || bytes === null || output === null || path === null || result === null || error === null) return;
  result.hidden = true;
  error.hidden = true;
  deriveBip85Button.disabled = true;
  void (async () => {
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      worker = createWorker();
      const wifEncoding = optionalElement<HTMLSelectElement>('#bip85-wif-encoding')?.value;
      if (wifEncoding !== undefined && wifEncoding !== 'dash-mainnet' && wifEncoding !== 'dash-testnet'
        && (__DASH_COMMUNITY__ || (wifEncoding !== 'bitcoin-mainnet' && wifEncoding !== 'bitcoin-testnet'))) {
        throw new Error('Unsupported BIP85 WIF encoding.');
      }
      const derived = await worker.deriveBip85(seed, {
        application: bip85Application.value as 'bip39' | 'wif' | 'xprv' | 'hex',
        index: Number(index.value),
        words: Number(words.value) as 12 | 15 | 18 | 21 | 24,
        bytes: Number(bytes.value),
        ...(wifEncoding === undefined ? {} : { wifEncoding: wifEncoding as
          | 'bitcoin-mainnet'
          | 'bitcoin-testnet'
          | 'dash-mainnet'
          | 'dash-testnet' }),
      });
      path.textContent = derived.path;
      let displayedValue = derived.value;
      if (derived.kind === 'bip39') {
        const entropy = hexToBytes(derived.value);
        try {
          displayedValue = entropyToEnglishMnemonic(entropy);
        } finally {
          wipe(entropy);
        }
      }
      output.value = displayedValue;
      setBip85SecretVisibility(sensitiveValuesRevealed || bip85SecretRevealed);
      derivedBip85Mnemonic = derived.kind === 'bip39' ? displayedValue : null;
      if (openBip85WalletButton !== null) openBip85WalletButton.hidden = derivedBip85Mnemonic === null;
      if (derivedBip85Mnemonic === null) {
        clearBip85WalletResults();
        if (bip85WalletWorkspace !== null) bip85WalletWorkspace.hidden = true;
        if (openBip85WalletButton !== null) {
          openBip85WalletButton.textContent = 'Show derived wallet';
          openBip85WalletButton.setAttribute('aria-expanded', 'false');
        }
      } else if (bip85WalletWorkspace?.hidden === false) {
        void deriveBip85Wallet();
      }
      result.hidden = false;
    } catch (cause) {
      derivedBip85Mnemonic = null;
      clearBip85WalletResults();
      if (bip85WalletWorkspace !== null) bip85WalletWorkspace.hidden = true;
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false;
    } finally {
      seed?.fill(0);
      worker?.terminate();
      deriveBip85Button.disabled = false;
    }
  })();
});

openBip85WalletButton?.addEventListener('click', () => {
  if (derivedBip85Mnemonic === null) return;
  const showing = bip85WalletWorkspace?.hidden !== false;
  initializeBip85Wallet();
  if (bip85WalletWorkspace !== null) bip85WalletWorkspace.hidden = !showing;
  openBip85WalletButton.textContent = showing ? 'Hide derived wallet' : 'Show derived wallet';
  openBip85WalletButton.setAttribute('aria-expanded', String(showing));
  if (showing && bip85WalletBranchResults.size === 0) scheduleBip85WalletRefresh();
});

for (const selector of ['#bip85-index', '#bip85-words', '#bip85-bytes', '#bip85-wif-encoding']) {
  optionalElement<HTMLInputElement | HTMLSelectElement>(selector)?.addEventListener('input', scheduleBip85Refresh);
}
optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.addEventListener('input', () => {
  scheduleBip85WalletRefresh();
});

function updateWordCount(): void {
  view.updateWordCount(sensitiveValuesRevealed);
}

function mnemonicMayBeComplete(): boolean {
  const count = mnemonic.value.trim() === '' ? 0 : mnemonic.value.trim().split(/\s+/u).length;
  return count === 12 || count === 24;
}

function stopActiveDerivation(message = 'Derivation superseded by a new request.'): void {
  activeDerivationWorker?.terminate(new DerivationCancelledError(message));
  activeDerivationWorker = null;
}

function releaseAddressSearch(search: AddressSearchOperation): void {
  search.worker?.terminate(new DerivationCancelledError('Address-search worker released.'));
  search.worker = null;
  search.seed?.fill(0);
  search.seed = null;
}

function invalidateAddressSearch(): void {
  addressSearchRevision += 1;
  if (activeAddressSearch !== null) {
    releaseAddressSearch(activeAddressSearch);
    activeAddressSearch = null;
    view.setSearchRunning(false);
  }
  view.hideSearchResult();
}

function clearResults(): void {
  if (activeMessageSigning?.source === 'main') {
    invalidateMessageSigning();
    view.closeMessageSigner();
  }
  bulkBip38Revision += 1;
  activeBulkBip38Worker?.terminate(new DerivationCancelledError('BIP38 encryption cancelled because results changed.'));
  activeBulkBip38Worker = null;
  encryptedBip38ByBranch.clear();
  visibleBip38RowsByBranch.clear();
  view.clearResults(currentResult, branchResultStates);
  branchResultStates.clear();
  currentResult = null;
  selected = new Set();
  activeResultBranch = 'receive';
  resultWindowStart = 0;
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
  if (render) {
    renderCurrent();
    if (enableBulkBip38?.checked === true && bulkBip38Passphrase?.value.length !== 0) {
      startBulkBip38Encryption();
    }
  }
}

/** Selecting the top-level Dash Mobile CoinJoin · DIP9 tab restores whichever nested External/Internal branch was last shown. */
function activateCoinJoinTab(render = true): void {
  const remembered = branchResultStates.has(activeCoinJoinBranch)
    ? activeCoinJoinBranch
    : branchResultStates.has('coinjoin-external') ? 'coinjoin-external' : 'coinjoin-internal';
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
  const signingFormat = currentResult === null ? null : messageSigningFormat(currentResult.id);
  const rowLimit = visibleBip38RowsByBranch.get(activeResultBranch);
  const canEncryptBip38 = currentResult !== null && (
    (!__DASH_COMMUNITY__ && currentResult.id === 'bitcoin-legacy')
    || currentResult.id === 'dash-core'
    || currentResult.id === 'dash-legacy-mobile'
    || currentResult.id === 'dash-core-coinjoin'
  );
  if (bulkBip38Panel !== null) bulkBip38Panel.hidden = !canEncryptBip38;
  if (!canEncryptBip38 && enableBulkBip38 !== null) enableBulkBip38.checked = false;
  if (bulkBip38Fields !== null) bulkBip38Fields.hidden = !canEncryptBip38 || enableBulkBip38?.checked !== true;
  return {
    mode: displayMode,
    selected,
    secretsRevealed: sensitiveValuesRevealed,
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
        openMessageSignerForResult(currentResult, activeResultBranch, 'main', index, address);
      }
    },
    encryptedBip38: encryptedBip38ByBranch.get(activeResultBranch) ?? new Map<number, string>(),
    ...(rowLimit === undefined ? {} : { rowLimit }),
  };
}

function messageSigningFormat(resultId: string): MessageSigningFormat | null {
  if (__DASH_COMMUNITY__) {
    return resultId === 'dash-core' || resultId === 'dash-legacy-mobile' || resultId === 'dash-core-coinjoin'
      ? 'dash-compact'
      : null;
  }
  if (resultId === 'bitcoin-legacy') return 'bitcoin-bip322-legacy';
  if (resultId === 'bitcoin-nested-segwit') return 'bitcoin-bip322-nested';
  if (resultId === 'bitcoin-native-segwit') return 'bitcoin-bip322-native';
  if (resultId === 'bitcoin-taproot') return 'bitcoin-bip322-taproot';
  if (resultId === 'dash-core' || resultId === 'dash-legacy-mobile' || resultId === 'dash-core-coinjoin') return 'dash-compact';
  return null;
}

function messageSigningLabel(format: MessageSigningFormat): string {
  if (__DASH_COMMUNITY__) return 'Dash Core compact P2PKH';
  if (format === 'bitcoin-compact') return 'Bitcoin compact P2PKH (BIP137)';
  if (format === 'bitcoin-bip322-legacy') return 'Bitcoin BIP-322 full · P2PKH';
  if (format === 'dash-compact') return 'Dash Core compact P2PKH';
  if (format === 'bitcoin-bip322-nested') return 'Bitcoin BIP-322 full · P2SH-P2WPKH';
  if (format === 'bitcoin-bip322-native') return 'Bitcoin BIP-322 simple · P2WPKH';
  return 'Bitcoin BIP-322 simple · P2TR';
}

function openMessageSignerForResult(
  result: DerivationResult,
  resultBranch: ResultBranch,
  source: 'main' | 'bip85',
  index: number,
  address: string,
): void {
  const signingFormat = messageSigningFormat(result.id);
  const row = result.rows.find((candidate) => candidate.index === index);
  if (row === undefined || signingFormat === null) return;
  invalidateMessageSigning();
  activeMessageSigning = {
    index,
    address,
    path: row.path,
    source,
    resultId: result.id,
    resultBranch,
  };
  const chooseLegacyFormat = !__DASH_COMMUNITY__ && result.id === 'bitcoin-legacy' && messageSignerFormatField !== null;
  if (messageSignerFormatField !== null) messageSignerFormatField.hidden = !chooseLegacyFormat;
  if (!__DASH_COMMUNITY__ && messageSignerFormatSelect !== null) messageSignerFormatSelect.value = 'bitcoin-bip322-legacy';
  view.openMessageSigner(address, row.path, messageSigningLabel(signingFormat));
}

function renderCurrent(): void {
  if (currentResult === null) return;
  view.renderCurrent(
    currentResult,
    currentRenderOptions(),
    branchResultStates,
    activeResultBranch,
    adapter,
    sensitiveValuesRevealed,
  );
}

function updateBulkActions(): void {
  view.updateBulkActions(currentResult, selected, adapter, displayMode, sensitiveValuesRevealed);
}

function sensitiveField(scope: 'summary' | 'row', fieldKey: string, rowIndex?: number): ResultField | undefined {
  if (currentResult === null) return undefined;
  if (scope === 'row' && fieldKey === 'bip38EncryptedKey' && rowIndex !== undefined) {
    const value = encryptedBip38ByBranch.get(activeResultBranch)?.get(rowIndex);
    return value === undefined ? undefined : {
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
  return row === undefined
    ? undefined
    : displayedFields(row, 'advanced').find((field) => field.key === fieldKey);
}

async function copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void> {
  if (containsSecret && !sensitiveValuesRevealed) {
    showError('Reveal private and privacy-sensitive values before copying them.');
    return;
  }
  let temporary = text;
  try {
    await writeClipboard(temporary);
    view.flashCopied(button);
    showStatus(containsSecret ? 'Sensitive values copied. Clear your clipboard when finished.' : 'Copied to clipboard.');
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Clipboard access failed.');
  } finally {
    temporary = '';
  }
}

async function copyBulk(button: HTMLButtonElement, action: ExportAction): Promise<void> {
  if (currentResult === null) return;
  if (selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const format = exportFormat.value as ExportFormat;
  const inspection = inspectSelectedRows(adapter, currentResult, selected, displayMode, action);
  if (inspection.valueCount === 0) {
    showError('That field type does not apply to the selected protocol and display mode.');
    return;
  }
  if (inspection.valueCount > CLIPBOARD_VALUE_LIMIT) {
    showError(
      `That selection holds ${inspection.valueCount.toLocaleString()} values, more than the clipboard can assemble safely. `
      + 'Use Download selected instead: it streams the same rows to a file.',
    );
    return;
  }
  const output = formatSelectedRows(adapter, currentResult, selected, displayMode, action, format);
  await copyText(button, output.text, output.containsSecret);
}

async function downloadSelectedRows(button: HTMLButtonElement, action: ExportAction): Promise<void> {
  if (currentResult === null || selected.size === 0) {
    showError('Select at least one result first.');
    return;
  }
  const format = exportFormat.value as ExportFormat;
  const inspection = inspectSelectedRows(adapter, currentResult, selected, displayMode, action);
  if (inspection.valueCount === 0) {
    showError('That field type does not apply to the selected protocol and display mode.');
    return;
  }
  if (inspection.containsSecret && !sensitiveValuesRevealed) {
    showError('Reveal private and privacy-sensitive values before exporting them.');
    return;
  }

  view.setDownloadPreparing(button, true);
  try {
    const chunks = iterateSelectedRows(adapter, currentResult, selected, displayMode, action, format);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });
    const mime = format === 'tsv' ? 'text/tab-separated-values' : 'text/plain';
    const blob = await new Response(stream, { headers: { 'Content-Type': `${mime};charset=utf-8` } }).blob();
    const extension = format === 'tsv' ? 'tsv' : 'txt';
    const fileName = `${currentResult.id}-${displayMode}-${inspection.rowCount}-rows.${extension}`;
    downloadBlob(blob, fileName);
    showStatus(`Streamed ${inspection.rowCount.toLocaleString()} selected rows into ${fileName}.`);
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : 'Export download failed.');
  } finally {
    view.setDownloadPreparing(button, false);
    updateBulkActions();
  }
}

function setSensitiveValuesVisibility(revealed: boolean): void {
  sensitiveValuesRevealed = revealed;
  view.setSensitiveValuesVisibility(revealed);
  setBip85SecretVisibility(revealed);
  setBip85ChildPassphraseVisibility(revealed);
  optionalElement<HTMLElement>('#silent-payment-result')?.classList.toggle('revealed', revealed);
  if (bip85WalletResults !== null) updateSecretVisibility(bip85WalletResults, revealed);
  updateBulkActions();
}

function cancelAutomaticDerivation(): void {
  if (pendingAutomaticDerivation === null) return;
  window.clearTimeout(pendingAutomaticDerivation);
  pendingAutomaticDerivation = null;
}

function scheduleAutomaticDerivation(): void {
  cancelAutomaticDerivation();
  if (!cryptoReady || !mnemonicMayBeComplete()) return;
  pendingAutomaticDerivation = window.setTimeout(() => {
    pendingAutomaticDerivation = null;
    if (cryptoReady && mnemonicMayBeComplete()) void deriveCurrent(true);
  }, 350);
}

function rememberCurrentSettings(): void {
  try {
    const values = readControls(adapter, controls);
    settingsByAdapter.set(adapter.id, values);
    if (adapter.addressBranches !== undefined) {
      includeChangeByCoin.set(getAdapterFamilyId(adapter), values.includeChange);
    }
    if (adapter.coinJoin !== undefined) {
      includeCoinJoinByCoin.set(getAdapterFamilyId(adapter), values.includeCoinJoin);
    }
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
  pendingLargeRequestFingerprint = null;
  view.resetDeriveAction();
  adapter = next;
  lastVariantByCoin.set(getAdapterFamilyId(adapter), adapter.id);
  const remembered = settingsByAdapter.get(adapter.id);
  const includeChange = adapter.addressBranches === undefined
    ? false
    : includeChangeByCoin.get(getAdapterFamilyId(adapter)) ?? remembered?.includeChange ?? false;
  const includeCoinJoin = adapter.coinJoin === undefined
    ? false
    : includeCoinJoinByCoin.get(getAdapterFamilyId(adapter)) ?? remembered?.includeCoinJoin ?? false;
  view.configureControls(adapter, remembered === undefined
    ? { ...adapter.defaults, includeChange, includeCoinJoin }
    : { ...remembered, includeChange, includeCoinJoin });
  syncFeatureToggle(controls.includeCoinJoin, coinJoinTab, 'coinjoin');
  clearMessages();
  view.hideSearchResult();
  if (autoDerive && mnemonicMayBeComplete()) void deriveCurrent(true);
}

view.populateCoinSelect();
const initialCoinFamily = coinFamilies[0]!;
adapter = getDefaultCoinAdapter(initialCoinFamily.id);
lastVariantByCoin.set(initialCoinFamily.id, adapter.id);
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
}

async function initializeCryptoRuntime(): Promise<void> {
  setCryptoControlsEnabled(false);
  const worker = createWorker();
  try {
    const bip39Report = runBip39SelfTest();
    const workerReport = await worker.selfTest();
    const checks = [...bip39Report.checks, ...workerReport.checks];
    const durationMs = bip39Report.durationMs + workerReport.durationMs;
    cryptoReady = bip39Report.passed && workerReport.passed;
    view.showCryptoSelfTestPassed(checks, durationMs);
    setCryptoControlsEnabled(true);
    scheduleAutomaticDerivation();
  } catch (cause) {
    cryptoReady = false;
    view.showCryptoSelfTestFailed(cause);
    setCryptoControlsEnabled(false);
    showError('Cryptographic self-test failed. This build will not derive wallet keys.');
  } finally {
    worker.terminate(new DerivationCancelledError('Startup self-test worker released.'));
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

function largeRequestFingerprint(input: DerivationControlValues): string {
  return [adapter.id, activeFeatureTab, input.network, input.account, input.branch, input.start, input.count, input.includeChange, input.includeCoinJoin].join(':');
}

function plannedMainResultBranches(input: DerivationControlValues) {
  if (activeFeatureTab === 'coinjoin' && adapter.coinJoin !== undefined) {
    return planResultBranches(adapter, input.branch, false, true)
      .filter(({ kind }) => kind === 'coinjoin-external' || kind === 'coinjoin-internal');
  }
  return planResultBranches(adapter, input.branch, input.includeChange, false);
}

function approximateMemoryRange(count: number): string {
  const lowMiB = Math.ceil((count * 4) / 1024);
  const highMiB = Math.ceil((count * 12) / 1024);
  return `roughly ${lowMiB.toLocaleString()}–${highMiB.toLocaleString()} MiB of result memory`;
}

function authorizeRequestedCount(input: DerivationControlValues, automatic: boolean): boolean {
  if (automatic && input.count > 20) {
    pendingLargeRequestFingerprint = null;
    showStatus(`Automatic generation was skipped because this tab remembers ${input.count.toLocaleString()} results. Click Derive manually to run the large request.`);
    return false;
  }
  const branchCount = plannedMainResultBranches(input).length;
  const totalCount = input.count * branchCount;
  if (automatic || totalCount < LARGE_REQUEST_CONFIRM_THRESHOLD) {
    pendingLargeRequestFingerprint = null;
    return true;
  }
  const fingerprint = largeRequestFingerprint(input);
  if (pendingLargeRequestFingerprint === fingerprint) {
    pendingLargeRequestFingerprint = null;
    return true;
  }
  pendingLargeRequestFingerprint = fingerprint;
  const batches = Math.ceil(input.count / (adapter.batchSize ?? 50)) * branchCount;
  view.showLargeRequestConfirmation();
  showStatus(
    `Large request confirmation: ${totalCount.toLocaleString()} results across ${branchCount} address branch${branchCount === 1 ? '' : 'es'} in ${batches.toLocaleString()} visible batches; ${approximateMemoryRange(totalCount)}. ` +
    'Keep the tab open and click “Confirm large request” to proceed. You can cancel at any time.',
  );
  return false;
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
  if (!authorizeRequestedCount(input, automatic)) return;
  clearMessages();
  clearResults();
  cancellationRequested = false;
  view.showDerivationRunning();
  derivationsInFlight += 1;
  const revision = ++derivationRevision;
  const requestedAdapter = adapter;
  const requestedFeatureTab = activeFeatureTab;
  const derivationLabel = requestedFeatureTab === 'coinjoin'
    ? 'Dash Mobile CoinJoin · DIP9'
    : requestedAdapter.variantLabel;
  let seed: Uint8Array | null = null;
  const worker = createWorker();
  activeDerivationWorker = worker;
  try {
    settingsByAdapter.set(adapter.id, input);
    seed = mnemonicToSeed(mnemonic.value, passphrase.value);
    const baseInput = {
      network: input.network,
      account: input.account,
      branch: input.branch,
      start: input.start,
      count: input.count,
    };
    const resultBranches = plannedMainResultBranches(input);
    const totalRequested = input.count * resultBranches.length;
    const batchSize = requestedAdapter.batchSize ?? 50;
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new Error(`Adapter ${requestedAdapter.id} declares an invalid internal batch size.`);
    }
    if (totalRequested > 1000) {
      showStatus(`Large request: ${totalRequested.toLocaleString()} results will be generated and displayed in batches. Keep this tab open; you can cancel immediately.`);
    }
    let generatedTotal = 0;
    branchLoop: for (const { kind: resultBranch, branch, workerAdapterId } of resultBranches) {
      let destination: DerivationResult | null = null;
      let generated = 0;
      while (generated < input.count) {
        if (revision !== derivationRevision || requestedAdapter !== adapter) return;
        if (cancellationRequested) break branchLoop;
        const count = Math.min(batchSize, input.count - generated);
        const batch = await worker.derive(workerAdapterId ?? requestedAdapter.id, {
          ...baseInput,
          branch,
          seed,
          start: input.start + generated,
          count,
        });
        if (revision !== derivationRevision || requestedAdapter !== adapter) {
          clearDerivationResult(batch);
          return;
        }
        if (destination === null) {
          destination = batch;
          const state = createBranchResultState(destination);
          branchResultStates.set(resultBranch, state);
          view.showResults();
          if (activeFeatureTab !== null && activeFeatureTab !== 'coinjoin' && mainResults !== null) mainResults.hidden = true;
          if (currentResult === null) activateResultBranch(resultBranch, false);
          updateResultBranchTabs();
          if (activeResultBranch === resultBranch) renderStreamingProgress(true);
        } else {
          if (batch.id !== destination.id || batch.rows.length !== count) {
            clearDerivationResult(batch);
            throw new Error('The derivation adapter returned an inconsistent streamed batch.');
          }
          const appended = batch.rows.splice(0);
          destination.rows.push(...appended);
          const state = branchResultStates.get(resultBranch);
          if (state === undefined) {
            clearDerivationResult(batch);
            throw new Error('The result branch state was lost during streamed derivation.');
          }
          for (const row of appended) state.selected.add(row.index);
          clearDerivationResult(batch);
          if (activeResultBranch === resultBranch) renderStreamingProgress(false);
        }
        generated += count;
        generatedTotal += count;
        const branchProgress = requestedAdapter.addressBranches === undefined
          ? ''
          : ` ${resultBranch} branch ${generated.toLocaleString()} of ${input.count.toLocaleString()};`;
        showStatus(`Derived${branchProgress} ${generatedTotal.toLocaleString()} of ${totalRequested.toLocaleString()} total results for ${derivationLabel}.`);
        if (generated < input.count) await yieldToBrowser();
      }
    }
    if (currentResult !== null) renderStreamingProgress(true);
    updateBulkActions();
    if (cancellationRequested) {
      showStatus(`Generation cancelled after ${generatedTotal.toLocaleString()} of ${totalRequested.toLocaleString()} results. Displayed partial branches remain available.`);
    } else if (automatic) {
      showStatus(`Automatically derived ${generatedTotal.toLocaleString()} results for ${derivationLabel}.`);
    } else {
      showStatus(`Derived ${generatedTotal.toLocaleString()} results for ${derivationLabel}.`);
    }
    if (!cancellationRequested && enableBulkBip38?.checked === true && bulkBip38Passphrase?.value.length !== 0) {
      startBulkBip38Encryption();
    }
    if (!automatic) view.scrollResultsIntoView();
  } catch (cause) {
    if (revision !== derivationRevision) return;
    if (cause instanceof DerivationCancelledError && cancellationRequested) {
      if (branchResultStates.size === 0) clearResults();
      const generated = [...branchResultStates.values()].reduce((sum, state) => sum + state.result.rows.length, 0);
      showStatus(`Generation cancelled after ${generated.toLocaleString()} results. The worker stopped immediately; displayed results remain available.`);
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
  const remembered = lastVariantByCoin.get(controls.coin.value);
  resetForAdapter(remembered === undefined
    ? getDefaultCoinAdapter(controls.coin.value)
    : getCoinAdapter(remembered));
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
    pendingLargeRequestFingerprint = null;
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
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? adapterIds.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + adapterIds.length) % adapterIds.length;
  const id = adapterIds[nextIndex];
  if (id === undefined) return;
  resetForAdapter(getCoinAdapter(id));
  view.focusProtocolButton(id);
});
for (const control of [controls.network, controls.account, controls.branchInput, controls.branchSelect, controls.includeChange, controls.includeCoinJoin, controls.start, controls.count]) {
  control.addEventListener('input', () => {
    stopActiveDerivation();
    invalidateAddressSearch();
    derivationRevision += 1;
    if (currentResult !== null) clearResults();
    updateActivePathPreview();
    rememberCurrentSettings();
    pendingLargeRequestFingerprint = null;
    view.resetDeriveAction();
    scheduleAutomaticDerivation();
  });
}
for (const input of [mnemonic, passphrase]) {
  input.addEventListener('input', () => {
    stopActiveDerivation();
    invalidateAddressSearch();
    derivationRevision += 1;
    if (currentResult !== null) clearResults();
    if (input === mnemonic) updateWordCount();
    pendingLargeRequestFingerprint = null;
    view.resetDeriveAction();
    scheduleAutomaticDerivation();
    scheduleSilentPaymentRefresh();
    scheduleBip85Refresh();
  });
}

for (const input of [expectedAddress, searchStart, searchCount]) {
  input.addEventListener('input', invalidateAddressSearch);
}

toggleSensitiveValues.addEventListener('click', () => setSensitiveValuesVisibility(!sensitiveValuesRevealed));
for (const [words, generateButton] of [[12, generate12Button], [24, generate24Button]] as const) {
  generateButton.addEventListener('click', () => {
    cancelAutomaticDerivation();
    invalidateAddressSearch();
    derivationRevision += 1;
    clearResults();
    clearMessages();
    try {
      view.setGeneratedMnemonic(generateMnemonic(words), adapter.defaults.count);
      rememberCurrentSettings();
      updateWordCount();
      showStatus(`Generated a new ${words}-word BIP39 recovery phrase using crypto.getRandomValues(). Deriving ${adapter.defaults.count} results…`);
      void deriveCurrent(true);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Secure phrase generation failed.');
    }
  });
}

clearAllButton.addEventListener('click', () => {
  cancellationRequested = true;
  cancelAutomaticDerivation();
  stopActiveDerivation('Derivation cleared by the user.');
  invalidateAddressSearch();
  derivationRevision += 1;
  pendingLargeRequestFingerprint = null;
  // Browser strings are immutable, so this only releases DOM references; mutable seed bytes are zeroed separately.
  clearResults();
  activeCoinJoinBranch = 'coinjoin-external';
  settingsByAdapter.clear();
  includeChangeByCoin.clear();
  includeCoinJoinByCoin.clear();
  view.configureControls(adapter);
  setSensitiveValuesVisibility(false);
  clearMessages();
  invalidateMessageSigning();
  if (messageSignerDialog?.open === true) view.closeMessageSigner();
  if (enableBulkBip38 !== null) enableBulkBip38.checked = false;
  if (bulkBip38Fields !== null) bulkBip38Fields.hidden = true;
  if (bulkBip38Passphrase !== null) bulkBip38Passphrase.value = '';
  if (bulkBip38Status !== null) bulkBip38Status.textContent = '';
  derivedBip85Mnemonic = null;
  clearBip85WalletResults();
  if (pendingBip85Refresh !== null) {
    window.clearTimeout(pendingBip85Refresh);
    pendingBip85Refresh = null;
  }
  if (pendingSilentPaymentRefresh !== null) {
    window.clearTimeout(pendingSilentPaymentRefresh);
    pendingSilentPaymentRefresh = null;
  }
  if (pendingBip85WalletRefresh !== null) {
    window.clearTimeout(pendingBip85WalletRefresh);
    pendingBip85WalletRefresh = null;
  }
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
  optionalElement<HTMLElement>('#bip85-result')?.setAttribute('hidden', '');
  optionalElement<HTMLElement>('#bip85-wallet-workspace')?.setAttribute('hidden', '');
  if (openBip85WalletButton !== null) {
    openBip85WalletButton.textContent = 'Show derived wallet';
    openBip85WalletButton.setAttribute('aria-expanded', 'false');
  }
  const bip85Output = optionalElement<HTMLTextAreaElement>('#bip85-output');
  if (bip85Output !== null) bip85Output.value = '';
  const bip85ChildPassphrase = optionalElement<HTMLInputElement>('#bip85-child-passphrase');
  if (bip85ChildPassphrase !== null) bip85ChildPassphrase.value = '';
  setBip85ChildPassphraseVisibility(false);
  setBip85SecretVisibility(false);
  view.clearAllInputs();
  updateWordCount();
});

function concealSensitiveValues(): void {
  if (sensitiveValuesRevealed) setSensitiveValuesVisibility(false);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') concealSensitiveValues();
});
window.addEventListener('blur', concealSensitiveValues);

function invalidateMessageSigning(): void {
  messageSigningRevision += 1;
  activeMessageSigningWorker?.terminate(new DerivationCancelledError('Message-signing request superseded.'));
  activeMessageSigningWorker = null;
  activeMessageSigning = null;
}

if (typeof closeMessageSignerButton?.addEventListener === 'function') {
  closeMessageSignerButton.addEventListener('click', () => {
    invalidateMessageSigning();
    view.closeMessageSigner();
  });
}

if (typeof messageSignerDialog?.addEventListener === 'function') {
  messageSignerDialog.addEventListener('cancel', () => {
    invalidateMessageSigning();
    messageSignerMessage.value = '';
    messageSignatureOutput.value = '';
  });
}

if (typeof signMessageButton?.addEventListener === 'function') signMessageButton.addEventListener('click', () => {
  const context = activeMessageSigning;
  const defaultSigningFormat = context === null ? null : messageSigningFormat(context.resultId);
  const signingFormat = !__DASH_COMMUNITY__ && context?.resultId === 'bitcoin-legacy' && messageSignerFormatSelect !== null
    ? messageSignerFormatSelect.value as MessageSigningFormat
    : defaultSigningFormat;
  if (context === null || signingFormat === null) {
    view.showMessageSignerError('The selected address is no longer available for message signing.');
    return;
  }
  const message = messageSignerMessage.value;
  if (message.length === 0) {
    view.showMessageSignerError('Enter a message to sign.');
    return;
  }
  void (async () => {
    let seed: Uint8Array | null = null;
    activeMessageSigningWorker?.terminate(new DerivationCancelledError('Message-signing request replaced.'));
    const revision = ++messageSigningRevision;
    const worker = createWorker();
    activeMessageSigningWorker = worker;
    view.showMessageSigning(true);
    try {
      const signingAdapter = context.source === 'bip85' ? bip85WalletAdapter : adapter;
      const signingControls = context.source === 'bip85' ? bip85WalletControls : controls;
      if (signingAdapter === null || signingControls === null) {
        throw new Error('The selected wallet is no longer available for message signing.');
      }
      const input = readControls(signingAdapter, signingControls);
      const { includeChange, includeCoinJoin, ...baseInput } = input;
      const plan = planResultBranches(signingAdapter, baseInput.branch, includeChange, includeCoinJoin)
        .find((candidate) => candidate.kind === context.resultBranch);
      if (plan === undefined) throw new Error('The active address branch is no longer available.');
      const signingMnemonic = context.source === 'bip85' ? derivedBip85Mnemonic : mnemonic.value;
      if (signingMnemonic === null) throw new Error('The BIP85 child seed is no longer available.');
      const signingPassphrase = context.source === 'bip85'
        ? optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.value ?? ''
        : passphrase.value;
      seed = mnemonicToSeed(signingMnemonic, signingPassphrase);
      const signed = await worker.signMessage(
        plan.workerAdapterId ?? signingAdapter.id,
        {
          ...baseInput,
          branch: plan.branch,
          start: context.index,
          count: 1,
          seed,
        },
        context.address,
        message,
        signingFormat,
      );
      if (revision !== messageSigningRevision || activeMessageSigning !== context) return;
      if (!signed.verified) throw new Error('Generated signature failed local verification.');
      view.showMessageSignature(signed.signature, signed.format);
    } catch (cause) {
      if (revision !== messageSigningRevision || activeMessageSigning !== context) return;
      view.showMessageSignerError(cause instanceof Error ? cause.message : 'Message signing failed.');
    } finally {
      worker.terminate(new DerivationCancelledError('Message-signing worker released.'));
      seed?.fill(0);
      seed = null;
      if (revision === messageSigningRevision) {
        activeMessageSigningWorker = null;
        view.showMessageSigning(false);
      }
    }
  })();
});

messageSignerFormatSelect?.addEventListener('change', () => {
  if (messageSignerFormatOutput !== null) {
    messageSignerFormatOutput.textContent = messageSigningLabel(messageSignerFormatSelect.value as MessageSigningFormat);
  }
});

if (typeof copyMessageSignature?.addEventListener === 'function') copyMessageSignature.addEventListener('click', () => {
  if (messageSignatureOutput.value.length > 0) {
    void copyText(copyMessageSignature, messageSignatureOutput.value, false);
  }
});

toggleBulkBip38Passphrase?.addEventListener('click', () => {
  if (bulkBip38Passphrase === null || toggleBulkBip38Passphrase === null) return;
  const reveal = bulkBip38Passphrase.type === 'password';
  bulkBip38Passphrase.type = reveal ? 'text' : 'password';
  toggleBulkBip38Passphrase.textContent = reveal ? 'Hide' : 'Show';
  toggleBulkBip38Passphrase.setAttribute('aria-pressed', String(reveal));
});

function startBulkBip38Encryption(): void {
  if (
    currentResult === null
    || bulkBip38Passphrase === null
    || bulkBip38Status === null
    || bulkBip38Error === null
    || enableBulkBip38?.checked !== true
    || bulkBip38Passphrase.disabled
  ) return;
  if (bulkBip38Passphrase.value.length === 0) {
    return;
  }
  const encryptionPassphrase = bulkBip38Passphrase.value;
  const result = currentResult;
  const branch = activeResultBranch;
  const rows = result.rows.flatMap((row) => {
    const address = row.basic.find((field) => field.role === 'paymentAddress')?.value;
    return address === undefined ? [] : [{ index: row.index, address }];
  });
  const revision = ++bulkBip38Revision;
  bulkBip38Error.hidden = true;
  const encryptedKeys = new Map<number, string>();
  encryptedBip38ByBranch.set(branch, encryptedKeys);
  visibleBip38RowsByBranch.set(branch, 0);
  if (activeResultBranch === branch) renderCurrent();
  bulkBip38Passphrase.disabled = true;
  if (enableBulkBip38 !== null) enableBulkBip38.disabled = true;
  void (async () => {
    let seed: Uint8Array | null = null;
    const worker = createWorker();
    activeBulkBip38Worker?.terminate(new DerivationCancelledError('Superseded by a new BIP38 encryption request.'));
    activeBulkBip38Worker = worker;
    try {
      const input = readControls(adapter, controls);
      const { includeChange, includeCoinJoin, ...baseInput } = input;
      const plan = planResultBranches(adapter, baseInput.branch, includeChange, includeCoinJoin)
        .find((candidate) => candidate.kind === branch);
      if (plan === undefined) throw new Error('The active address branch is no longer available.');
      seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      for (const [position, row] of rows.entries()) {
        if (revision !== bulkBip38Revision) return;
        bulkBip38Status.textContent = `Encrypting ${position + 1} of ${rows.length}…`;
        const encrypted = await worker.encryptBip38(
          plan.workerAdapterId ?? adapter.id,
          { ...baseInput, branch: plan.branch, start: row.index, count: 1, seed },
          row.address,
          encryptionPassphrase,
        );
        encryptedKeys.set(row.index, encrypted.encryptedKey);
        visibleBip38RowsByBranch.set(branch, position + 1);
        if (activeResultBranch === branch && currentResult === result) renderCurrent();
      }
      if (revision !== bulkBip38Revision) return;
      bulkBip38Status.textContent = `Encrypted ${encryptedKeys.size} generated private keys. Reveal sensitive values to view or copy them.`;
      if (activeResultBranch === branch && currentResult === result) renderCurrent();
    } catch (cause) {
      if (revision !== bulkBip38Revision) return;
      bulkBip38Error.textContent = cause instanceof Error ? cause.message : 'BIP38 encryption failed.';
      bulkBip38Error.hidden = false;
      bulkBip38Status.textContent = '';
    } finally {
      if (activeBulkBip38Worker === worker) activeBulkBip38Worker = null;
      worker.terminate(new DerivationCancelledError('BIP38 worker released.'));
      seed?.fill(0);
      if (revision === bulkBip38Revision) {
        bulkBip38Passphrase.disabled = false;
        if (enableBulkBip38 !== null) enableBulkBip38.disabled = false;
      }
    }
  })();
}

enableBulkBip38?.addEventListener('change', () => {
  if (bulkBip38Fields !== null) bulkBip38Fields.hidden = !enableBulkBip38.checked;
  if (enableBulkBip38.checked) {
    bulkBip38Passphrase?.focus();
    startBulkBip38Encryption();
    return;
  }
  bulkBip38Revision += 1;
  activeBulkBip38Worker?.terminate(new DerivationCancelledError('BIP38 encryption disabled.'));
  activeBulkBip38Worker = null;
  encryptedBip38ByBranch.delete(activeResultBranch);
  visibleBip38RowsByBranch.delete(activeResultBranch);
  if (bulkBip38Passphrase !== null) {
    bulkBip38Passphrase.disabled = false;
    bulkBip38Passphrase.value = '';
  }
  if (bulkBip38Status !== null) bulkBip38Status.textContent = '';
  if (bulkBip38Error !== null) bulkBip38Error.hidden = true;
  renderCurrent();
});

bulkBip38Passphrase?.addEventListener('change', startBulkBip38Encryption);
bulkBip38Passphrase?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  startBulkBip38Encryption();
});

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

type TopLevelResultTab = 'receive' | 'change' | 'coinjoin';
const topLevelTabButtons: ReadonlyArray<readonly [HTMLButtonElement, TopLevelResultTab]> = [
  [resultReceiveTab, 'receive'],
  [resultChangeTab, 'change'],
  [resultCoinJoinTab, 'coinjoin'],
];

function activateTopLevelTab(tab: TopLevelResultTab): void {
  if (tab === 'coinjoin') activateCoinJoinTab();
  else activateResultBranch(tab);
}

for (const [button, tab] of topLevelTabButtons) {
  button.addEventListener('click', () => activateTopLevelTab(tab));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const visible = topLevelTabButtons.filter(([candidate]) => !candidate.hidden);
    if (visible.length === 0) return;
    const currentIndex = visible.findIndex(([candidate]) => candidate === button);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? visible.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
    const next = visible[nextIndex];
    if (next === undefined || next[0].disabled) return;
    activateTopLevelTab(next[1]);
    next[0].focus();
  });
}

for (const [button, branch] of [
  [resultCoinJoinExternalTab, 'coinjoin-external'],
  [resultCoinJoinInternalTab, 'coinjoin-internal'],
] as const) {
  button.addEventListener('click', () => activateResultBranch(branch));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'coinjoin-external' : 'coinjoin-internal';
    if (!view.resultBranchEnabled(next)) return;
    activateResultBranch(next);
    view.focusResultBranch(next);
  });
}

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
  replaceActiveSelection(invertSelection(currentResult.rows.map((row) => row.index), selected));
  renderCurrent();
});

exportFormat.addEventListener('change', updateBulkActions);

copyMnemonicButton.addEventListener('click', () => {
  if (!sensitiveValuesRevealed || mnemonic.value.trim().length === 0) {
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

for (const [action, button] of Object.entries(descriptorButtons)) {
  button.addEventListener('click', () => {
    const bundle = currentResult?.accountDescriptors;
    if (bundle === undefined) return;
    const privateExport = action === 'privateCopy' || action === 'privateDownload';
    if (privateExport && !sensitiveValuesRevealed) {
      showError('Reveal sensitive values before exporting private descriptors.');
      return;
    }
    const descriptors = privateExport ? bundle.privateText : bundle.publicText;
    const coreFormat = document.querySelector<HTMLSelectElement>('#account-export-format')!.value === 'core';
    let text = descriptors;
    try {
      if (coreFormat) text = coreImportCommand(descriptors);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Unable to prepare account export.');
      return;
    }
    if (action === 'publicDownload' || action === 'privateDownload') {
      const filename = `${bundle.fileStem}.${privateExport ? 'PRIVATE' : 'public'}.${coreFormat ? 'core-import' : 'descriptors'}.txt`;
      downloadText(text, filename, 'text/plain');
      showStatus(privateExport ? `Created ${filename}. Contains unencrypted account private keys.` : `Created ${filename}. Public account data; cannot spend.`);
    } else {
      void copyText(button, text, privateExport);
    }
  });
}

copyWatchOnlyButton.addEventListener('click', () => {
  const watchOnly = currentResult?.watchOnly;
  if (watchOnly === undefined) return;
  void copyText(copyWatchOnlyButton, watchOnly.text, true);
});

downloadWatchOnlyButton.addEventListener('click', () => {
  const watchOnly = currentResult?.watchOnly;
  if (watchOnly === undefined) return;
  if (!sensitiveValuesRevealed) {
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

searchAddressButton.addEventListener('click', () => {
  if (!cryptoReady) {
    showError('Cryptographic self-test has not completed successfully. Address search is blocked.');
    return;
  }
  if (adapter.fieldRoles.addresses.length === 0) return;
  invalidateAddressSearch();
  const search: AddressSearchOperation = { revision: addressSearchRevision, worker: null, seed: null };
  activeAddressSearch = search;
  const requestedAdapter = adapter;
  const address = expectedAddress.value;
  void (async () => {
    clearMessages();
    view.setSearchRunning(true);
    try {
      const input = readControls(requestedAdapter, controls);
      const { includeChange, ...baseInput } = input;
      const start = Number(searchStart.value);
      const count = Number(searchCount.value);
      search.seed = mnemonicToSeed(mnemonic.value, passphrase.value);
      search.worker = createWorker();
      const branches = planResultBranches(requestedAdapter, baseInput.branch, includeChange);
      let match: Awaited<ReturnType<DerivationWorkerClient['search']>> = null;
      let matchedBranch: ResultBranch = 'receive';
      for (const candidate of branches) {
        match = await search.worker.search(
          requestedAdapter.id,
          { seed: search.seed, network: baseInput.network, account: baseInput.account, branch: candidate.branch },
          address,
          start,
          count,
        );
        if (search.revision !== addressSearchRevision) return;
        if (match !== null) {
          matchedBranch = candidate.kind;
          break;
        }
      }
      const scope = branches.length === 2 ? 'receive and change branches' : 'the selected derivation branch';
      const message = match === null
        ? `Not found in indices ${start}…${start + count - 1} across ${scope}.`
        : `Match found in the ${matchedBranch} branch at index ${match.index}: ${match.path}`;
      view.showSearchResult(message, match !== null);
    } catch (cause) {
      if (search.revision !== addressSearchRevision) return;
      showError(cause instanceof Error ? cause.message : 'Address search failed.');
    } finally {
      releaseAddressSearch(search);
      if (activeAddressSearch === search) {
        activeAddressSearch = null;
        view.setSearchRunning(false);
      }
    }
  })();
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
