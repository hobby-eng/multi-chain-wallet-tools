import { neutralizeSpreadsheetFormula } from '@ckd/export/csv.js';
import type { PlatformAddressHistorySnapshot } from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
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
      : shieldedRows(state, generatedAtIso);
  return { filename, mimeType: 'text/csv', text: csv(rows) };
}
