import { createPaymentQrAction } from '@ckd/ui/payment-qr.js';
import {
  branchLabel,
  buildConcreteMultisigWallet,
  buildRangedWallet,
  type ConcreteMultisigWallet,
  type MultisigBranch,
  type RangedWallet,
} from './multisig-wallet.js';
import { copyPlainText, downloadText, required, selectedNetwork, syncNetworkChoice, textElement } from './ui-common.js';

export function installMultisigWalletFeature(): void {
  const walletChain = required<HTMLSelectElement>('wallet-chain');
  const walletNetwork = required<HTMLSelectElement>('wallet-network');
  const walletWrapper = required<HTMLSelectElement>('wallet-wrapper');
  const walletOrder = required<HTMLSelectElement>('wallet-order');
  const walletRequired = required<HTMLInputElement>('wallet-required');
  const walletKeys = required<HTMLTextAreaElement>('wallet-keys');
  const walletStartIndex = required<HTMLInputElement>('wallet-start-index');
  const walletEndIndex = required<HTMLInputElement>('wallet-end-index');
  const walletReceiveBranch = required<HTMLInputElement>('wallet-receive-branch');
  const walletChangeBranch = required<HTMLInputElement>('wallet-change-branch');
  const buildWalletButton = required<HTMLButtonElement>('build-wallet');
  const clearWalletButton = required<HTMLButtonElement>('clear-wallet');
  const walletError = required<HTMLDivElement>('wallet-error');
  const walletResults = required<HTMLElement>('wallet-results');
  const walletDescriptors = required<HTMLElement>('wallet-descriptors');
  const walletImportText = required<HTMLElement>('wallet-import-text');
  const walletImportJson = required<HTMLElement>('wallet-import-json');
  const walletDerivationDetails = required<HTMLElement>('wallet-derivation-details');
  const walletAddressRows = required<HTMLElement>('wallet-address-rows');
  const walletBasicMode = required<HTMLButtonElement>('wallet-mode-basic');
  const walletAdvancedMode = required<HTMLButtonElement>('wallet-mode-advanced');
  const walletReceiveTab = required<HTMLButtonElement>('wallet-receive-tab');
  const walletChangeTab = required<HTMLButtonElement>('wallet-change-tab');
  const walletBranchTabs = required<HTMLElement>('wallet-branch-tabs');
  const walletAdvancedOutput = required<HTMLElement>('wallet-advanced-output');
  const walletSelectedCount = required<HTMLElement>('wallet-selected-count');
  const walletExportFormat = required<HTMLSelectElement>('wallet-export-format');
  const walletCopyAddresses = required<HTMLButtonElement>('wallet-copy-addresses');
  const walletCopyPublicKeys = required<HTMLButtonElement>('wallet-copy-public-keys');
  const walletCopySelected = required<HTMLButtonElement>('wallet-copy-selected');
  const walletCopyAllDisplayed = required<HTMLButtonElement>('wallet-copy-all-displayed');
  const walletDownloadSelected = required<HTMLButtonElement>('wallet-download-selected');
  const walletSelectAll = required<HTMLButtonElement>('wallet-select-all');
  const walletSelectNone = required<HTMLButtonElement>('wallet-select-none');
  const walletSelectInvert = required<HTMLButtonElement>('wallet-select-invert');
  type WalletBuild = ConcreteMultisigWallet | RangedWallet;
  let currentWallet: WalletBuild | null = null;
  let walletDetailMode: 'basic' | 'advanced' = 'basic';
  let activeWalletBranch: MultisigBranch = 0;
  let selectedWalletRows = new Set<string>();
  let pendingWalletBuild: number | null = null;

  function selectedWalletBranches(): MultisigBranch[] {
    const branches: MultisigBranch[] = [];
    if (walletReceiveBranch.checked) branches.push(0);
    if (walletChangeBranch.checked) branches.push(1);
    return branches;
  }

  function syncWalletControls(): void {
    walletWrapper.disabled = walletChain.value === 'dash';
    if (walletChain.value === 'dash') walletWrapper.value = 'p2sh';
    walletRequired.max = walletWrapper.value === 'p2sh' ? '15' : '20';
  }

  function isCompressedPublicKey(value: string): boolean {
    return /^(02|03)[0-9a-f]{64}$/iu.test(value.trim());
  }

  function isAccountXpub(value: string): boolean {
    if (value.trim().startsWith('pkh(')) return true;
    return /^(?:\[[0-9a-fA-F]{8}(?:\/[0-9]+['hH]?)+\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+$/u.test(value.trim());
  }

  function buildWallet(): void {
    if (pendingWalletBuild !== null) {
      window.clearTimeout(pendingWalletBuild);
      pendingWalletBuild = null;
    }
    walletError.hidden = true;
    walletResults.hidden = true;
    try {
      const common = {
        chain: walletChain.value === 'dash' ? ('dash' as const) : ('bitcoin' as const),
        network: selectedNetwork(walletNetwork, walletChain.value === 'dash' ? 'dash' : 'bitcoin'),
        required: Number(walletRequired.value),
        keyOrder: walletOrder.value === 'bip67' ? ('bip67' as const) : ('supplied' as const),
        wrapper: walletWrapper.value === 'p2sh' ? ('p2sh' as const) : ('p2wsh' as const),
      };
      const inputs = walletKeys.value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      const childKeyCount = inputs.filter(isCompressedPublicKey).length;
      const xpubCount = inputs.filter(isAccountXpub).length;
      if (inputs.length === 0) throw new Error('Enter compressed child public keys or account xpubs.');
      if (childKeyCount !== inputs.length && xpubCount !== inputs.length) {
        throw new Error(
          'Use either all compressed child public keys or all account xpubs. Do not mix fixed child keys with ranged xpub derivation in one wallet.',
        );
      }

      currentWallet =
        xpubCount === inputs.length
          ? buildRangedWallet({
              ...common,
              accountXpubs: inputs,
              branches: selectedWalletBranches(),
              startIndex: Number(walletStartIndex.value),
              endIndex: Number(walletEndIndex.value),
            })
          : buildConcreteMultisigWallet({
              ...common,
              publicKeys: inputs,
            });
      activeWalletBranch = 'rows' in currentWallet && currentWallet.rows.some((row) => row.branch === 0) ? 0 : 1;
      selectedWalletRows = new Set(walletRowRecords(currentWallet).map((row) => row.id));
      renderWallet();
      walletResults.hidden = false;
    } catch (error) {
      walletError.textContent = error instanceof Error ? error.message : String(error);
      walletError.hidden = false;
    }
  }

  function scheduleWalletBuild(): void {
    if (pendingWalletBuild !== null) window.clearTimeout(pendingWalletBuild);
    pendingWalletBuild = window.setTimeout(() => {
      pendingWalletBuild = null;
      if (walletKeys.value.trim().length > 0) buildWallet();
    }, 250);
  }

  interface WalletDisplayRow {
    readonly id: string;
    readonly branch: MultisigBranch;
    readonly index: number;
    readonly path: string;
    readonly address: string;
    readonly publicKeys: readonly string[];
    readonly scriptPubKey: string;
    readonly redeemScript: string;
  }

  function walletRowRecords(wallet: WalletBuild): WalletDisplayRow[] {
    if ('rows' in wallet) {
      return wallet.rows.map((row) => ({
        id: `${row.branch}:${row.index}`,
        branch: row.branch,
        index: row.index,
        path: `${branchLabel(row.branch)} ${row.pathSuffix}`,
        address: row.address,
        publicKeys: row.publicKeys,
        scriptPubKey: row.scriptPubKey,
        redeemScript: row.redeemScript,
      }));
    }
    return [
      {
        id: 'concrete',
        branch: 0,
        index: 0,
        path: 'Concrete address; child public keys supplied directly',
        address: wallet.address,
        publicKeys: wallet.orderedPublicKeys,
        scriptPubKey: wallet.scriptPubKey,
        redeemScript: wallet.redeemScript,
      },
    ];
  }

  function visibleWalletRows(): WalletDisplayRow[] {
    if (currentWallet === null) return [];
    const rows = walletRowRecords(currentWallet);
    return 'rows' in currentWallet ? rows.filter((row) => row.branch === activeWalletBranch) : rows;
  }

  function updateWalletBulkControls(): void {
    const total = currentWallet === null ? 0 : walletRowRecords(currentWallet).length;
    walletSelectedCount.textContent = `${selectedWalletRows.size.toLocaleString()} selected`;
    const disabled = currentWallet === null || selectedWalletRows.size === 0;
    for (const button of [
      walletCopyAddresses,
      walletCopyPublicKeys,
      walletCopySelected,
      walletCopyAllDisplayed,
      walletDownloadSelected,
      walletSelectAll,
      walletSelectNone,
      walletSelectInvert,
    ]) {
      button.disabled = currentWallet === null || (button !== walletSelectAll && disabled);
    }
    if (currentWallet !== null && selectedWalletRows.size === total)
      walletSelectedCount.textContent = `${total.toLocaleString()} selected`;
  }

  function walletFields(row: WalletDisplayRow): Array<readonly [string, string]> {
    const base: Array<readonly [string, string]> = [
      ['Path', row.path],
      ['Address', row.address],
    ];
    if (walletDetailMode === 'advanced') {
      base.push(
        ['Public keys', row.publicKeys.join('\n')],
        ['scriptPubKey', row.scriptPubKey],
        ['redeemScript', row.redeemScript],
      );
    }
    return base;
  }

  function walletExportRows(action: 'addresses' | 'publicKeys' | 'selected' | 'allDisplayed'): string {
    const rows = walletRowRecords(currentWallet!).filter((row) => selectedWalletRows.has(row.id));
    const format = walletExportFormat.value;
    const fields = (row: WalletDisplayRow): Array<readonly [string, string]> => {
      if (action === 'addresses') return [['Address', row.address]];
      if (action === 'publicKeys') return [['Public keys', row.publicKeys.join('\n')]];
      return walletFields(row);
    };
    if (format === 'plain') {
      return rows.flatMap((row) => fields(row).map(([, value]) => value)).join('\n');
    }
    if (format === 'tsv') {
      const sampleFields = rows[0] === undefined ? [] : fields(rows[0]);
      const headers = ['Path', ...sampleFields.map(([label]) => label).filter((label) => label !== 'Path')];
      return [
        headers.join('\t'),
        ...rows.map((row) =>
          headers
            .map((header) => {
              const match = (header === 'Path' ? walletFields(row) : fields(row)).find(([label]) => label === header);
              return (match?.[1] ?? '').replace(/[\t\r\n]+/gu, ' ');
            })
            .join('\t'),
        ),
      ].join('\n');
    }
    return rows
      .map((row) => [`Index: ${row.index}`, ...fields(row).map(([label, value]) => `${label}: ${value}`)].join('\n'))
      .join('\n\n');
  }

  function setWalletMode(mode: 'basic' | 'advanced'): void {
    walletDetailMode = mode;
    walletBasicMode.classList.toggle('active', mode === 'basic');
    walletAdvancedMode.classList.toggle('active', mode === 'advanced');
    walletBasicMode.setAttribute('aria-pressed', String(mode === 'basic'));
    walletAdvancedMode.setAttribute('aria-pressed', String(mode === 'advanced'));
    renderWallet();
  }

  function setWalletBranch(branch: MultisigBranch): void {
    activeWalletBranch = branch;
    renderWallet();
  }

  function renderWallet(): void {
    const wallet = currentWallet;
    if (wallet === null) return;
    updateWalletBulkControls();
    const descriptors =
      'descriptors' in wallet ? wallet.descriptors : [{ label: 'concrete address', descriptor: wallet.descriptor }];
    walletDescriptors.replaceChildren(
      ...descriptors.map((descriptor) => {
        const row = document.createElement('div');
        row.className = 'policy-row';
        row.append(
          textElement('span', '', descriptor.label),
          textElement('code', 'scroll-code', descriptor.descriptor),
        );
        return row;
      }),
    );
    walletImportText.textContent = wallet.importText;
    walletImportJson.textContent = wallet.importJson;
    walletDerivationDetails.textContent = wallet.derivationDetails;
    walletAdvancedOutput.hidden = walletDetailMode !== 'advanced';
    walletBranchTabs.hidden = !('rows' in wallet) || !wallet.rows.some((row) => row.branch === 1);
    walletReceiveTab.classList.toggle('active', activeWalletBranch === 0);
    walletChangeTab.classList.toggle('active', activeWalletBranch === 1);
    walletReceiveTab.setAttribute('aria-selected', String(activeWalletBranch === 0));
    walletChangeTab.setAttribute('aria-selected', String(activeWalletBranch === 1));

    const table = document.createElement('div');
    table.className = 'wallet-address-table';
    const rows = visibleWalletRows();
    if (walletDetailMode === 'basic') {
      const htmlTable = document.createElement('table');
      htmlTable.className = 'wallet-basic-table';
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of ['Use', 'Path', 'Address']) headRow.append(textElement('th', '', label));
      head.append(headRow);
      const body = document.createElement('tbody');
      for (const row of rows) {
        const tr = document.createElement('tr');
        const use = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedWalletRows.has(row.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedWalletRows.add(row.id);
          else selectedWalletRows.delete(row.id);
          updateWalletBulkControls();
        });
        use.append(checkbox);
        const path = textElement('td', 'value', row.path);
        const address = document.createElement('td');
        const addressLine = document.createElement('div');
        addressLine.className = 'wallet-inline-actions';
        addressLine.append(
          textElement('code', 'wallet-inline-value', row.address),
          copyButton(row.address),
          createPaymentQrAction(
            document,
            `${walletChain.value === 'dash' ? 'dash' : 'bitcoin'}:${row.address}`,
            'multisig address',
          ),
        );
        address.append(addressLine);
        tr.append(use, path, address);
        body.append(tr);
      }
      htmlTable.append(head, body);
      table.append(htmlTable);
    } else {
      for (const row of rows) {
        const card = document.createElement('div');
        card.className = 'wallet-advanced-card';
        for (const [label, value] of walletFields(row)) {
          const line = document.createElement('div');
          line.className = 'policy-row';
          line.append(textElement('span', '', label), textElement('code', 'scroll-code', value), copyButton(value));
          card.append(line);
        }
        table.append(card);
      }
    }
    walletAddressRows.replaceChildren(table);
  }

  function copyButton(value: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'secondary compact';
    button.type = 'button';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      await copyPlainText(value);
      const previous = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = previous;
      }, 900);
    });
    return button;
  }

  walletChain.addEventListener('change', syncWalletControls);
  walletWrapper.addEventListener('change', syncWalletControls);
  walletChain.addEventListener('change', () => syncNetworkChoice(walletChain, walletNetwork));
  syncNetworkChoice(walletChain, walletNetwork);
  buildWalletButton.addEventListener('click', buildWallet);
  for (const control of [
    walletChain,
    walletNetwork,
    walletWrapper,
    walletOrder,
    walletRequired,
    walletKeys,
    walletStartIndex,
    walletEndIndex,
    walletReceiveBranch,
    walletChangeBranch,
  ]) {
    control.addEventListener('input', scheduleWalletBuild);
    control.addEventListener('change', scheduleWalletBuild);
  }
  walletBasicMode.addEventListener('click', () => setWalletMode('basic'));
  walletAdvancedMode.addEventListener('click', () => setWalletMode('advanced'));
  walletReceiveTab.addEventListener('click', () => setWalletBranch(0));
  walletChangeTab.addEventListener('click', () => setWalletBranch(1));
  walletSelectAll.addEventListener('click', () => {
    if (currentWallet !== null) selectedWalletRows = new Set(walletRowRecords(currentWallet).map((row) => row.id));
    renderWallet();
  });
  walletSelectNone.addEventListener('click', () => {
    selectedWalletRows.clear();
    renderWallet();
  });
  walletSelectInvert.addEventListener('click', () => {
    if (currentWallet !== null) {
      const all = walletRowRecords(currentWallet);
      selectedWalletRows = new Set(all.filter((row) => !selectedWalletRows.has(row.id)).map((row) => row.id));
    }
    renderWallet();
  });
  walletCopyAddresses.addEventListener('click', () => {
    void copyPlainText(walletExportRows('addresses'));
  });
  walletCopyPublicKeys.addEventListener('click', () => {
    void copyPlainText(walletExportRows('publicKeys'));
  });
  walletCopySelected.addEventListener('click', () => {
    void copyPlainText(walletExportRows('selected'));
  });
  walletCopyAllDisplayed.addEventListener('click', () => {
    void copyPlainText(walletExportRows('allDisplayed'));
  });
  walletDownloadSelected.addEventListener('click', () => {
    const extension = walletExportFormat.value === 'tsv' ? 'tsv' : 'txt';
    downloadText(
      `multisig-wallet-selected.${extension}`,
      walletExportRows('selected'),
      walletExportFormat.value === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/plain;charset=utf-8',
    );
  });
  clearWalletButton.addEventListener('click', () => {
    if (pendingWalletBuild !== null) {
      window.clearTimeout(pendingWalletBuild);
      pendingWalletBuild = null;
    }
    walletKeys.value = '';
    currentWallet = null;
    walletResults.hidden = true;
    walletError.hidden = true;
  });
  walletChain.addEventListener('change', () => syncNetworkChoice(walletChain, walletNetwork));
  syncNetworkChoice(walletChain, walletNetwork);
  syncWalletControls();
}
