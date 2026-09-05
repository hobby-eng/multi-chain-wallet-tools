import { neutralizeSpreadsheetFormula } from '@ckd/export/csv.js';
import { formatDashCredits, formatDashDuffs } from '@ckd/core/dash-units.js';
import type { PlatformAddressHistorySnapshot } from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { PlatformIdentityLookupSnapshot } from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressSnapshot } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ViewerNetwork } from '@ckd/dash-network/types.js';
import writeExcelFile, { type Sheet, type SheetData } from 'write-excel-file/universal';

export type ViewerSingleExportState =
  | { mode: 'core'; network: ViewerNetwork; snapshot: CoreAddressSnapshot }
  | {
    mode: 'platform';
    network: ViewerNetwork;
    snapshot: PlatformAddressSnapshot;
    history: PlatformAddressHistorySnapshot;
  }
  | {
    mode: 'identity';
    network: ViewerNetwork;
    snapshot: PlatformIdentityLookupSnapshot;
    histories: PlatformIdentityHistoryResult[];
  }
  | { mode: 'shielded'; network: ViewerNetwork; snapshot: ActivitySnapshot };

export interface ViewerBatchExportItem {
  id: string;
  label: string;
  state: ViewerSingleExportState;
}

export interface ViewerBatchExportError {
  id: string;
  label: string;
  message: string;
  mode?: ViewerSingleExportState['mode'];
}

export interface ViewerBatchExportState {
  batch: true;
  mode: ViewerSingleExportState['mode'] | 'mixed';
  network: ViewerNetwork;
  items: ViewerBatchExportItem[];
  errors: ViewerBatchExportError[];
}

export type ViewerExportState = ViewerSingleExportState | ViewerBatchExportState;

export type ViewerTextExportFormat = 'csv' | 'json';
export type ViewerExportFormat = ViewerTextExportFormat | 'xlsx';

export interface ViewerExportFile {
  filename: string;
  mimeType: string;
  text: string;
}

export interface ViewerWorkbookExportFile {
  filename: string;
  mimeType: string;
  blob: Blob;
}

type CsvValue = string | number | bigint | boolean | null;
type WorkbookValue = string | number | boolean | null;

function exactJson(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function timestamp(value: number | bigint | null): string {
  if (value === null) return '';
  const numeric = typeof value === 'bigint' ? Number(value) : value;
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : '';
}

function csvCell(value: CsvValue): string {
  if (value === null) return '';
  // Only text is guarded: an exact integer rendered from bigint may legitimately
  // start with "-" and must stay a number for the reader.
  const text = typeof value === 'string' ? neutralizeSpreadsheetFormula(value) : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function csv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function directionFromNet(value: bigint): string {
  if (value > 0n) return 'received';
  if (value < 0n) return 'sent';
  return 'related';
}

const CSV_HEADER: CsvValue[] = [
  'schema_version', 'generated_at', 'mode', 'network', 'query_label', 'resource_id',
  'resource_name', 'record_type', 'record_id', 'source', 'timestamp', 'status', 'type',
  'subtype', 'direction', 'amount_atomic', 'amount_unit', 'amount_dash',
  'transaction_hash', 'block_height', 'public_key_hash', 'public_key', 'metadata',
];

interface CsvRecord {
  queryLabel: string;
  resourceId?: CsvValue;
  resourceName?: CsvValue;
  recordType: string;
  recordId?: CsvValue;
  source?: CsvValue;
  timestamp?: CsvValue;
  status?: CsvValue;
  type?: CsvValue;
  subtype?: CsvValue;
  direction?: CsvValue;
  amountAtomic?: bigint | null;
  amountUnit?: 'credits' | 'duffs';
  transactionHash?: CsvValue;
  blockHeight?: CsvValue;
  publicKeyHash?: CsvValue;
  publicKey?: CsvValue;
  metadata?: CsvValue;
}

function metadata(entries: ReadonlyArray<readonly [string, CsvValue | readonly string[] | undefined]>): string {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `${label}=${Array.isArray(value) ? value.join('; ') : String(value)}`)
    .join(' | ');
}

function amountDash(value: bigint | null | undefined, unit: CsvRecord['amountUnit']): string {
  if (value === null || value === undefined || unit === undefined) return '';
  const formatted = unit === 'duffs' ? formatDashDuffs(value, true) : formatDashCredits(value, true);
  return formatted.replace(/ DASH$/u, '');
}

function csvRecord(
  mode: ViewerBatchExportState['mode'],
  network: ViewerNetwork,
  generatedAt: string,
  record: CsvRecord,
): CsvValue[] {
  return [
    '2', generatedAt, mode, network, record.queryLabel, record.resourceId ?? null,
    record.resourceName ?? null, record.recordType, record.recordId ?? null, record.source ?? null,
    record.timestamp ?? null, record.status ?? null, record.type ?? null, record.subtype ?? null,
    record.direction ?? null, record.amountAtomic ?? null, record.amountUnit ?? null,
    amountDash(record.amountAtomic, record.amountUnit), record.transactionHash ?? null,
    record.blockHeight ?? null, record.publicKeyHash ?? null, record.publicKey ?? null,
    record.metadata ?? null,
  ];
}

function coreRows(state: Extract<ViewerSingleExportState, { mode: 'core' }>, generatedAt: string): CsvValue[][] {
  const { snapshot } = state;
  const queryLabel = snapshot.address;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: snapshot.address, resourceName: snapshot.address,
      recordType: 'address_summary', recordId: snapshot.address, source: snapshot.provider,
      timestamp: timestamp(snapshot.indexedTimeMs), status: snapshot.indexStatus, type: 'CORE_ADDRESS',
      direction: 'related', amountAtomic: snapshot.balanceDuffs, amountUnit: 'duffs',
      blockHeight: snapshot.indexedHeight,
      metadata: metadata([
        ['unconfirmed_duffs', snapshot.unconfirmedDuffs],
        ['total_received_duffs', snapshot.totalReceivedDuffs],
        ['total_sent_duffs', snapshot.totalSentDuffs],
        ['transaction_count', snapshot.transactionCount],
        ['history_limit', snapshot.historyLimit],
        ['requests', snapshot.requests],
      ]),
    }),
    ...snapshot.transactions.map((transaction) => csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: snapshot.address, resourceName: snapshot.address,
      recordType: 'transaction', recordId: transaction.txid, source: snapshot.provider,
      timestamp: timestamp(transaction.timestampMs), status: transaction.chainLocked
        ? 'chain_locked'
        : transaction.instantLocked ? 'instant_locked' : 'confirmed',
      type: transaction.type, direction: directionFromNet(transaction.netDuffs),
      amountAtomic: transaction.netDuffs, amountUnit: 'duffs',
      transactionHash: transaction.txid, blockHeight: transaction.blockHeight,
      metadata: metadata([
        ['confirmations', transaction.confirmations],
        ['instant_locked', transaction.instantLocked],
        ['chain_locked', transaction.chainLocked],
        ['received_duffs', transaction.receivedDuffs],
        ['spent_input_duffs', transaction.spentInputDuffs],
        ['fee_duffs', transaction.feeDuffs],
        ['block_hash', transaction.blockHash],
      ]),
    })),
  ];
  return [CSV_HEADER, ...records];
}

function platformRows(state: Extract<ViewerSingleExportState, { mode: 'platform' }>, generatedAt: string): CsvValue[][] {
  const { snapshot, history } = state;
  const agrees = snapshot.balanceCredits === history.explorerBalanceCredits
    && snapshot.nonce === BigInt(history.explorerNonce);
  const queryLabel = snapshot.address;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: snapshot.address, resourceName: history.base58Address ?? snapshot.address,
      recordType: 'address_summary', recordId: snapshot.address, source: 'Dash Platform DAPI + Dash Platform Explorer',
      timestamp: timestamp(history.indexedTimeMs), status: agrees ? 'proof_and_index_agree' : 'proof_takes_precedence',
      type: 'PLATFORM_ADDRESS', direction: 'related', amountAtomic: snapshot.balanceCredits,
      amountUnit: 'credits', blockHeight: snapshot.proofHeight,
      metadata: metadata([
        ['exists', snapshot.exists],
        ['legacy_alias', history.base58Address],
        ['outgoing_nonce', snapshot.nonce],
        ['dapi_proof_height', snapshot.proofHeight],
        ['core_chain_locked_height', snapshot.coreChainLockedHeight],
        ['protocol_version', snapshot.protocolVersion],
        ['explorer_balance_credits', history.explorerBalanceCredits],
        ['explorer_nonce', history.explorerNonce],
        ['platform_index_height', history.indexedHeight],
        ['total_incoming_credits', history.totalIncomingCredits],
        ['total_outgoing_credits', history.totalOutgoingCredits],
        ['transition_count', history.totalTransitions],
        ['incoming_transitions', history.incomingTransitions],
        ['outgoing_transitions', history.outgoingTransitions],
        ['history_limit', history.historyLimit],
        ['requests', history.requests + 1],
      ]),
    }),
    ...history.transitions.map((transition) => csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: snapshot.address, resourceName: history.base58Address ?? snapshot.address,
      recordType: 'transition', recordId: transition.hash, source: history.provider,
      timestamp: timestamp(transition.timestampMs), status: transition.status, type: transition.type,
      subtype: transition.batchType, direction: transition.incoming ? 'incoming' : 'outgoing',
      transactionHash: transition.hash, blockHeight: transition.blockHeight,
      metadata: metadata([
        ['error', transition.error],
        ['gas_used_credits', transition.gasUsed],
        ['block_hash', transition.blockHash],
      ]),
    })),
  ];
  return [CSV_HEADER, ...records];
}

function shieldedRows(state: Extract<ViewerSingleExportState, { mode: 'shielded' }>, generatedAt: string): CsvValue[][] {
  const { snapshot } = state;
  const queryLabel = `${snapshot.keyKind} viewing key`;
  const records = [
    csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: 'shielded-pool', resourceName: queryLabel,
      recordType: 'scan_summary', recordId: 'shielded-pool', source: 'Dash Platform DAPI proof',
      status: snapshot.complete ? 'complete' : 'partial', type: 'ORCHARD_SCAN', direction: 'related',
      amountAtomic: snapshot.balance, amountUnit: 'credits', blockHeight: snapshot.proofHeight,
      metadata: metadata([
        ['key_capability', snapshot.keyKind],
        ['protocol_version', snapshot.protocolVersion],
        ['pool_actions_scanned', snapshot.scannedNotes],
        ['external_received_credits', snapshot.receivedExternal],
        ['external_sent_credits', snapshot.sentExternal],
        ['self_change_credits', snapshot.selfOrChange],
      ]),
    }),
    ...snapshot.records.map((record) => {
    const note = record.incoming ?? record.outgoing;
      return csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: note?.address ?? 'shielded-pool',
        resourceName: note?.address ?? 'Recovered Orchard note',
        recordType: 'note', recordId: record.position, source: 'Local Orchard recovery',
        status: record.spent === undefined ? 'unknown' : record.spent ? 'spent' : 'spendable',
        type: 'ORCHARD_NOTE', direction: record.direction, amountAtomic: note?.value ?? null,
        amountUnit: 'credits', blockHeight: snapshot.proofHeight,
        metadata: metadata([
          ['pool_position', record.position],
          ['memo', note?.memo],
          ['spent_at_position', record.spentAtPosition],
          ['note_commitment', record.cmx],
          ['action_nullifier', record.actionNullifier],
          ['note_nullifier', note?.noteNullifier],
        ]),
      });
    }),
  ];
  return [CSV_HEADER, ...records];
}

function identityRows(state: Extract<ViewerSingleExportState, { mode: 'identity' }>, generatedAt: string): CsvValue[][] {
  const proofHeights = [...new Set(state.snapshot.proofs.map(({ height }) => height.toString()))].join(' ');
  const queryLabel = state.snapshot.resolvedDpnsName ?? state.snapshot.inputLabel;
  const rows: CsvValue[][] = [csvRecord(state.mode, state.network, generatedAt, {
    queryLabel,
    resourceName: state.snapshot.resolvedDpnsName,
    recordType: 'query',
    recordId: state.snapshot.inputKind,
    source: 'Dash Platform DAPI proof',
    status: state.snapshot.identities.length === 0 ? 'not_found' : 'verified',
    type: state.snapshot.inputKind,
    metadata: metadata([
      ['input_label', state.snapshot.inputLabel],
      ['lookup_public_key_hash', state.snapshot.publicKeyHashHex],
      ['resolved_dpns_document_id', state.snapshot.resolvedDpnsDocumentId],
      ['resolved_registration_transaction_hash', state.snapshot.resolvedRegistrationTransactionHash],
      ['proof_heights', proofHeights],
      ['proof_response_count', state.snapshot.proofs.length],
      ['requests', state.snapshot.requests],
    ]),
  })];
  for (const identity of state.snapshot.identities) {
    const historyResult = state.histories.find(({ identifier }) => identifier === identity.identifier);
    const history = historyResult?.history ?? null;
    const identityName = identity.dpnsNames[0] ?? identity.identifier;
    rows.push(csvRecord(state.mode, state.network, generatedAt, {
      queryLabel, resourceId: identity.identifier, resourceName: identityName,
      recordType: 'identity', recordId: identity.identifier,
      source: history === null ? 'Dash Platform DAPI proof' : 'Dash Platform DAPI proof + Dash Platform Explorer',
      timestamp: timestamp(history?.registeredAtMs ?? null),
      status: historyResult?.error === null || historyResult === undefined ? 'verified' : 'proof_verified_history_unavailable',
      type: history?.registrationType ?? 'IDENTITY', subtype: history?.registrationFundingSource ?? null,
      direction: 'related', amountAtomic: identity.balanceCredits, amountUnit: 'credits',
      transactionHash: history?.registrationTransactionHash ?? null, blockHeight: history?.indexedHeight ?? null,
      metadata: metadata([
        ['identity_id_hex', identity.identifierHex],
        ['dapi_revision', identity.revision],
        ['dapi_nonce', identity.nonce],
        ['proof_verified_dpns_names', identity.dpnsNames],
        ['registered_at', timestamp(history?.registeredAtMs ?? null)],
        ['funding_core_transaction_hash', history?.fundingCoreTransactionHash],
        ['funding_core_transaction_output_index', history?.fundingCoreTransactionOutputIndex],
        ['funding_core_transaction_error', history?.fundingCoreTransactionError],
        ['system_identity', history?.systemIdentity],
        ['registered_key_count', identity.publicKeys.length],
        ['explorer_balance_credits', history?.explorerBalanceCredits],
        ['explorer_revision', history?.explorerRevision],
        ['explorer_nonce', history?.explorerNonce],
        ['total_transactions', history?.totalTransactions],
        ['total_transfers', history?.totalTransfers],
        ['total_documents', history?.totalDocuments],
        ['total_data_contracts', history?.totalDataContracts],
        ['total_gas_spent_credits', history?.totalGasSpentCredits],
        ['average_gas_spent_credits', history?.averageGasSpentCredits],
        ['explorer_reported_top_up_count', history?.totalTopUps],
        ['explorer_reported_top_up_credits', history?.totalTopUpsCredits],
        ['total_withdrawals', history?.totalWithdrawals],
        ['total_withdrawal_credits', history?.totalWithdrawalsCredits],
        ['last_withdrawal_hash', history?.lastWithdrawalHash],
        ['last_withdrawal_at', timestamp(history?.lastWithdrawalTimestampMs ?? null)],
        ['explorer_index_status', history?.indexStatus],
        ['explorer_indexed_at', timestamp(history?.indexedTimeMs ?? null)],
        ['history_limit', history?.historyLimit],
        ['history_requests', history?.requests],
        ['history_error', historyResult?.error],
      ]),
    }));
    for (const key of identity.publicKeys) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'public_key', recordId: key.keyId, source: 'Dash Platform DAPI proof',
        timestamp: timestamp(key.disabledAtMs), status: key.disabledAtMs === null ? 'active' : 'disabled',
        type: key.purpose, subtype: `${key.securityLevel}/${key.keyType}`, direction: 'related',
        publicKeyHash: key.publicKeyHashHex, publicKey: key.dataHex,
        metadata: metadata([
          ['purpose_number', key.purposeNumber],
          ['security_level_number', key.securityLevelNumber],
          ['key_type_number', key.keyTypeNumber],
          ['read_only', key.readOnly],
          ['is_master', key.isMaster],
          ['matches_lookup', key.matchesLookup],
          ['contract_bounds', key.contractBounds === null ? null : JSON.stringify(key.contractBounds, exactJson)],
        ]),
      }));
    }
    if (history === null) continue;
    for (const alias of history.aliases) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'alias', recordId: alias.documentId, source: history.provider,
        timestamp: timestamp(alias.timestampMs), status: alias.status, type: 'DPNS_ALIAS',
        direction: 'related', transactionHash: alias.transactionHash,
        metadata: metadata([['name', alias.name], ['contested', alias.contested]]),
      }));
    }
    for (const event of history.activity) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'activity', recordId: event.transactionHash, source: history.provider,
        timestamp: timestamp(event.timestampMs), status: event.status, type: event.type,
        subtype: event.batchType, direction: event.direction, amountAtomic: event.netAmountCredits,
        amountUnit: 'credits', transactionHash: event.transactionHash, blockHeight: event.blockHeight,
        metadata: metadata([
          ['error', event.error],
          ['block_hash', event.blockHash],
          ['gas_used_credits', event.gasUsedCredits],
        ]),
      }));
      event.transfers.forEach((transfer, index) => {
        rows.push(csvRecord(state.mode, state.network, generatedAt, {
          queryLabel, resourceId: identity.identifier, resourceName: identityName,
          recordType: 'transfer', recordId: `${event.transactionHash}:${index}`, source: history.provider,
          timestamp: timestamp(event.timestampMs), status: event.status, type: 'CREDIT_TRANSFER',
          direction: transfer.direction, amountAtomic: transfer.amountCredits, amountUnit: 'credits',
          transactionHash: event.transactionHash, blockHeight: event.blockHeight,
          metadata: metadata([['sender', transfer.sender], ['recipient', transfer.recipient]]),
        }));
      });
    }
    for (const document of history.documents) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'document', recordId: document.identifier, source: history.provider,
        timestamp: timestamp(document.timestampMs), status: document.deleted ? 'deleted' : 'current',
        type: 'DOCUMENT', subtype: document.documentTypeName, direction: 'related',
        transactionHash: document.transactionHash,
        metadata: metadata([
          ['data_contract_id', document.dataContractIdentifier],
          ['revision', document.revision],
          ['system', document.system],
        ]),
      }));
    }
    for (const contract of history.dataContracts) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'data_contract', recordId: contract.identifier, source: history.provider,
        timestamp: timestamp(contract.timestampMs), status: contract.system ? 'system' : 'user',
        type: 'DATA_CONTRACT', subtype: contract.name, direction: 'related',
        transactionHash: contract.transactionHash,
        metadata: metadata([
          ['version', contract.version],
          ['documents_count', contract.documentsCount],
          ['tokens_count', contract.tokensCount],
          ['description', contract.description],
          ['keywords', contract.keywords],
        ]),
      }));
    }
    for (const withdrawal of history.withdrawals) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'withdrawal', recordId: withdrawal.documentId, source: history.provider,
        timestamp: timestamp(withdrawal.timestampMs), status: withdrawal.status,
        type: 'IDENTITY_CREDIT_WITHDRAWAL', direction: 'outgoing',
        amountAtomic: withdrawal.amountCredits, amountUnit: 'credits',
        transactionHash: withdrawal.coreTransactionHash,
        metadata: metadata([['withdrawal_address', withdrawal.withdrawalAddress]]),
      }));
    }
    for (const token of history.tokens) {
      rows.push(csvRecord(state.mode, state.network, generatedAt, {
        queryLabel, resourceId: identity.identifier, resourceName: identityName,
        recordType: 'token', recordId: token.identifier, source: history.provider,
        timestamp: timestamp(token.timestampMs), type: 'TOKEN', subtype: token.name,
        direction: 'related', amountAtomic: token.totalSupply, amountUnit: 'credits',
        metadata: metadata([
          ['data_contract_id', token.dataContractIdentifier],
          ['position', token.position],
          ['description', token.description],
          ['base_supply', token.baseSupply],
          ['max_supply', token.maxSupply],
          ['decimals', token.decimals],
          ['mintable', token.mintable],
          ['burnable', token.burnable],
          ['freezable', token.freezable],
          ['destroyable', token.destroyable],
        ]),
      }));
    }
  }
  return [CSV_HEADER, ...rows];
}

function groupedIdentityProofs(snapshot: PlatformIdentityLookupSnapshot): unknown[] {
  const grouped = new Map<string, { proof: PlatformIdentityLookupSnapshot['proofs'][number]; responseCount: number }>();
  for (const proof of snapshot.proofs) {
    const key = [
      proof.height,
      proof.coreChainLockedHeight,
      proof.protocolVersion,
      proof.responseTimeMs,
    ].join(':');
    const existing = grouped.get(key);
    if (existing === undefined) grouped.set(key, { proof, responseCount: 1 });
    else existing.responseCount += 1;
  }
  return [...grouped.values()].map(({ proof, responseCount }) => ({ ...proof, responseCount }));
}

function identityJsonData(state: Extract<ViewerSingleExportState, { mode: 'identity' }>): unknown {
  const { snapshot } = state;
  return {
    query: {
      kind: snapshot.inputKind,
      label: snapshot.inputLabel,
      publicKeyHashHex: snapshot.publicKeyHashHex,
      resolvedDpnsName: snapshot.resolvedDpnsName,
      resolvedDpnsDocumentId: snapshot.resolvedDpnsDocumentId,
      resolvedRegistrationTransactionHash: snapshot.resolvedRegistrationTransactionHash,
      requests: snapshot.requests,
      proofs: groupedIdentityProofs(snapshot),
    },
    identities: snapshot.identities.map((identity) => {
      const result = state.histories.find(({ identifier }) => identifier === identity.identifier);
      const history = result?.history ?? null;
      if (history === null) {
        return {
          identifier: identity.identifier,
          identifierHex: identity.identifierHex,
          names: identity.dpnsNames,
          state: {
            balanceCredits: identity.balanceCredits,
            revision: identity.revision,
            nonce: identity.nonce,
          },
          keys: identity.publicKeys,
          history: null,
          historyError: result?.error ?? null,
        };
      }
      return {
        identifier: identity.identifier,
        identifierHex: identity.identifierHex,
        names: identity.dpnsNames,
        state: {
          balanceCredits: identity.balanceCredits,
          revision: identity.revision,
          nonce: identity.nonce,
        },
        keys: identity.publicKeys,
        history: {
          source: {
            provider: history.provider,
            endpoint: history.endpoint,
            indexStatus: history.indexStatus,
            indexedHeight: history.indexedHeight,
            indexedTimeMs: history.indexedTimeMs,
            requests: history.requests,
          },
          explorerState: {
            owner: history.owner,
            balanceCredits: history.explorerBalanceCredits,
            revision: history.explorerRevision,
            nonce: history.explorerNonce,
            systemIdentity: history.systemIdentity,
          },
          registration: {
            timestampMs: history.registeredAtMs,
            type: history.registrationType,
            transactionHash: history.registrationTransactionHash,
            fundingSource: history.registrationFundingSource,
            coreTransactionHash: history.fundingCoreTransactionHash,
            coreTransactionOutputIndex: history.fundingCoreTransactionOutputIndex,
            coreTransactionError: history.fundingCoreTransactionError,
          },
          totals: {
            transactions: history.totalTransactions,
            transfers: history.totalTransfers,
            documents: history.totalDocuments,
            dataContracts: history.totalDataContracts,
            gasSpentCredits: history.totalGasSpentCredits,
            averageGasSpentCredits: history.averageGasSpentCredits,
            explorerReportedTopUps: history.totalTopUps,
            explorerReportedTopUpCredits: history.totalTopUpsCredits,
            withdrawals: history.totalWithdrawals,
            withdrawalCredits: history.totalWithdrawalsCredits,
            lastWithdrawalHash: history.lastWithdrawalHash,
            lastWithdrawalTimestampMs: history.lastWithdrawalTimestampMs,
          },
          aliases: history.aliases,
          activity: history.activity,
          documents: history.documents,
          dataContracts: history.dataContracts,
          withdrawals: history.withdrawals,
          tokens: history.tokens,
          historyLimit: history.historyLimit,
        },
        historyError: result?.error ?? null,
      };
    }),
  };
}

function jsonData(state: ViewerSingleExportState): unknown {
  if (state.mode === 'identity') return identityJsonData(state);
  if (state.mode === 'platform') {
    const { snapshot, history } = state;
    return {
      address: snapshot.address,
      state: {
        exists: snapshot.exists,
        balanceCredits: snapshot.balanceCredits,
        nonce: snapshot.nonce,
        proofHeight: snapshot.proofHeight,
        coreChainLockedHeight: snapshot.coreChainLockedHeight,
        protocolVersion: snapshot.protocolVersion,
        responseTimeMs: snapshot.responseTimeMs,
      },
      history: {
        provider: history.provider,
        endpoint: history.endpoint,
        base58Address: history.base58Address,
        totals: {
          transitions: history.totalTransitions,
          incomingTransitions: history.incomingTransitions,
          outgoingTransitions: history.outgoingTransitions,
          incomingCredits: history.totalIncomingCredits,
          outgoingCredits: history.totalOutgoingCredits,
        },
        explorerState: {
          balanceCredits: history.explorerBalanceCredits,
          nonce: history.explorerNonce,
        },
        transitions: history.transitions,
        historyLimit: history.historyLimit,
        indexStatus: history.indexStatus,
        indexedHeight: history.indexedHeight,
        indexedTimeMs: history.indexedTimeMs,
        requests: history.requests,
      },
    };
  }
  if (state.mode === 'core') {
    const { snapshot } = state;
    return {
      address: snapshot.address,
      provider: snapshot.provider,
      endpoint: snapshot.endpoint,
      balance: {
        confirmedDuffs: snapshot.balanceDuffs,
        unconfirmedDuffs: snapshot.unconfirmedDuffs,
        totalReceivedDuffs: snapshot.totalReceivedDuffs,
        totalSentDuffs: snapshot.totalSentDuffs,
      },
      transactionCount: snapshot.transactionCount,
      transactions: snapshot.transactions,
      historyLimit: snapshot.historyLimit,
      indexStatus: snapshot.indexStatus,
      indexedHeight: snapshot.indexedHeight,
      indexedTimeMs: snapshot.indexedTimeMs,
      requests: snapshot.requests,
    };
  }
  return {
    keyCapability: state.snapshot.keyKind,
    complete: state.snapshot.complete,
    summary: {
      scannedNotes: state.snapshot.scannedNotes,
      proofHeight: state.snapshot.proofHeight,
      protocolVersion: state.snapshot.protocolVersion,
      balanceCredits: state.snapshot.balance,
      externalReceivedCredits: state.snapshot.receivedExternal,
      externalSentCredits: state.snapshot.sentExternal,
      selfChangeCredits: state.snapshot.selfOrChange,
    },
    notes: state.snapshot.records,
  };
}

function fileStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

function singleRows(state: ViewerSingleExportState, generatedAt: string): CsvValue[][] {
  return state.mode === 'core'
    ? coreRows(state, generatedAt)
    : state.mode === 'platform'
      ? platformRows(state, generatedAt)
      : state.mode === 'identity'
        ? identityRows(state, generatedAt)
        : shieldedRows(state, generatedAt);
}

function isBatchExportState(state: ViewerExportState): state is ViewerBatchExportState {
  return 'batch' in state && state.batch;
}

function exportError(
  error: ViewerBatchExportError,
  fallbackMode?: ViewerBatchExportState['mode'],
): ViewerBatchExportError {
  const mode = error.mode ?? (fallbackMode === 'mixed' ? undefined : fallbackMode);
  const ordinal = Number(error.id.replace(/\D/gu, ''));
  if (mode === undefined) {
    return {
      id: error.id,
      label: `${Number.isFinite(ordinal) ? ordinal : '?'} · AUTO · invalid input`,
      message: 'Automatic input detection failed. Raw input is omitted from exports.',
    };
  }
  if (mode !== 'shielded') return error;
  return {
    id: error.id,
    label: `${Number.isFinite(ordinal) ? ordinal : '?'} · ORCHARD · viewing key`,
    message: 'Orchard lookup failed. Viewing-key input is omitted from exports.',
    mode,
  };
}

export function createViewerExport(
  state: ViewerExportState,
  format: ViewerTextExportFormat,
  generatedAt = new Date(),
): ViewerExportFile {
  const generatedAtIso = generatedAt.toISOString();
  const batch = isBatchExportState(state);
  const filename = `wallet-activity-viewer-${state.mode}${batch ? '-batch' : ''}-${state.network}-${fileStamp(generatedAt)}.${format}`;
  if (format === 'json') {
    const data = isBatchExportState(state)
      ? {
          batch: {
            requested: state.items.length + state.errors.length,
            succeeded: state.items.length,
            failed: state.errors.length,
          },
          results: state.items.map((item) => ({
            id: item.id,
            label: item.label,
            mode: item.state.mode,
            data: jsonData(item.state),
          })),
          errors: state.errors.map((error) => exportError(error, state.mode)),
        }
      : jsonData(state);
    return {
      filename,
      mimeType: 'application/json',
      text: `${JSON.stringify({
        schema: 'wallet-activity-viewer-export',
        version: 2,
        generatedAt: generatedAtIso,
        mode: state.mode,
        network: state.network,
        data,
      }, exactJson, 2)}\n`,
    };
  }
  const rows = isBatchExportState(state)
    ? [
        CSV_HEADER,
        ...state.items.flatMap((item) => singleRows(item.state, generatedAtIso).slice(1).map((row) => {
          const labeled = [...row];
          labeled[4] = item.label;
          return labeled;
        })),
        ...state.errors.map((sourceError) => {
          const error = exportError(sourceError, state.mode);
          return csvRecord(state.mode, state.network, generatedAtIso, {
          queryLabel: error.label,
          recordType: 'error',
          recordId: error.id,
          status: 'failed',
          metadata: metadata([['message', error.message]]),
          });
        }),
      ]
    : singleRows(state, generatedAtIso);
  return { filename, mimeType: 'text/csv', text: csv(rows) };
}

function workbookCell(value: CsvValue): WorkbookValue {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function worksheetRows(
  state: ViewerSingleExportState,
  generatedAt: string,
  label?: string,
): CsvValue[][] {
  return singleRows(state, generatedAt).slice(1).map((row) => {
    if (label === undefined) return row;
    const labeled = [...row];
    labeled[4] = state.mode === 'shielded'
      ? shieldedWorkbookLabel(label, state.snapshot.keyKind)
      : label;
    return labeled;
  });
}

function compactDetailRows(rows: CsvValue[][]): CsvValue[][] {
  const blockHeightIndex = CSV_HEADER.indexOf('block_height');
  const normalized = rows.map((row) => row.map((value, index) => (
    index === blockHeightIndex && value !== null ? String(value) : value
  )));
  const includedColumns = CSV_HEADER
    .map((_header, index) => index)
    .filter((index) => normalized.some((row) => row[index] !== null && row[index] !== ''));
  return [
    includedColumns.map((index) => CSV_HEADER[index]!),
    ...normalized.map((row) => includedColumns.map((index) => row[index]!)),
  ];
}

function shieldedWorkbookLabel(label: string, keyKind: ActivitySnapshot['keyKind']): string {
  const ordinal = label.match(/^\d+/u)?.[0];
  return `${ordinal === undefined ? '' : `${ordinal} · `}ORCHARD · ${keyKind.toUpperCase()} viewing key`;
}

function workbookItems(state: ViewerExportState): ViewerBatchExportItem[] {
  if (isBatchExportState(state)) return state.items;
  const label = state.mode === 'core'
    ? state.snapshot.address
    : state.mode === 'platform'
      ? state.snapshot.address
      : state.mode === 'identity'
        ? state.snapshot.resolvedDpnsName ?? state.snapshot.inputLabel
        : 'ORCHARD · viewing key';
  return [{
    id: 'query-1',
    label,
    state,
  }];
}

function workbookErrors(state: ViewerExportState): ViewerBatchExportError[] {
  return isBatchExportState(state)
    ? state.errors.map((error) => exportError(error, state.mode))
    : [];
}

function summaryRow(item: ViewerBatchExportItem, recordCount: number): CsvValue[] {
  const state = item.state;
  if (state.mode === 'core') {
    return [
      item.id, item.label, state.mode, state.network, state.snapshot.indexStatus, state.snapshot.address,
      state.snapshot.balanceDuffs, 'duffs', recordCount,
    ];
  }
  if (state.mode === 'platform') {
    const agrees = state.snapshot.balanceCredits === state.history.explorerBalanceCredits
      && state.snapshot.nonce === BigInt(state.history.explorerNonce);
    return [
      item.id, item.label, state.mode, state.network,
      agrees ? 'proof_and_index_agree' : 'proof_takes_precedence',
      state.snapshot.address, state.snapshot.balanceCredits, 'credits', recordCount,
    ];
  }
  if (state.mode === 'identity') {
    const identities = state.snapshot.identities;
    const resource = identities
      .map((identity) => identity.dpnsNames[0] ?? identity.identifier)
      .join('; ') || state.snapshot.resolvedDpnsName || state.snapshot.inputLabel;
    const balance = identities.reduce((total, identity) => total + identity.balanceCredits, 0n);
    const status = identities.length === 0 ? 'not_found' : 'verified';
    return [item.id, item.label, state.mode, state.network, status, resource, balance, 'credits', recordCount];
  }
  return [
    item.id, shieldedWorkbookLabel(item.label, state.snapshot.keyKind), state.mode, state.network,
    state.snapshot.complete ? 'complete' : 'partial', 'Orchard shielded pool',
    state.snapshot.balance, 'credits', recordCount,
  ];
}

function addWorkbookSheet(
  sheets: Sheet<Blob>[],
  name: string,
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
): void {
  if (rows.length === 0) return;
  const data: SheetData = rows.map((row, rowIndex) => row.map((value) => {
    const cell = workbookCell(value);
    if (rowIndex !== 0) return cell;
    return {
      value: cell === null ? '' : cell,
      type: typeof cell === 'number'
        ? Number
        : typeof cell === 'boolean'
          ? Boolean
          : String,
      fontWeight: 'bold',
      textColor: '#ffffff',
      backgroundColor: '#1f2933',
      alignVertical: 'center',
      wrap: true,
      height: 24,
    };
  }));
  const columns = rows[0]!.map((_value, index) => {
    const width = rows.reduce((maximum, row) => {
      const value = row[index];
      return Math.max(maximum, value === null || value === undefined ? 0 : String(value).length);
    }, 0);
    return { width: Math.min(Math.max(width + 2, 12), 56) };
  });
  sheets.push({ data, sheet: name, columns, stickyRowsCount: 1 });
}

export async function createViewerWorkbookExport(
  state: ViewerExportState,
  generatedAt = new Date(),
): Promise<ViewerWorkbookExportFile> {
  const generatedAtIso = generatedAt.toISOString();
  const batch = isBatchExportState(state);
  const items = workbookItems(state);
  const errors = workbookErrors(state);
  const sheets: Sheet<Blob>[] = [];
  const preparedItems = items.map((item) => ({
    item,
    rows: worksheetRows(item.state, generatedAtIso, batch ? item.label : undefined),
  }));

  const summaryRows: CsvValue[][] = [[
    'query_id', 'query_label', 'mode', 'network', 'status', 'resource',
    'balance_atomic', 'balance_unit', 'record_count',
  ]];
  summaryRows.push(...preparedItems.map(({ item, rows }) => summaryRow(item, rows.length)));
  summaryRows.push(...errors.map((error) => [
    error.id, error.label, error.mode ?? state.mode, state.network, 'failed', '',
    '', '', 0,
  ]));
  addWorkbookSheet(sheets, 'Summary', summaryRows);

  const addresses = preparedItems
    .filter(({ item }) => item.state.mode === 'core' || item.state.mode === 'platform')
    .flatMap(({ rows }) => rows);
  const identities = preparedItems
    .filter(({ item }) => item.state.mode === 'identity')
    .flatMap(({ rows }) => rows);
  const orchard = preparedItems
    .filter(({ item }) => item.state.mode === 'shielded')
    .flatMap(({ rows }) => rows);
  addWorkbookSheet(sheets, 'Addresses', addresses.length === 0 ? [] : compactDetailRows(addresses));
  addWorkbookSheet(sheets, 'Identities', identities.length === 0 ? [] : compactDetailRows(identities));
  addWorkbookSheet(sheets, 'Orchard', orchard.length === 0 ? [] : compactDetailRows(orchard));
  addWorkbookSheet(sheets, 'Errors', errors.length === 0 ? [] : [
    ['query_id', 'query_label', 'mode', 'network', 'status', 'message'],
    ...errors.map((error) => [
      error.id, error.label, error.mode ?? state.mode, state.network, 'failed', error.message,
    ]),
  ]);

  const blob = await writeExcelFile(sheets, {
    fontFamily: 'Arial',
    fontSize: 10,
  }).toBlob();
  return {
    filename: `wallet-activity-viewer-${state.mode}${batch ? '-batch' : ''}-${state.network}-${fileStamp(generatedAt)}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    blob,
  };
}
