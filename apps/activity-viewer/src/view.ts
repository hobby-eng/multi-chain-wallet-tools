import type { BUILD_INFO } from '@ckd/build-info';
import { formatDashDuffs } from '@ckd/core/dash-units.js';
import { formatPlatformCredits } from '@ckd/dash-network/memo.js';
import type {
  PlatformAddressHistorySnapshot,
  PlatformAddressTransition,
} from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
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
  PlatformIdentityLookupSnapshot,
  PlatformIdentitySnapshot,
} from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressSnapshot, CoreAddressTransaction } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ShieldedActivity, ViewerNetwork } from '@ckd/dash-network/types.js';
import { looksLikeAutoOrchardInput } from './detection.js';

export type ViewerMode = 'shielded' | 'core' | 'platform' | 'identity';
export type ViewerQueryMode = 'single' | 'batch';
export type ViewerDetectionMode = 'auto' | 'advanced';

export interface ViewerBatchResultOption {
  id: string;
  label: string;
  status: 'complete' | 'failed';
  error?: string;
}

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

function formatSignedPlatformCredits(value: bigint): string {
  if (value < 0n) return `−${formatPlatformCredits(-value)}`;
  if (value > 0n) return `+${formatPlatformCredits(value)}`;
  return formatPlatformCredits(0n);
}

export function createActivityViewerView(document: Document, buildInfo: typeof BUILD_INFO) {
  const required = <T extends HTMLElement>(id: string): T => requireElement<T>(document, id);
  const form = required<HTMLFormElement>('viewer-form');
  const networkInput = required<HTMLSelectElement>('viewer-network');
  const keyCapabilityInput = required<HTMLSelectElement>('viewer-key-capability');
  const capabilityControls = required<HTMLDivElement>('viewer-capability-controls');
  const historyField = required<HTMLDivElement>('viewer-history-field');
  const historyLimitInput = required<HTMLInputElement>('viewer-history-limit');
  const batchControls = required<HTMLDivElement>('viewer-batch-controls');
  const batchConcurrencyInput = required<HTMLSelectElement>('viewer-batch-concurrency');
  const singleInputPanel = required<HTMLDivElement>('viewer-single-input-panel');
  const batchInputPanel = required<HTMLDivElement>('viewer-batch-input-panel');
  const viewingKeyInput = required<HTMLInputElement>('full-viewing-key');
  const batchInput = required<HTMLTextAreaElement>('viewer-batch-input');
  const advancedModes = required<HTMLDivElement>('viewer-advanced-modes');
  const inputLabel = required<HTMLLabelElement>('viewer-input-label');
  const inputHelp = required<HTMLParagraphElement>('viewer-input-help');
  const keyMode = required<HTMLSpanElement>('viewer-key-mode');
  const privacyChip = required<HTMLElement>('viewer-privacy-chip');
  const revealButton = required<HTMLButtonElement>('reveal-viewing-key');
  const revealBatchButton = required<HTMLButtonElement>('reveal-batch-input');
  const scanButton = required<HTMLButtonElement>('scan-button');
  const scanButtonLabel = required<HTMLSpanElement>('scan-button-label');
  const cancelButton = required<HTMLButtonElement>('cancel-button');
  const clearButton = required<HTMLButtonElement>('clear-viewer');
  const errorBox = required<HTMLDivElement>('viewer-error');
  const statusBox = required<HTMLDivElement>('viewer-status');
  const results = required<HTMLElement>('viewer-results');
  const resultsHeading = required<HTMLHeadingElement>('viewer-results-heading');
  const resultsDescription = required<HTMLParagraphElement>('viewer-results-description');
  const batchResults = required<HTMLDivElement>('viewer-batch-results');
  const resultHelp = required<HTMLElement>('viewer-result-help');
  const summary = required<HTMLDivElement>('viewer-summary');
  const activityList = required<HTMLDivElement>('viewer-activity');
  const completeness = required<HTMLParagraphElement>('viewer-completeness');
  const ledgerTitle = required<HTMLElement>('viewer-ledger-title');
  const ledgerOrder = required<HTMLElement>('viewer-ledger-order');
  const exportActions = required<HTMLElement>('viewer-export-actions');
  const exportCsvButton = required<HTMLButtonElement>('viewer-export-csv');
  const exportXlsxButton = required<HTMLButtonElement>('viewer-export-xlsx');
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
  const queryModeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-query-mode]')];
  const detectionModeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-detection-mode]')];
  let queryStarted = 0;
  let requestCount = 0;
  let remoteDuration = 0;
  let localDuration = 0;
  let queryMode: ViewerQueryMode = 'single';
  let detectionMode: ViewerDetectionMode = 'auto';

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

  function subsection(title: string, detail: string, className = ''): HTMLElement {
    const heading = document.createElement('div');
    heading.className = `viewer-identity-subsection ${className}`.trim();
    const titleElement = document.createElement('h4');
    titleElement.className = 'viewer-identity-subsection-title';
    titleElement.textContent = title;
    heading.append(
      titleElement,
      valueElement('viewer-identity-subsection-detail', detail),
    );
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
    const contract = key.contractBounds === null
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
    const direction = event.direction === 'incoming'
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
      event.netAmountCredits === null ? event.status ?? 'Indexed' : formatSignedPlatformCredits(event.netAmountCredits),
      [
        ['Date / time', formatDate(event.timestampMs)],
        ['Transition type', event.type],
        ['Batch type', event.batchType ?? 'Not a batch transition'],
        ['Status', event.status ?? 'Not separately reported'],
        ['Direction', event.direction],
        ['Transfer legs', event.transfers.length === 0
          ? 'None'
          : event.transfers.map((transfer, index) => `${index + 1}. ${transfer.direction} · ${formatPlatformCredits(transfer.amountCredits)} · ${transfer.sender ?? 'protocol'} → ${transfer.recipient ?? 'protocol'}`).join(' | ')],
        ['Net Identity amount', event.netAmountCredits === null ? 'No transfer amount for this transition' : formatSignedPlatformCredits(event.netAmountCredits)],
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
        ['Capabilities', [
          value.mintable === true ? 'mintable' : null,
          value.burnable === true ? 'burnable' : null,
          value.freezable === true ? 'freezable' : null,
          value.destroyable === true ? 'destroyable' : null,
        ].filter((item): item is string => item !== null).join(', ') || 'None reported'],
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
    const fundingSource = history?.registrationFundingSource === 'core-asset-lock'
      ? 'Dash Core asset lock'
      : history?.registrationFundingSource === 'platform-addresses'
        ? 'Dash Platform addresses'
        : history?.registrationFundingSource === 'shielded-pool'
          ? 'Dash Platform shielded pool'
          : 'Unavailable';
    const fundingCoreTransaction = history?.fundingCoreTransactionHash === null
      || history?.fundingCoreTransactionHash === undefined
      ? history?.registrationFundingSource === 'platform-addresses'
        || history?.registrationFundingSource === 'shielded-pool'
        ? 'Not applicable'
        : 'Unavailable'
      : history.fundingCoreTransactionOutputIndex === null
        ? history.fundingCoreTransactionHash
        : `${history.fundingCoreTransactionHash}:${history.fundingCoreTransactionOutputIndex}`;
    const fundingDataStatus = history === null
      ? 'Unavailable'
      : history.fundingCoreTransactionError
        ?? (
          history.registrationFundingSource === 'core-asset-lock'
          && history.fundingCoreTransactionHash === null
            ? 'Core asset-lock data unavailable from index'
            : 'Available'
        );
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
        subsection('Indexed Identity summary', `${history.provider} · synchronized at Platform height ${history.indexedHeight.toLocaleString()}`),
        detailsCard(
          'direction-neutral',
          'Indexed lifetime totals',
          `Registered ${formatDate(history.registeredAtMs)}`,
          `${history.totalTransactions.toLocaleString()} transitions`,
          [
            ['Transfers', history.totalTransfers.toLocaleString()],
            ['Documents', history.totalDocuments.toLocaleString()],
            ['Data contracts', history.totalDataContracts.toLocaleString()],
            ['Total gas spent', history.totalGasSpentCredits === null ? 'Unavailable' : formatPlatformCredits(history.totalGasSpentCredits)],
            ['Average gas', history.averageGasSpentCredits === null ? 'Unavailable' : formatPlatformCredits(history.averageGasSpentCredits)],
            ['Top-ups', history.totalTopUps?.toLocaleString() ?? 'Unavailable'],
            ['Top-up amount', history.totalTopUpsCredits === null ? 'Unavailable' : formatPlatformCredits(history.totalTopUpsCredits)],
            ['Withdrawals', history.totalWithdrawals?.toLocaleString() ?? 'Unavailable'],
            ['Withdrawal amount', history.totalWithdrawalsCredits === null ? 'Unavailable' : formatPlatformCredits(history.totalWithdrawalsCredits)],
            ['Last withdrawal', history.lastWithdrawalHash ?? 'None indexed'],
            ['Last withdrawal time', formatDate(history.lastWithdrawalTimestampMs)],
          ],
        ),
      );
      if (history.aliases.length > 0) {
        overview.push(subsection('DPNS aliases', `${history.aliases.length.toLocaleString()} indexed alias record(s)`));
        overview.push(...history.aliases.map((alias) => detailsCard(
          'direction-neutral',
          alias.name,
          alias.documentId ?? 'DPNS alias',
          alias.status,
          [
            ['Contested', alias.contested ? 'Yes' : 'No'],
            ['Timestamp', formatDate(alias.timestampMs)],
            ['Transaction hash', alias.transactionHash ?? 'Unavailable'],
          ],
        )));
      }
    }
    const unavailable = (category: string): HTMLElement => emptyIdentitySection(
      historyResult?.error === null || historyResult?.error === undefined
        ? `No ${category} were returned within the current history limit.`
        : `${category} are unavailable because indexed history could not be loaded.`,
    );
    const keys: HTMLElement[] = [
      subsection('Registered public keys', `${identity.publicKeys.length.toLocaleString()} key(s) · highlighted key matched the lookup fingerprint`),
      ...identity.publicKeys.map(renderIdentityKey),
    ];
    const activity: HTMLElement[] = history !== null && history.activity.length > 0
      ? [
        subsection('Unified activity', `${history.activity.length.toLocaleString()} transaction/transfer record(s), deduplicated by transaction hash`),
        ...history.activity.map(renderIdentityActivity),
      ]
      : [unavailable('activity records')];
    const documents: HTMLElement[] = history !== null && history.documents.length > 0
      ? [
        subsection('Documents', `${history.documents.length.toLocaleString()} loaded`),
        ...history.documents.map(renderIdentityDocument),
      ]
      : [unavailable('documents')];
    const contracts: HTMLElement[] = history !== null && history.dataContracts.length > 0
      ? [
        subsection('Data contracts', `${history.dataContracts.length.toLocaleString()} loaded`),
        ...history.dataContracts.map(renderIdentityContract),
      ]
      : [unavailable('data contracts')];
    const withdrawals: HTMLElement[] = history !== null && history.withdrawals.length > 0
      ? [
        subsection('Withdrawals', `${history.withdrawals.length.toLocaleString()} loaded`),
        ...history.withdrawals.map(renderIdentityWithdrawal),
      ]
      : [emptyIdentitySection(
        historyResult?.error === null || historyResult?.error === undefined
          ? 'No Identity credit-withdrawal transitions were indexed. Incoming and outgoing Identity credit transfers are shown under Activity.'
          : 'Withdrawals are unavailable because indexed history could not be loaded.',
      )];
    const tokens: HTMLElement[] = history !== null && history.tokens.length > 0
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
  required<HTMLElement>('viewer-build-edition').textContent = buildInfo.edition;
  required<HTMLElement>('viewer-build-profile').textContent = buildInfo.profile;
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
    batchInput,
    batchConcurrencyInput,
    revealButton,
    revealBatchButton,
    cancelButton,
    clearButton,
    exportCsvButton,
    exportXlsxButton,
    exportJsonButton,
    modeButtons,
    queryModeButtons,
    detectionModeButtons,
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
      batchResults.hidden = true;
      batchResults.replaceChildren();
      summary.replaceChildren();
      activityList.replaceChildren();
    },
    clearQueryInput(): void {
      viewingKeyInput.value = '';
      batchInput.value = '';
      viewingKeyInput.type = 'text';
      batchInput.classList.remove('concealed');
      revealButton.textContent = 'Reveal key';
      revealButton.setAttribute('aria-pressed', 'false');
      revealBatchButton.textContent = 'Reveal keys';
      revealBatchButton.setAttribute('aria-pressed', 'false');
    },
    renderBatchResults(
      options: readonly ViewerBatchResultOption[],
      activeId: string | null,
      activate: (id: string) => void,
    ): void {
      batchResults.replaceChildren(...options.map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `viewer-batch-result ${option.status}${option.id === activeId ? ' active' : ''}`;
        button.textContent = option.label;
        button.disabled = option.status === 'failed';
        button.setAttribute('aria-pressed', String(option.id === activeId));
        if (option.error !== undefined) button.title = option.error;
        if (option.status === 'complete') button.addEventListener('click', () => activate(option.id));
        return button;
      }));
      batchResults.hidden = options.length === 0;
    },
    hideBatchResults(): void {
      batchResults.hidden = true;
      batchResults.replaceChildren();
    },
    setExportAvailable(available: boolean): void {
      exportActions.hidden = !available;
      exportCsvButton.disabled = !available;
      exportXlsxButton.disabled = !available;
      exportJsonButton.disabled = !available;
    },
    setExportBusy(busy: boolean): void {
      exportActions.setAttribute('aria-busy', String(busy));
      exportCsvButton.disabled = busy;
      exportXlsxButton.disabled = busy;
      exportJsonButton.disabled = busy;
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
    setDetectionMode(mode: ViewerDetectionMode, viewerMode: ViewerMode): void {
      detectionMode = mode;
      advancedModes.hidden = mode !== 'advanced';
      for (const button of detectionModeButtons) {
        const active = button.dataset.detectionMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      this.updateInputMode(viewerMode);
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
    renderIdentity(
      snapshot: PlatformIdentityLookupSnapshot,
      histories: PlatformIdentityHistoryResult[],
    ): void {
      results.hidden = false;
      resultsHeading.textContent = 'Dash Platform Identity';
      resultsDescription.textContent = snapshot.identities.length === 0
        ? `${snapshot.inputLabel} · no registered Identity found`
        : 'Proof-verified state and indexed history';
      ledgerTitle.textContent = 'Identity details';
      ledgerOrder.textContent = `${snapshot.identities.length.toLocaleString()} proof-verified result(s)`;
      resultHelp.textContent = 'Use the local tabs to switch between overview and names, registered keys, unified activity, documents, contracts, withdrawals, and tokens without making another network request. Identity state, nonce, keys, key roles, key hashes, and DPNS names come from proof-verified DAPI queries. Explorer timestamps and history remain auxiliary indexed data.';
      const allKeys = snapshot.identities.flatMap(({ publicKeys }) => publicKeys);
      const totalBalance = snapshot.identities.reduce((total, { balanceCredits }) => total + balanceCredits, 0n);
      const verifiedNames = snapshot.identities.reduce((total, { dpnsNames }) => total + dpnsNames.length, 0);
      const matchedKeys = allKeys.filter(({ matchesLookup }) => matchesLookup).length;
      const proofHeight = snapshot.proofs.reduce((highest, { height }) => height > highest ? height : highest, 0n);
      summary.replaceChildren(
        stat('Identities found', snapshot.identities.length.toLocaleString(), '◇', true),
        stat('Combined current balance', formatPlatformCredits(totalBalance), '◎'),
        stat('Registered keys', allKeys.length.toLocaleString(), '⌁'),
        stat('Matched keys', matchedKeys.toLocaleString(), '✓'),
        stat('Verified DPNS names', verifiedNames.toLocaleString(), '@'),
        stat('Highest proof height', proofHeight.toLocaleString(), '↥'),
      );
      const failedHistories = histories.filter(({ error }) => error !== null);
      const disagreements = histories.filter(({ identifier, history }) => {
        if (history === null) return false;
        const identity = snapshot.identities.find((item) => item.identifier === identifier);
        return identity !== undefined && (
          identity.balanceCredits !== history.explorerBalanceCredits
          || identity.revision !== history.explorerRevision
          || (identity.nonce !== null && history.explorerNonce !== null && identity.nonce !== history.explorerNonce)
        );
      });
      completeness.classList.toggle(
        'viewer-completeness-warning',
        failedHistories.length > 0 || disagreements.length > 0,
      );
      const hashText = snapshot.publicKeyHashHex === null
        ? ''
        : ` Lookup registered-public-key HASH160 ${snapshot.publicKeyHashHex}.`;
      const nameText = snapshot.resolvedDpnsName === null
        ? ''
        : snapshot.resolvedDpnsDocumentId === null
          ? ` DPNS ${snapshot.resolvedDpnsName} resolved and reverse-confirmed by proof.`
          : ` DPNS ${snapshot.resolvedDpnsName} resolved with proof document ${snapshot.resolvedDpnsDocumentId}.`;
      const transactionText = snapshot.resolvedRegistrationTransactionHash === null
        ? ''
        : ` Registration transition ${snapshot.resolvedRegistrationTransactionHash} was decoded locally and its Identity owner was proof-verified.`;
      completeness.textContent = snapshot.identities.length === 0
        ? `No matching registered Identity was present in the proof-verified state.${hashText}${nameText}${transactionText}`
        : failedHistories.length > 0
          ? `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s). Indexed history failed for ${failedHistories.length.toLocaleString()} result(s); proof-verified state remains authoritative.${hashText}${nameText}${transactionText}`
          : disagreements.length > 0
            ? `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s). WARNING: ${disagreements.length.toLocaleString()} Explorer snapshot(s) disagree with current proof values; DAPI values take precedence.${hashText}${nameText}${transactionText}`
            : `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s), and synchronized Explorer balance/revision/nonce values agree where available.${hashText}${nameText}${transactionText}`;
      activityList.replaceChildren(
        ...snapshot.identities.flatMap((identity) => [
          identityResultHeading(identity),
          renderIdentityTabs(
            identity,
            histories.find(({ identifier }) => identifier === identity.identifier),
          ),
        ]),
      );
      if (snapshot.identities.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Identity matched this public identifier or key fingerprint.';
        activityList.append(empty);
      }
    },
    setDiagnosticMode(mode: ViewerMode | 'auto' | 'mixed', network: ViewerNetwork): void {
      diagnosticMode.textContent = `${mode} · ${network}`;
    },
    startDiagnostics(mode: ViewerMode | 'auto' | 'mixed', network: ViewerNetwork, source: string): void {
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
    recordRequests(count: number): void {
      requestCount += count;
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
      keyCapabilityInput.disabled = value || detectionMode !== 'advanced' || mode !== 'shielded';
      historyLimitInput.disabled = value || (detectionMode === 'advanced' && mode === 'shielded');
      batchConcurrencyInput.disabled = value || queryMode !== 'batch';
      viewingKeyInput.disabled = value;
      batchInput.disabled = value;
      revealButton.disabled = value;
      revealBatchButton.disabled = value;
      for (const button of modeButtons) button.disabled = value;
      for (const button of queryModeButtons) button.disabled = value;
      for (const button of detectionModeButtons) button.disabled = value;
      cancelButton.disabled = !value;
    },
    showCancellationRequested(mode: ViewerMode): void {
      cancelButton.disabled = true;
      statusBox.textContent = mode === 'shielded' && detectionMode === 'advanced'
        ? 'Cancellation requested; waiting for the current verified DAPI page…'
        : 'Cancellation requested; waiting for the current network operation…';
      statusBox.hidden = false;
    },
    toggleViewingKeyReveal(mode: ViewerMode): void {
      if (mode !== 'shielded' && detectionMode !== 'auto') return;
      if (queryMode === 'batch') {
        const revealing = batchInput.classList.contains('concealed');
        batchInput.classList.toggle('concealed', !revealing);
        revealBatchButton.textContent = revealing ? 'Hide keys' : 'Reveal keys';
        revealBatchButton.setAttribute('aria-pressed', String(revealing));
      } else {
        const revealing = viewingKeyInput.type === 'password';
        viewingKeyInput.type = revealing ? 'text' : 'password';
        revealButton.textContent = revealing ? 'Hide key' : 'Reveal key';
        revealButton.setAttribute('aria-pressed', String(revealing));
      }
    },
    resetViewer(mode: ViewerMode): void {
      viewingKeyInput.value = '';
      batchInput.value = '';
      viewingKeyInput.type = detectionMode === 'advanced' && mode === 'shielded' ? 'password' : 'text';
      batchInput.classList.toggle('concealed', detectionMode === 'advanced' && mode === 'shielded');
      revealButton.textContent = 'Reveal key';
      revealButton.setAttribute('aria-pressed', 'false');
      revealBatchButton.textContent = 'Reveal keys';
      revealBatchButton.setAttribute('aria-pressed', 'false');
      summary.replaceChildren();
      activityList.replaceChildren();
      batchResults.replaceChildren();
      batchResults.hidden = true;
      results.hidden = true;
      errorBox.textContent = '';
      errorBox.hidden = true;
      statusBox.textContent = '';
      statusBox.hidden = true;
      setDiagnosticState('idle', 'Idle');
      diagnosticMode.textContent = `${detectionMode === 'auto' ? 'auto' : mode} · ${networkInput.value}`;
      diagnosticSource.textContent = 'Not connected';
      diagnosticRequests.textContent = '0';
      diagnosticProof.textContent = '—';
      diagnosticRemoteTime.textContent = '—';
      diagnosticTiming.textContent = '—';
      diagnosticDetail.textContent = 'Enter an input and start a query. Failures are reported at the exact stage that stopped.';
      this.updateInputMode(mode);
    },
    setViewerMode(mode: ViewerMode): void {
      for (const button of modeButtons) {
        const active = button.dataset.viewerMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
    setQueryMode(mode: ViewerQueryMode, viewerMode: ViewerMode): void {
      queryMode = mode;
      singleInputPanel.hidden = mode !== 'single';
      batchInputPanel.hidden = mode !== 'batch';
      batchControls.hidden = mode !== 'batch';
      inputLabel.htmlFor = mode === 'batch' ? 'viewer-batch-input' : 'full-viewing-key';
      for (const button of queryModeButtons) {
        const active = button.dataset.queryMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      this.updateInputMode(viewerMode);
    },
    updateInputMode(mode: ViewerMode): void {
      const activeInput = queryMode === 'batch' ? batchInput.value : viewingKeyInput.value;
      const trimmed = activeInput.trim();
      const batchCount = queryMode === 'batch'
        ? new Set(batchInput.value.replaceAll('\r', '').split('\n').map((line) => line.trim()).filter(Boolean)).size
        : 1;
      const length = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '').length;
      const outgoingMode = keyCapabilityInput.value === 'outgoing';
      if (detectionMode === 'auto') {
        const values = queryMode === 'batch'
          ? batchInput.value.replaceAll('\r', '').split('\n').map((line) => line.trim()).filter(Boolean)
          : [trimmed];
        const containsOrchard = values.some(looksLikeAutoOrchardInput);
        privacyChip.lastChild!.textContent = containsOrchard
          ? ' Auto detection · viewing keys stay local'
          : ' Automatic local detection';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = queryMode !== 'single' || !containsOrchard;
        revealBatchButton.hidden = queryMode !== 'batch' || !containsOrchard;
        viewingKeyInput.type = containsOrchard && revealButton.getAttribute('aria-pressed') !== 'true'
          ? 'password'
          : 'text';
        batchInput.classList.toggle(
          'concealed',
          containsOrchard && revealBatchButton.getAttribute('aria-pressed') !== 'true',
        );
        viewingKeyInput.placeholder = 'Core, Platform, Identity, or Orchard viewing key';
        batchInput.placeholder = 'One Core, Platform, Identity, or Orchard input per line';
        inputLabel.replaceChildren(document.createTextNode('Any supported Dash lookup '), keyMode);
        keyMode.textContent = queryMode === 'batch'
          ? `${batchCount.toLocaleString()} input${batchCount === 1 ? '' : 's'} · mixed types allowed`
          : containsOrchard ? 'Orchard viewing key · local scan' : 'Auto detect';
        inputHelp.textContent = queryMode === 'batch'
          ? 'Enter one value per line. Core, Platform, Identity, and Orchard inputs may be mixed. Detection happens locally before networking; Orchard pages are fetched once for every detected viewing key.'
          : 'The type is detected locally before any request. Use Advanced to force a type, or prefixes such as core:, platform:, identity:, orchard-fvk:, orchard-ivk:, and orchard-ovk: for ambiguous values.';
        scanButtonLabel.textContent = queryMode === 'batch'
          ? 'Detect & load mixed batch'
          : 'Detect type & load activity';
        diagnosticMode.textContent = `auto · ${networkInput.value}`;
        return;
      }
      if (mode !== 'shielded') {
        batchInput.classList.remove('concealed');
        revealBatchButton.textContent = 'Reveal keys';
        revealBatchButton.setAttribute('aria-pressed', 'false');
      }
      if (mode === 'shielded') {
        privacyChip.lastChild!.textContent = ' Key processed locally';
        capabilityControls.hidden = false;
        historyField.hidden = true;
        revealButton.hidden = queryMode !== 'single';
        revealBatchButton.hidden = queryMode !== 'batch';
        viewingKeyInput.type = revealButton.getAttribute('aria-pressed') === 'true' ? 'text' : 'password';
        viewingKeyInput.placeholder = outgoingMode
          ? 'Paste OVK explicitly labeled Outgoing Viewing Key (64 hex)'
          : 'Paste viewing bundle, FVK (192), or IVK (128 hex)';
        batchInput.placeholder = outgoingMode
          ? 'One 64-hex OVK per line'
          : 'One viewing bundle, FVK, or IVK per line';
        batchInput.classList.toggle('concealed', revealBatchButton.getAttribute('aria-pressed') !== 'true');
        inputLabel.replaceChildren(document.createTextNode('Raw Orchard Viewing Key '), keyMode);
        inputHelp.replaceChildren(
          Object.assign(document.createElement('strong'), { textContent: '96-byte Full Viewing Key (FVK) is recommended: ' }),
          document.createTextNode(`it finds received and sent activity, derives note nullifiers, and identifies spent notes. IVK shows received notes only; OVK shows sent outputs only.${queryMode === 'batch' ? ' Enter one key or one-line viewing bundle per line; each verified pool page is reused across the batch.' : ''}`),
        );
        scanButtonLabel.textContent = queryMode === 'batch' ? 'Scan batch across shielded pool' : 'Scan complete shielded pool';
        if (queryMode === 'batch') keyMode.textContent = `${batchCount.toLocaleString()} viewing key${batchCount === 1 ? '' : 's'}`;
        else if (!outgoingMode && trimmed.startsWith('{')) keyMode.textContent = 'Viewing bundle · FVK';
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
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = networkInput.value === 'mainnet' ? 'Paste X… or 7… Dash Core address' : 'Paste y… or 8… testnet address';
        batchInput.placeholder = networkInput.value === 'mainnet'
          ? 'One X… or 7… Dash Core address per line'
          : 'One y… or 8… testnet address per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Core public address '), keyMode);
        keyMode.textContent = queryMode === 'batch' ? `${batchCount.toLocaleString()} public addresses` : 'Public L1 lookup';
        inputHelp.textContent = `Queries the Dash-specific DashScan index for Mainnet or Testnet. Its synchronization status and latest indexed block are checked first. ${queryMode === 'batch' ? 'Enter one address per line. ' : ''}Public addresses are sent to DashScan; no private or viewing key is used.`;
        scanButtonLabel.textContent = queryMode === 'batch' ? 'Load Core address batch' : 'Load Core address activity';
      } else if (mode === 'platform') {
        privacyChip.lastChild!.textContent = ' Proof + public history';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = networkInput.value === 'mainnet' ? 'Paste dash1k… Platform address' : 'Paste tdash1k… Platform address';
        batchInput.placeholder = networkInput.value === 'mainnet'
          ? 'One dash1k… Platform address per line'
          : 'One tdash1k… Platform address per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Platform payment address '), keyMode);
        keyMode.textContent = queryMode === 'batch' ? `${batchCount.toLocaleString()} Platform addresses` : 'DIP18 · proof verified';
        inputHelp.textContent = `Verifies current balance and outgoing nonce with a GroveDB proof, then loads synchronized address totals and transitions from Dash Platform Explorer. ${queryMode === 'batch' ? 'Enter one address per line. ' : ''}Public addresses are sent to both network services.`;
        scanButtonLabel.textContent = queryMode === 'batch' ? 'Verify Platform address batch' : 'Verify state & load Platform history';
      } else {
        privacyChip.lastChild!.textContent = ' Public Identity proof + history';
        capabilityControls.hidden = true;
        historyField.hidden = false;
        revealButton.hidden = true;
        revealBatchButton.hidden = true;
        viewingKeyInput.type = 'text';
        viewingKeyInput.placeholder = 'Identity ID, idhex:<hex>, tx:<registration hash>, key, or name';
        batchInput.placeholder = 'One Identity ID, name, HASH160, public key, or prefixed hash per line';
        inputLabel.replaceChildren(document.createTextNode('Dash Platform Identity lookup '), keyMode);
        if (queryMode === 'batch') keyMode.textContent = `${batchCount.toLocaleString()} Identity lookups`;
        else if (/^idhex:/iu.test(trimmed)) keyMode.textContent = 'Hex Identity ID · explicit public input';
        else if (/^(?:tx|transition):/iu.test(trimmed)) keyMode.textContent = 'Registration transition · local owner verification';
        else if (/^(?:0x)?[0-9a-f]{40}$/iu.test(trimmed)) keyMode.textContent = 'Registered public-key HASH160 · auto-detected';
        else if (/^(?:0x)?(?:02|03)[0-9a-f]{64}$/iu.test(trimmed)) keyMode.textContent = 'ECDSA public key · local HASH160';
        else if (/^(?:0x)?[0-9a-f]{96}$/iu.test(trimmed)) keyMode.textContent = 'BLS public key · local HASH160';
        else if (/\.dash$/iu.test(trimmed)) keyMode.textContent = 'DPNS name · proof resolved';
        else keyMode.textContent = 'Identity ID / public key';
        inputHelp.textContent = `Accepts ${queryMode === 'batch' ? 'one value per line: ' : ''}a public Base58 Identity ID, idhex:<64-hex Identity ID>, tx:<64-hex registration transition>, the 40-hex HASH160 fingerprint of a registered public key, a compressed ECDSA/BLS public key, or a DPNS name with or without .dash. Bare 64-hex input remains blocked because it could be a private key.`;
        scanButtonLabel.textContent = queryMode === 'batch' ? 'Verify Identity batch & load activity' : 'Verify Identity & load activity';
      }
      diagnosticMode.textContent = `${mode} · ${networkInput.value}`;
    },
    showSelfTestPassed(checks: readonly string[], blobWorkerDurationMs: number): void {
      selfTestStatus.classList.remove('checking', 'failed');
      selfTestStatus.classList.add('passed');
      selfTestStatus.textContent = 'Cryptographic self-test passed';
      selfTestDetails.textContent = `${checks.length + 1} runtime checks passed: ${checks.join(' · ')} · Blob Worker execution (${blobWorkerDurationMs.toLocaleString()} ms). Queries are enabled.`;
      runtimeStatus.textContent = 'Core, Platform, Identity & Orchard network reads · Orchard key processing local · Blob Worker verified';
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
