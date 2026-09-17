import { formatDashDuffs } from '@ckd/core/dash-units.js';
import { formatPlatformCredits } from '@ckd/dash-network/memo.js';
import type { PlatformAddressTransition } from '@ckd/dash-network/platform-address-history.js';
import type {
  IdentityActivityEvent,
  IdentityDataContractHistory,
  IdentityDocumentHistory,
  IdentityTokenHistory,
  IdentityWithdrawalHistory,
  PlatformIdentityHistoryResult,
} from '@ckd/dash-network/platform-identity-history.js';
import type {
  IdentityPublicKeySnapshot,
  PlatformIdentitySnapshot,
} from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressTransaction } from '@ckd/dash-network/public-address.js';
import type { ShieldedActivity } from '@ckd/dash-network/types.js';

export function formatDate(timestampMs: number | bigint | null): string {
  if (timestampMs === null) return 'Unavailable';
  const value = typeof timestampMs === 'bigint' ? Number(timestampMs) : timestampMs;
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function formatSignedPlatformCredits(value: bigint): string {
  if (value < 0n) return `−${formatPlatformCredits(-value)}`;
  if (value > 0n) return `+${formatPlatformCredits(value)}`;
  return formatPlatformCredits(0n);
}

export function createActivityRenderers(document: Document) {
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
    const direction =
      record.direction === 'received' ? 'Received' : record.direction === 'sent' ? 'Sent' : 'Self / change';
    const status =
      record.incoming === undefined
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
    const direction =
      transaction.netDuffs > 0n
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

  function subsection(title: string, detail: string, className = ''): HTMLElement {
    const heading = document.createElement('div');
    heading.className = `viewer-identity-subsection ${className}`.trim();
    const titleElement = document.createElement('h4');
    titleElement.className = 'viewer-identity-subsection-title';
    titleElement.textContent = title;
    heading.append(titleElement, valueElement('viewer-identity-subsection-detail', detail));
    return heading;
  }

  function identityResultHeading(identity: PlatformIdentitySnapshot): HTMLElement {
    const heading = document.createElement('div');
    heading.className = 'viewer-identity-result-heading';
    const nameGroup = document.createElement('div');
    nameGroup.className = 'viewer-identity-result-name';
    const label = document.createElement('span');
    label.className = 'viewer-identity-result-label';
    label.textContent = 'Resolved Identity';
    const title = document.createElement('h3');
    title.textContent = identity.dpnsNames[0] ?? 'Unnamed Identity';
    nameGroup.append(label, title);
    const detail = document.createElement('p');
    detail.textContent = `${identity.identifier} · proof-verified current state`;
    heading.append(nameGroup, detail);
    return heading;
  }

  function renderIdentityKey(key: IdentityPublicKeySnapshot): HTMLElement {
    const contract =
      key.contractBounds === null
        ? 'None'
        : `${key.contractBounds.type} · ${key.contractBounds.identifier}${key.contractBounds.documentTypeName === null ? '' : ` · ${key.contractBounds.documentTypeName}`}`;
    return detailsCard(
      `${key.matchesLookup ? 'identity-key-match' : ''} ${key.disabledAtMs === null ? 'direction-neutral' : 'direction-sent'}`.trim(),
      `Key ${key.keyId}${key.matchesLookup ? ' · LOOKUP MATCH' : ''}`,
      `${key.securityLevel} · ${key.purpose}`,
      key.disabledAtMs === null ? 'Active' : 'Disabled',
      [
        ['Registered public-key HASH160', key.publicKeyHashHex],
        ['Public key / stored hash', key.dataHex],
        ['Key type', `${key.keyType} (${key.keyTypeNumber})`],
        ['Purpose', `${key.purpose} (${key.purposeNumber})`],
        ['Security level', `${key.securityLevel} (${key.securityLevelNumber})`],
        ['MASTER', key.isMaster ? 'Yes' : 'No'],
        ['Read only', key.readOnly ? 'Yes' : 'No'],
        ['Disabled at', formatDate(key.disabledAtMs)],
        ['Contract bounds', contract],
      ],
      key.disabledAtMs === null ? 'positive' : 'negative',
    );
  }

  function renderIdentityActivity(event: IdentityActivityEvent): HTMLElement {
    const direction =
      event.direction === 'incoming'
        ? { className: 'direction-received', label: 'Incoming' }
        : event.direction === 'outgoing'
          ? { className: 'direction-sent', label: 'Outgoing' }
          : event.direction === 'self'
            ? { className: 'direction-self', label: 'Self transfer' }
            : { className: 'direction-neutral', label: 'Identity transition' };
    return detailsCard(
      direction.className,
      direction.label,
      event.transactionHash,
      event.netAmountCredits === null
        ? (event.status ?? 'Indexed')
        : formatSignedPlatformCredits(event.netAmountCredits),
      [
        ['Date / time', formatDate(event.timestampMs)],
        ['Transition type', event.type],
        ['Batch type', event.batchType ?? 'Not a batch transition'],
        ['Status', event.status ?? 'Not separately reported'],
        ['Direction', event.direction],
        [
          'Transfer legs',
          event.transfers.length === 0
            ? 'None'
            : event.transfers
                .map(
                  (transfer, index) =>
                    `${index + 1}. ${transfer.direction} · ${formatPlatformCredits(transfer.amountCredits)} · ${transfer.sender ?? 'protocol'} → ${transfer.recipient ?? 'protocol'}`,
                )
                .join(' | '),
        ],
        [
          'Net Identity amount',
          event.netAmountCredits === null
            ? 'No transfer amount for this transition'
            : formatSignedPlatformCredits(event.netAmountCredits),
        ],
        ['Block height', event.blockHeight?.toLocaleString() ?? 'Unavailable'],
        ['Gas used', event.gasUsedCredits === null ? 'Unavailable' : formatPlatformCredits(event.gasUsedCredits)],
        ['Error', event.error ?? 'None reported'],
        ['Block hash', event.blockHash ?? 'Unavailable'],
      ],
      event.status === 'FAIL' ? 'negative' : event.direction === 'incoming' ? 'positive' : '',
    );
  }

  function renderIdentityDocument(value: IdentityDocumentHistory): HTMLElement {
    return detailsCard(
      'direction-neutral',
      `Document · ${value.documentTypeName ?? 'unknown type'}`,
      value.identifier,
      value.deleted ? 'Deleted' : 'Current',
      [
        ['Created / updated', formatDate(value.timestampMs)],
        ['Data contract', value.dataContractIdentifier ?? 'Unavailable'],
        ['Revision', value.revision?.toLocaleString() ?? 'Unavailable'],
        ['System document', value.system ? 'Yes' : 'No'],
        ['Transaction hash', value.transactionHash ?? 'Unavailable'],
      ],
    );
  }

  function renderIdentityContract(value: IdentityDataContractHistory): HTMLElement {
    return detailsCard(
      'direction-neutral',
      `Data contract · ${value.name ?? 'unnamed'}`,
      value.identifier,
      value.version === null ? 'Version unavailable' : `Version ${value.version}`,
      [
        ['Created', formatDate(value.timestampMs)],
        ['System contract', value.system ? 'Yes' : 'No'],
        ['Documents', value.documentsCount?.toLocaleString() ?? 'Unavailable'],
        ['Tokens', value.tokensCount?.toLocaleString() ?? 'Unavailable'],
        ['Description', value.description ?? 'Unavailable'],
        ['Keywords', value.keywords.length === 0 ? 'None' : value.keywords.join(', ')],
        ['Transaction hash', value.transactionHash ?? 'Unavailable'],
      ],
    );
  }

  function renderIdentityWithdrawal(value: IdentityWithdrawalHistory): HTMLElement {
    return detailsCard(
      'direction-sent',
      'Withdrawal',
      value.documentId,
      formatPlatformCredits(value.amountCredits),
      [
        ['Status', value.status],
        ['Date / time', formatDate(value.timestampMs)],
        ['Core destination', value.withdrawalAddress ?? 'Unavailable'],
        ['Core transaction hash', value.coreTransactionHash ?? 'Not indexed yet'],
      ],
      'negative',
    );
  }

  function renderIdentityToken(value: IdentityTokenHistory): HTMLElement {
    return detailsCard(
      'direction-neutral',
      `Token · ${value.name ?? 'unnamed'}`,
      value.identifier,
      value.totalSupply === null ? 'Supply unavailable' : value.totalSupply.toLocaleString(),
      [
        ['Created', formatDate(value.timestampMs)],
        ['Data contract', value.dataContractIdentifier ?? 'Unavailable'],
        ['Contract position', value.position?.toLocaleString() ?? 'Unavailable'],
        ['Description', value.description ?? 'Unavailable'],
        ['Base supply', value.baseSupply?.toLocaleString() ?? 'Unavailable'],
        ['Maximum supply', value.maxSupply?.toLocaleString() ?? 'Unlimited / unavailable'],
        ['Decimals', value.decimals?.toLocaleString() ?? 'Unavailable'],
        [
          'Capabilities',
          [
            value.mintable === true ? 'mintable' : null,
            value.burnable === true ? 'burnable' : null,
            value.freezable === true ? 'freezable' : null,
            value.destroyable === true ? 'destroyable' : null,
          ]
            .filter((item): item is string => item !== null)
            .join(', ') || 'None reported',
        ],
      ],
    );
  }

  function emptyIdentitySection(message: string): HTMLElement {
    const empty = document.createElement('p');
    empty.className = 'viewer-empty viewer-identity-empty';
    empty.textContent = message;
    return empty;
  }

  function renderIdentityTabs(
    identity: PlatformIdentitySnapshot,
    historyResult: PlatformIdentityHistoryResult | undefined,
  ): HTMLElement {
    const history = historyResult?.history ?? null;
    const aliases = history?.aliases.map(({ name, status }) => `${name} (${status})`) ?? [];
    const fundingSource =
      history?.registrationFundingSource === 'core-asset-lock'
        ? 'Dash Core asset lock'
        : history?.registrationFundingSource === 'platform-addresses'
          ? 'Dash Platform addresses'
          : history?.registrationFundingSource === 'shielded-pool'
            ? 'Dash Platform shielded pool'
            : 'Unavailable';
    const fundingCoreTransaction =
      history?.fundingCoreTransactionHash === null || history?.fundingCoreTransactionHash === undefined
        ? history?.registrationFundingSource === 'platform-addresses' ||
          history?.registrationFundingSource === 'shielded-pool'
          ? 'Not applicable'
          : 'Unavailable'
        : history.fundingCoreTransactionOutputIndex === null
          ? history.fundingCoreTransactionHash
          : `${history.fundingCoreTransactionHash}:${history.fundingCoreTransactionOutputIndex}`;
    const fundingDataStatus =
      history === null
        ? 'Unavailable'
        : (history.fundingCoreTransactionError ??
          (history.registrationFundingSource === 'core-asset-lock' && history.fundingCoreTransactionHash === null
            ? 'Core asset-lock data unavailable from index'
            : 'Available'));
    const overview: HTMLElement[] = [
      detailsCard(
        'viewer-identity-overview direction-neutral',
        'Identity state',
        identity.identifier,
        formatPlatformCredits(identity.balanceCredits),
        [
          ['Identity ID (Base58)', identity.identifier],
          ['Identity ID (hex)', identity.identifierHex],
          ['Proof-verified DPNS names', identity.dpnsNames.length === 0 ? 'None found' : identity.dpnsNames.join(', ')],
          ['Explorer aliases', aliases.length === 0 ? 'None indexed' : aliases.join(', ')],
          ['Revision', identity.revision.toLocaleString()],
          ['Identity nonce', identity.nonce?.toLocaleString() ?? 'Unavailable'],
          ['Registered', formatDate(history?.registeredAtMs ?? null)],
          ['Registration type', history?.registrationType ?? 'Unavailable'],
          ['Registration transaction', history?.registrationTransactionHash ?? 'Unavailable'],
          ['Funding source', fundingSource],
          ['Funding Core outpoint', fundingCoreTransaction],
          ['Funding data status', fundingDataStatus],
          ['System Identity', history?.systemIdentity === true ? 'Yes' : 'No'],
        ],
        'positive',
      ),
    ];
    if (historyResult?.error !== null && historyResult?.error !== undefined) {
      const warning = document.createElement('p');
      warning.className = 'viewer-completeness viewer-completeness-warning';
      warning.textContent = `Indexed history unavailable: ${historyResult.error} Proof-verified Identity state above remains valid.`;
      overview.push(warning);
    } else if (history !== null) {
      overview.push(
        subsection(
          'Indexed Identity summary',
          `${history.provider} · synchronized at Platform height ${history.indexedHeight.toLocaleString()}`,
        ),
        detailsCard(
          'direction-neutral',
          'Indexed lifetime totals',
          `Registered ${formatDate(history.registeredAtMs)}`,
          `${history.totalTransactions.toLocaleString()} transitions`,
          [
            ['Transfers', history.totalTransfers.toLocaleString()],
            ['Documents', history.totalDocuments.toLocaleString()],
            ['Data contracts', history.totalDataContracts.toLocaleString()],
            [
              'Total gas spent',
              history.totalGasSpentCredits === null
                ? 'Unavailable'
                : formatPlatformCredits(history.totalGasSpentCredits),
            ],
            [
              'Average gas',
              history.averageGasSpentCredits === null
                ? 'Unavailable'
                : formatPlatformCredits(history.averageGasSpentCredits),
            ],
            ['Top-ups', history.totalTopUps?.toLocaleString() ?? 'Unavailable'],
            [
              'Top-up amount',
              history.totalTopUpsCredits === null ? 'Unavailable' : formatPlatformCredits(history.totalTopUpsCredits),
            ],
            ['Withdrawals', history.totalWithdrawals?.toLocaleString() ?? 'Unavailable'],
            [
              'Withdrawal amount',
              history.totalWithdrawalsCredits === null
                ? 'Unavailable'
                : formatPlatformCredits(history.totalWithdrawalsCredits),
            ],
            ['Last withdrawal', history.lastWithdrawalHash ?? 'None indexed'],
            ['Last withdrawal time', formatDate(history.lastWithdrawalTimestampMs)],
          ],
        ),
      );
      if (history.aliases.length > 0) {
        overview.push(subsection('DPNS aliases', `${history.aliases.length.toLocaleString()} indexed alias record(s)`));
        overview.push(
          ...history.aliases.map((alias) =>
            detailsCard('direction-neutral', alias.name, alias.documentId ?? 'DPNS alias', alias.status, [
              ['Contested', alias.contested ? 'Yes' : 'No'],
              ['Timestamp', formatDate(alias.timestampMs)],
              ['Transaction hash', alias.transactionHash ?? 'Unavailable'],
            ]),
          ),
        );
      }
    }
    const unavailable = (category: string): HTMLElement =>
      emptyIdentitySection(
        historyResult?.error === null || historyResult?.error === undefined
          ? `No ${category} were returned within the current history limit.`
          : `${category} are unavailable because indexed history could not be loaded.`,
      );
    const keys: HTMLElement[] = [
      subsection(
        'Registered public keys',
        `${identity.publicKeys.length.toLocaleString()} key(s) · highlighted key matched the lookup fingerprint`,
      ),
      ...identity.publicKeys.map(renderIdentityKey),
    ];
    const activity: HTMLElement[] =
      history !== null && history.activity.length > 0
        ? [
            subsection(
              'Unified activity',
              `${history.activity.length.toLocaleString()} transaction/transfer record(s), deduplicated by transaction hash`,
            ),
            ...history.activity.map(renderIdentityActivity),
          ]
        : [unavailable('activity records')];
    const documents: HTMLElement[] =
      history !== null && history.documents.length > 0
        ? [
            subsection('Documents', `${history.documents.length.toLocaleString()} loaded`),
            ...history.documents.map(renderIdentityDocument),
          ]
        : [unavailable('documents')];
    const contracts: HTMLElement[] =
      history !== null && history.dataContracts.length > 0
        ? [
            subsection('Data contracts', `${history.dataContracts.length.toLocaleString()} loaded`),
            ...history.dataContracts.map(renderIdentityContract),
          ]
        : [unavailable('data contracts')];
    const withdrawals: HTMLElement[] =
      history !== null && history.withdrawals.length > 0
        ? [
            subsection('Withdrawals', `${history.withdrawals.length.toLocaleString()} loaded`),
            ...history.withdrawals.map(renderIdentityWithdrawal),
          ]
        : [
            emptyIdentitySection(
              historyResult?.error === null || historyResult?.error === undefined
                ? 'No Identity credit-withdrawal transitions were indexed. Incoming and outgoing Identity credit transfers are shown under Activity.'
                : 'Withdrawals are unavailable because indexed history could not be loaded.',
            ),
          ];
    const tokens: HTMLElement[] =
      history !== null && history.tokens.length > 0
        ? [
            subsection('Created tokens', `${history.tokens.length.toLocaleString()} loaded`),
            ...history.tokens.map(renderIdentityToken),
          ]
        : [unavailable('tokens')];
    const sections = [
      { key: 'overview', label: 'Overview & names', count: null, content: overview },
      { key: 'keys', label: 'Keys', count: identity.publicKeys.length, content: keys },
      { key: 'activity', label: 'Activity', count: history?.activity.length ?? 0, content: activity },
      { key: 'documents', label: 'Documents', count: history?.documents.length ?? 0, content: documents },
      { key: 'contracts', label: 'Contracts', count: history?.dataContracts.length ?? 0, content: contracts },
      { key: 'withdrawals', label: 'Withdrawals', count: history?.withdrawals.length ?? 0, content: withdrawals },
      { key: 'tokens', label: 'Tokens', count: history?.tokens.length ?? 0, content: tokens },
    ];
    const container = document.createElement('section');
    container.className = 'viewer-identity-tabs';
    const tabList = document.createElement('div');
    tabList.className = 'viewer-identity-tab-list';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', `Identity sections for ${identity.identifier}`);
    const tabs: HTMLButtonElement[] = [];
    const panels: HTMLElement[] = [];
    const activate = (activeIndex: number, moveFocus: boolean): void => {
      tabs.forEach((tab, index) => {
        const active = index === activeIndex;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[index]!.hidden = !active;
      });
      if (moveFocus) tabs[activeIndex]?.focus();
    };
    sections.forEach((section, index) => {
      const tabId = `identity-${identity.identifier}-${section.key}-tab`;
      const panelId = `identity-${identity.identifier}-${section.key}-panel`;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = tabId;
      tab.className = 'viewer-identity-tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.append(valueElement('viewer-identity-tab-label', section.label));
      if (section.count !== null) {
        tab.append(valueElement('viewer-identity-tab-count', section.count.toLocaleString()));
      }
      tab.addEventListener('click', () => activate(index, false));
      tab.addEventListener('keydown', (event) => {
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activate(nextIndex, true);
      });
      const panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'viewer-identity-tab-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.append(...section.content);
      tabs.push(tab);
      panels.push(panel);
      tabList.append(tab);
    });
    container.append(tabList, ...panels);
    activate(0, false);
    return container;
  }

  return {
    stat,
    renderShieldedActivity,
    renderCoreTransaction,
    renderPlatformTransition,
    identityResultHeading,
    renderIdentityTabs,
  };
}
