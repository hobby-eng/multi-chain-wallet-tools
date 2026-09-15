import { coreImportCommand } from './descriptor-export.js';
import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode, ResultField } from '@ckd/core/types.js';
import { displayedFields, inspectSelectedRows, type ExportAction, type ExportFormat } from '@ckd/export/formatter.js';
import {
  configureControls,
  populateCoinSelect,
  readControls,
  updatePathPreview,
  type CoinMetadataRegistry,
  type DerivationControlValues,
  type DerivationControls,
} from './inputs.js';
import { planResultBranches, type ResultBranch } from './result-branches.js';
import { clearDerivationResult } from './secrets.js';
import { renderResults, updateSecretVisibility } from './results.js';
import { invertSelection, selectAll, selectNone } from './selection.js';
import { DerivationCancelledError, type DerivationWorkerClient } from '../workers/derive-client.js';

const BASIC_WINDOW_SIZE = 200;
const ADVANCED_WINDOW_SIZE = 24;

interface ResultExportContext {
  adapter: CoinAdapter;
  result: DerivationResult;
  selected: ReadonlySet<number>;
  mode: DisplayMode;
  format: ExportFormat;
}

interface ChildMessageSigning {
  activeSource(): 'main' | 'bip85' | null;
  close(): void;
  format(resultId: string): import('../workers/protocol.js').MessageSigningFormat | null;
  open(result: DerivationResult, branch: ResultBranch, source: 'bip85', index: number, address: string): void;
}

export interface Bip85ChildWalletOptions {
  document: Document;
  coinFamilies: typeof import('@ckd/coins/registry.js').COIN_FAMILIES;
  getAdapterFamilyId: typeof import('@ckd/coins/registry.js').getAdapterFamilyId;
  getCoinAdapter: typeof import('@ckd/coins/registry.js').getCoinAdapter;
  getDefaultCoinAdapter: typeof import('@ckd/coins/registry.js').getDefaultCoinAdapter;
  mnemonic(): string | null;
  cryptoReady(): boolean;
  secretsRevealed(): boolean;
  setSecretsRevealed(revealed: boolean): void;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  messageSigning?: ChildMessageSigning;
  copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void>;
  copyBulkFrom(button: HTMLButtonElement, action: ExportAction, context: ResultExportContext): Promise<void>;
  downloadRowsFrom(
    button: HTMLButtonElement,
    action: ExportAction,
    context: ResultExportContext,
    onFinished: () => void,
  ): Promise<void>;
  downloadText(text: string, fileName: string, mimeType: string): void;
  showError(message: string): void;
  showStatus(message: string): void;
}

export function installBip85ChildWallet(options: Bip85ChildWalletOptions) {
  const {
    document,
    coinFamilies,
    getAdapterFamilyId,
    getCoinAdapter,
    getDefaultCoinAdapter,
    mnemonicToSeed,
    createWorker,
    messageSigning,
    copyText,
    copyBulkFrom,
    downloadRowsFrom,
    downloadText,
    showError,
    showStatus,
  } = options;
  const optionalElement = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);
  let pendingBip85WalletRefresh: number | null = null;
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
  const bip85WalletToggleSecrets = optionalElement<HTMLButtonElement>('#bip85-wallet-toggle-secrets');
  const bip85WalletSelectedCount = optionalElement<HTMLElement>('#bip85-wallet-selected-count');
  const bip85WalletExportFormat = optionalElement<HTMLSelectElement>('#bip85-wallet-export-format');
  const bip85WalletSelectAll = optionalElement<HTMLButtonElement>('#bip85-wallet-select-all');
  const bip85WalletSelectNone = optionalElement<HTMLButtonElement>('#bip85-wallet-select-none');
  const bip85WalletSelectInvert = optionalElement<HTMLButtonElement>('#bip85-wallet-select-invert');
  const bip85WalletAccountExport = optionalElement<HTMLElement>('#bip85-wallet-account-export');
  const bip85WalletAccountExportDialog = optionalElement<HTMLDialogElement>('#bip85-wallet-account-export-dialog');
  const bip85WalletAccountExportDescription = optionalElement<HTMLElement>('#bip85-wallet-account-export-description');
  const bip85WalletAccountExportFormat = optionalElement<HTMLSelectElement>('#bip85-wallet-account-export-format');
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
    return Object.values(nested).some((element) => element === null) ? null : (nested as unknown as DerivationControls);
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
    if (messageSigning?.activeSource() === 'bip85') {
      messageSigning?.close();
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
    updateBip85WalletActions();
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

  function updateBip85WalletActions(): void {
    const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
    const adapter = bip85WalletAdapter;
    if (bip85WalletSelectedCount !== null) bip85WalletSelectedCount.textContent = String(bip85WalletSelected.size);
    const buttons = bip85WalletResults?.querySelectorAll<HTMLButtonElement>('[data-bip85-bulk],[data-bip85-download]');
    for (const button of buttons ?? []) {
      const action = (button.dataset.bip85Bulk ?? button.dataset.bip85Download) as ExportAction;
      if (result === undefined || adapter === null || bip85WalletSelected.size === 0) {
        button.disabled = true;
        continue;
      }
      const inspection = inspectSelectedRows(adapter, result, bip85WalletSelected, bip85WalletMode, action);
      button.disabled = inspection.valueCount === 0 || (inspection.containsSecret && !options.secretsRevealed());
    }
    if (bip85WalletSelectAll !== null) bip85WalletSelectAll.disabled = result === undefined;
    if (bip85WalletSelectNone !== null)
      bip85WalletSelectNone.disabled = result === undefined || bip85WalletSelected.size === 0;
    if (bip85WalletSelectInvert !== null) bip85WalletSelectInvert.disabled = result === undefined;
    const descriptors = result?.accountDescriptors;
    if (bip85WalletAccountExport !== null) bip85WalletAccountExport.hidden = descriptors === undefined;
    if (descriptors === undefined && bip85WalletAccountExportDialog?.open === true)
      bip85WalletAccountExportDialog.close();
    if (bip85WalletAccountExportDescription !== null)
      bip85WalletAccountExportDescription.textContent =
        descriptors === undefined
          ? ''
          : `${result!.title} · ${result!.networkLabel} · account ${descriptors.accountPath}`;
    for (const button of bip85WalletAccountExportDialog?.querySelectorAll<HTMLButtonElement>(
      '[data-bip85-descriptor]',
    ) ?? []) {
      const privateExport = button.dataset.bip85Descriptor?.startsWith('private') === true;
      button.disabled = descriptors === undefined || (privateExport && !options.secretsRevealed());
    }
  }

  function renderBip85Wallet(): void {
    const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
    if (
      result === undefined ||
      bip85WalletSummary === null ||
      bip85WalletNotices === null ||
      bip85WalletList === null ||
      bip85WalletResults === null
    )
      return;
    const signingFormat = messageSigning?.format(result.id) ?? null;
    renderResults(bip85WalletSummary, bip85WalletList, bip85WalletNotices, result, {
      mode: bip85WalletMode,
      selected: bip85WalletSelected,
      secretsRevealed: options.secretsRevealed(),
      windowStart: bip85WalletWindowStart,
      windowSize: bip85WalletMode === 'basic' ? BASIC_WINDOW_SIZE : ADVANCED_WINDOW_SIZE,
      onWindowChange(start) {
        bip85WalletWindowStart = start;
        renderBip85Wallet();
      },
      onSelectionChange(index, isSelected) {
        if (isSelected) bip85WalletSelected.add(index);
        else bip85WalletSelected.delete(index);
        updateBip85WalletActions();
      },
      canSignMessages: signingFormat !== null,
      onSignMessage(index, address) {
        messageSigning?.open(result, bip85WalletActiveBranch, 'bip85', index, address);
      },
      encryptedBip38: new Map(),
    });
    updateSecretVisibility(bip85WalletResults, options.secretsRevealed());
    bip85WalletResults.hidden = false;
    updateBip85WalletActions();
  }

  function renderBip85WalletBranches(): void {
    if (bip85WalletBranchTabs === null) return;
    const entries = [...bip85WalletBranchResults.keys()];
    bip85WalletBranchTabs.hidden = entries.length < 2;
    bip85WalletBranchTabs.replaceChildren(
      ...entries.map((branch) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `result-branch-tab${branch === bip85WalletActiveBranch ? ' active' : ''}`;
        button.textContent =
          branch === 'receive'
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
      }),
    );
  }

  function scheduleBip85WalletRefresh(): void {
    if (bip85WalletWorkspace?.hidden !== false || options.mnemonic() === null) return;
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
      if (id === undefined) return;
      if (id !== bip85WalletAdapter?.id) configureBip85Wallet(getCoinAdapter(id));
      else scheduleBip85WalletRefresh();
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
      const refresh = (): void => {
        if (bip85WalletAdapter === null || bip85WalletControls === null) return;
        clearBip85WalletResults();
        updatePathPreview(bip85WalletAdapter, bip85WalletControls);
        scheduleBip85WalletRefresh();
      };
      control.addEventListener('input', refresh);
      // Some browsers only emit change for selects and checkboxes. Debouncing keeps
      // the input/change pair to one derivation while covering both event models.
      control.addEventListener('change', refresh);
    }
  }

  async function deriveBip85Wallet(): Promise<void> {
    const requestedMnemonic = options.mnemonic();
    if (
      requestedMnemonic === null ||
      bip85WalletAdapter === null ||
      bip85WalletControls === null ||
      deriveBip85WalletButton === null
    )
      return;
    const requestedAdapter = bip85WalletAdapter;
    const requestedControls = bip85WalletControls;
    if (!options.cryptoReady()) {
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
  bip85WalletResults?.addEventListener(
    'click',
    (event) => {
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
    },
    true,
  );

  function currentBip85ExportContext(): ResultExportContext | null {
    const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
    if (result === undefined || bip85WalletAdapter === null || bip85WalletExportFormat === null) return null;
    return {
      adapter: bip85WalletAdapter,
      result,
      selected: bip85WalletSelected,
      mode: bip85WalletMode,
      format: bip85WalletExportFormat.value as ExportFormat,
    };
  }

  bip85WalletToggleSecrets?.addEventListener('click', () => options.setSecretsRevealed(!options.secretsRevealed()));
  bip85WalletSelectAll?.addEventListener('click', () => {
    const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
    if (result === undefined) return;
    bip85WalletSelected = selectAll(result.rows.map((row) => row.index));
    renderBip85Wallet();
  });
  bip85WalletSelectNone?.addEventListener('click', () => {
    bip85WalletSelected = selectNone();
    renderBip85Wallet();
  });
  bip85WalletSelectInvert?.addEventListener('click', () => {
    const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
    if (result === undefined) return;
    bip85WalletSelected = invertSelection(
      result.rows.map((row) => row.index),
      bip85WalletSelected,
    );
    renderBip85Wallet();
  });
  bip85WalletExportFormat?.addEventListener('change', updateBip85WalletActions);
  bip85WalletResults?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const bulkButton = event.target.closest<HTMLButtonElement>('[data-bip85-bulk]');
    const downloadButton = event.target.closest<HTMLButtonElement>('[data-bip85-download]');
    const context = currentBip85ExportContext();
    if (context === null) return;
    if (bulkButton?.dataset.bip85Bulk !== undefined) {
      void copyBulkFrom(bulkButton, bulkButton.dataset.bip85Bulk as ExportAction, context);
    } else if (downloadButton?.dataset.bip85Download !== undefined) {
      void downloadRowsFrom(
        downloadButton,
        downloadButton.dataset.bip85Download as ExportAction,
        context,
        updateBip85WalletActions,
      );
    }
  });
  optionalElement<HTMLButtonElement>('#bip85-wallet-open-account-export')?.addEventListener('click', () =>
    bip85WalletAccountExportDialog?.showModal(),
  );
  optionalElement<HTMLButtonElement>('#bip85-wallet-close-account-export')?.addEventListener('click', () =>
    bip85WalletAccountExportDialog?.close(),
  );
  for (const button of bip85WalletAccountExportDialog?.querySelectorAll<HTMLButtonElement>('[data-bip85-descriptor]') ??
    []) {
    button.addEventListener('click', () => {
      const result = bip85WalletBranchResults.get(bip85WalletActiveBranch);
      const bundle = result?.accountDescriptors;
      const action = button.dataset.bip85Descriptor;
      if (bundle === undefined || action === undefined) return;
      const privateExport = action.startsWith('private');
      if (privateExport && !options.secretsRevealed()) {
        showError('Reveal private keys before exporting private descriptors.');
        return;
      }
      const coreFormat = bip85WalletAccountExportFormat?.value === 'core';
      let text = privateExport ? bundle.privateText : bundle.publicText;
      try {
        if (coreFormat) text = coreImportCommand(text);
      } catch (cause) {
        showError(cause instanceof Error ? cause.message : 'Unable to prepare child account export.');
        return;
      }
      if (action.endsWith('Download')) {
        const filename = `${bundle.fileStem}.${privateExport ? 'PRIVATE' : 'public'}.${
          coreFormat ? 'core-import' : 'descriptors'
        }.txt`;
        downloadText(text, filename, 'text/plain');
        showStatus(`Created ${filename}.`);
      } else {
        void copyText(button, text, privateExport);
      }
    });
  }

  return {
    adapter: () => bip85WalletAdapter,
    controls: () => bip85WalletControls,
    workspace: bip85WalletWorkspace,
    openButton: optionalElement<HTMLButtonElement>('#open-bip85-wallet'),
    clear: clearBip85WalletResults,
    initialize: initializeBip85Wallet,
    derive: deriveBip85Wallet,
    scheduleRefresh: scheduleBip85WalletRefresh,
    hasResults: () => bip85WalletBranchResults.size > 0,
    render: renderBip85Wallet,
    setSecretsVisible(revealed: boolean) {
      if (bip85WalletResults !== null) updateSecretVisibility(bip85WalletResults, revealed);
      if (bip85WalletToggleSecrets !== null) {
        bip85WalletToggleSecrets.textContent = revealed ? 'Hide all private keys' : 'Reveal all private keys';
        bip85WalletToggleSecrets.setAttribute('aria-pressed', String(revealed));
      }
      updateBip85WalletActions();
    },
    cancelScheduledRefresh() {
      if (pendingBip85WalletRefresh !== null) window.clearTimeout(pendingBip85WalletRefresh);
      pendingBip85WalletRefresh = null;
    },
  };
}
