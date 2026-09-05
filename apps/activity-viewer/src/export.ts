import { neutralizeSpreadsheetFormula } from '@ckd/export/csv.js';
import type { PlatformAddressHistorySnapshot } from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { PlatformIdentityLookupSnapshot } from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressSnapshot } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ViewerNetwork } from '@ckd/dash-network/types.js';

export type ViewerExportState =
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

export type ViewerExportFormat = 'csv' | 'json';

export interface ViewerExportFile {
  filename: string;
  mimeType: string;
  text: string;
}

type CsvValue = string | number | bigint | boolean | null;

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

function coreRows(state: Extract<ViewerExportState, { mode: 'core' }>, generatedAt: string): CsvValue[][] {
  const { snapshot } = state;
  const header: CsvValue[] = [
    'schema_version', 'generated_at', 'mode', 'network', 'provider', 'address', 'indexed_height',
    'indexed_time', 'balance_duffs', 'unconfirmed_duffs', 'total_received_duffs', 'total_sent_duffs',
    'transaction_count', 'record_type', 'txid', 'direction', 'timestamp', 'type', 'block_height',
    'confirmations', 'instant_locked', 'chain_locked', 'received_duffs', 'spent_input_duffs',
    'net_duffs', 'fee_duffs', 'block_hash',
  ];
  const common: CsvValue[] = [
    '1', generatedAt, state.mode, state.network, snapshot.provider, snapshot.address,
    snapshot.indexedHeight, timestamp(snapshot.indexedTimeMs), snapshot.balanceDuffs,
    snapshot.unconfirmedDuffs, snapshot.totalReceivedDuffs, snapshot.totalSentDuffs,
    snapshot.transactionCount,
  ];
  const records = snapshot.transactions.map((transaction): CsvValue[] => [
    ...common, 'transaction', transaction.txid, directionFromNet(transaction.netDuffs),
    timestamp(transaction.timestampMs), transaction.type, transaction.blockHeight,
    transaction.confirmations, transaction.instantLocked, transaction.chainLocked,
    transaction.receivedDuffs, transaction.spentInputDuffs, transaction.netDuffs,
    transaction.feeDuffs, transaction.blockHash,
  ]);
  if (records.length === 0) records.push([...common, 'summary', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  return [header, ...records];
}

function platformRows(state: Extract<ViewerExportState, { mode: 'platform' }>, generatedAt: string): CsvValue[][] {
  const { snapshot, history } = state;
  const agrees = snapshot.balanceCredits === history.explorerBalanceCredits
    && snapshot.nonce === BigInt(history.explorerNonce);
  const header: CsvValue[] = [
    'schema_version', 'generated_at', 'mode', 'network', 'provider', 'address', 'legacy_alias',
    'dapi_proof_height', 'platform_index_height', 'platform_index_time', 'balance_credits',
    'outgoing_nonce', 'explorer_balance_credits', 'explorer_nonce', 'proof_explorer_agree',
    'total_incoming_credits', 'total_outgoing_credits', 'transition_count', 'record_type',
    'transition_hash', 'direction', 'timestamp', 'type', 'batch_type', 'status', 'error',
    'block_height', 'gas_used_credits', 'block_hash',
  ];
  const common: CsvValue[] = [
    '1', generatedAt, state.mode, state.network, history.provider, snapshot.address,
    history.base58Address, snapshot.proofHeight, history.indexedHeight, timestamp(history.indexedTimeMs),
    snapshot.balanceCredits, snapshot.nonce, history.explorerBalanceCredits, history.explorerNonce,
    agrees, history.totalIncomingCredits, history.totalOutgoingCredits, history.totalTransitions,
  ];
  const records = history.transitions.map((transition): CsvValue[] => [
    ...common, 'transition', transition.hash, transition.incoming ? 'incoming' : 'outgoing',
    timestamp(transition.timestampMs), transition.type, transition.batchType, transition.status,
    transition.error, transition.blockHeight, transition.gasUsed, transition.blockHash,
  ]);
  if (records.length === 0) records.push([...common, 'summary', '', '', '', '', '', '', '', '', '', '']);
  return [header, ...records];
}

function shieldedRows(state: Extract<ViewerExportState, { mode: 'shielded' }>, generatedAt: string): CsvValue[][] {
  const { snapshot } = state;
  const header: CsvValue[] = [
    'schema_version', 'generated_at', 'mode', 'network', 'key_capability', 'complete',
    'proof_height', 'protocol_version', 'pool_actions_scanned', 'balance_credits',
    'external_received_credits', 'external_sent_credits', 'self_change_credits', 'record_type',
    'pool_position', 'direction', 'value_credits', 'recovered_address', 'memo', 'spent',
    'note_commitment', 'action_nullifier', 'note_nullifier',
  ];
  const common: CsvValue[] = [
    '1', generatedAt, state.mode, state.network, snapshot.keyKind, snapshot.complete,
    snapshot.proofHeight, snapshot.protocolVersion, snapshot.scannedNotes, snapshot.balance,
    snapshot.receivedExternal, snapshot.sentExternal, snapshot.selfOrChange,
  ];
  const records = snapshot.records.map((record): CsvValue[] => {
    const note = record.incoming ?? record.outgoing;
    return [
      ...common, 'note', record.position, record.direction, note?.value ?? null,
      note?.address ?? '', note?.memo ?? '', record.spent ?? '', record.cmx,
      record.actionNullifier, note?.noteNullifier ?? '',
    ];
  });
  if (records.length === 0) records.push([...common, 'summary', '', '', '', '', '', '', '', '', '']);
  return [header, ...records];
}

function identityRows(state: Extract<ViewerExportState, { mode: 'identity' }>, generatedAt: string): CsvValue[][] {
  const header: CsvValue[] = [
    'schema_version', 'generated_at', 'mode', 'network', 'input_kind', 'input_label',
    'lookup_public_key_hash', 'resolved_dpns_name', 'resolved_dpns_document_id',
    'resolved_registration_transaction_hash',
    'identity_id', 'identity_id_hex', 'dapi_balance_credits', 'dapi_revision', 'dapi_nonce',
    'proof_verified_dpns_names', 'proof_heights', 'explorer_balance_credits',
    'explorer_revision', 'explorer_nonce', 'registered_at', 'registration_transaction_hash',
    'registration_type', 'registration_funding_source', 'funding_core_transaction_hash',
    'funding_core_transaction_output_index', 'funding_core_transaction_error',
    'system_identity', 'total_transactions', 'total_transfers',
    'total_documents', 'total_data_contracts', 'total_gas_spent_credits', 'total_top_ups',
    'total_top_up_credits', 'total_withdrawals', 'total_withdrawal_credits',
    'record_type', 'record_id', 'name', 'status', 'type', 'direction', 'amount_credits',
    'timestamp', 'transaction_hash', 'block_height', 'details',
  ];
  const proofHeights = [...new Set(state.snapshot.proofs.map(({ height }) => height.toString()))].join(' ');
  const rows: CsvValue[][] = [];
  for (const identity of state.snapshot.identities) {
    const historyResult = state.histories.find(({ identifier }) => identifier === identity.identifier);
    const history = historyResult?.history ?? null;
    const common: CsvValue[] = [
      '1', generatedAt, state.mode, state.network, state.snapshot.inputKind, state.snapshot.inputLabel,
      state.snapshot.publicKeyHashHex, state.snapshot.resolvedDpnsName,
      state.snapshot.resolvedDpnsDocumentId, state.snapshot.resolvedRegistrationTransactionHash,
      identity.identifier, identity.identifierHex,
      identity.balanceCredits, identity.revision, identity.nonce,
      identity.dpnsNames.join(' '), proofHeights, history?.explorerBalanceCredits ?? null,
      history?.explorerRevision ?? null, history?.explorerNonce ?? null,
      timestamp(history?.registeredAtMs ?? null), history?.registrationTransactionHash ?? null,
      history?.registrationType ?? null, history?.registrationFundingSource ?? null,
      history?.fundingCoreTransactionHash ?? null,
      history?.fundingCoreTransactionOutputIndex ?? null,
      history?.fundingCoreTransactionError ?? null,
      history?.systemIdentity ?? null,
      history?.totalTransactions ?? null, history?.totalTransfers ?? null,
      history?.totalDocuments ?? null, history?.totalDataContracts ?? null,
      history?.totalGasSpentCredits ?? null, history?.totalTopUps ?? null,
      history?.totalTopUpsCredits ?? null, history?.totalWithdrawals ?? null,
      history?.totalWithdrawalsCredits ?? null,
    ];
    rows.push([
      ...common, 'identity', identity.identifier, identity.dpnsNames.join(', '), historyResult?.error ?? 'verified',
      'IDENTITY', 'related', identity.balanceCredits, timestamp(history?.registeredAtMs ?? null),
      history?.registrationTransactionHash ?? null, null,
      JSON.stringify({ keyCount: identity.publicKeys.length, historyError: historyResult?.error ?? null }),
    ]);
    for (const key of identity.publicKeys) {
      rows.push([
        ...common, 'public_key', String(key.keyId), '', key.disabledAtMs === null ? 'active' : 'disabled',
        `${key.purpose}/${key.securityLevel}/${key.keyType}`, 'related', null,
        timestamp(key.disabledAtMs), null, null,
        JSON.stringify({
          publicKeyHash: key.publicKeyHashHex,
          data: key.dataHex,
          purposeNumber: key.purposeNumber,
          securityLevelNumber: key.securityLevelNumber,
          keyTypeNumber: key.keyTypeNumber,
          readOnly: key.readOnly,
          isMaster: key.isMaster,
          matchesLookup: key.matchesLookup,
          contractBounds: key.contractBounds,
        }, exactJson),
      ]);
    }
    if (history === null) continue;
    for (const alias of history.aliases) {
      rows.push([
        ...common, 'alias', alias.documentId, alias.name, alias.status, 'DPNS_ALIAS', 'related',
        null, timestamp(alias.timestampMs), alias.transactionHash, null,
        JSON.stringify({ contested: alias.contested }),
      ]);
    }
    for (const event of history.activity) {
      rows.push([
        ...common, 'activity', event.transactionHash, '', event.status, event.type, event.direction,
        event.netAmountCredits, timestamp(event.timestampMs), event.transactionHash, event.blockHeight,
        JSON.stringify({
          batchType: event.batchType,
          error: event.error,
          transfers: event.transfers,
          blockHash: event.blockHash,
          gasUsedCredits: event.gasUsedCredits,
        }, exactJson),
      ]);
    }
    for (const document of history.documents) {
      rows.push([
        ...common, 'document', document.identifier, document.documentTypeName, document.deleted ? 'deleted' : 'current',
        'DOCUMENT', 'related', null, timestamp(document.timestampMs), document.transactionHash, null,
        JSON.stringify(document),
      ]);
    }
    for (const contract of history.dataContracts) {
      rows.push([
        ...common, 'data_contract', contract.identifier, contract.name, contract.system ? 'system' : 'user',
        'DATA_CONTRACT', 'related', null, timestamp(contract.timestampMs), contract.transactionHash, null,
        JSON.stringify(contract),
      ]);
    }
    for (const withdrawal of history.withdrawals) {
      rows.push([
        ...common, 'withdrawal', withdrawal.documentId, withdrawal.withdrawalAddress, withdrawal.status,
        'IDENTITY_CREDIT_WITHDRAWAL', 'outgoing', withdrawal.amountCredits,
        timestamp(withdrawal.timestampMs), withdrawal.coreTransactionHash, null,
        JSON.stringify(withdrawal, exactJson),
      ]);
    }
    for (const token of history.tokens) {
      rows.push([
        ...common, 'token', token.identifier, token.name, '', 'TOKEN', 'related', token.totalSupply,
        timestamp(token.timestampMs), null, null, JSON.stringify(token, exactJson),
      ]);
    }
  }
  if (rows.length === 0) {
    rows.push([
      '1', generatedAt, state.mode, state.network, state.snapshot.inputKind, state.snapshot.inputLabel,
      state.snapshot.publicKeyHashHex, state.snapshot.resolvedDpnsName,
      state.snapshot.resolvedDpnsDocumentId, state.snapshot.resolvedRegistrationTransactionHash,
      '', '', '', '', '', '', proofHeights,
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      'summary', '', '', 'not_found', 'IDENTITY', 'related', '', '', '', '', '',
    ]);
  }
  return [header, ...rows];
}

function fileStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

export function createViewerExport(
  state: ViewerExportState,
  format: ViewerExportFormat,
  generatedAt = new Date(),
): ViewerExportFile {
  const generatedAtIso = generatedAt.toISOString();
  const filename = `wallet-activity-viewer-${state.mode}-${state.network}-${fileStamp(generatedAt)}.${format}`;
  if (format === 'json') {
    const data = state.mode === 'platform'
      ? { snapshot: state.snapshot, history: state.history }
      : state.mode === 'identity'
        ? { snapshot: state.snapshot, histories: state.histories }
      : { snapshot: state.snapshot };
    return {
      filename,
      mimeType: 'application/json',
      text: `${JSON.stringify({ schema: 'wallet-activity-viewer-export', version: 1, generatedAt: generatedAtIso, mode: state.mode, network: state.network, data }, exactJson, 2)}\n`,
    };
  }
  const rows = state.mode === 'core'
    ? coreRows(state, generatedAtIso)
    : state.mode === 'platform'
      ? platformRows(state, generatedAtIso)
      : state.mode === 'identity'
        ? identityRows(state, generatedAtIso)
      : shieldedRows(state, generatedAtIso);
  return { filename, mimeType: 'text/csv', text: csv(rows) };
}
