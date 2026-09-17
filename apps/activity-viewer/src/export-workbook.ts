import writeExcelFile, { type Sheet, type SheetData } from 'write-excel-file/universal';
import type { ActivitySnapshot } from '@ckd/dash-network/types.js';
import type {
  ViewerBatchExportError,
  ViewerBatchExportItem,
  ViewerExportState,
  ViewerSingleExportState,
  ViewerWorkbookExportFile,
} from './export-model.js';
import { exportError, fileStamp, isBatchExportState } from './export-common.js';
import { CSV_HEADER, singleRows, type CsvValue } from './export-csv.js';

type WorkbookValue = string | number | boolean | null;

function workbookCell(value: CsvValue): WorkbookValue {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function worksheetRows(state: ViewerSingleExportState, generatedAt: string, label?: string): CsvValue[][] {
  return singleRows(state, generatedAt)
    .slice(1)
    .map((row) => {
      if (label === undefined) return row;
      const labeled = [...row];
      labeled[4] = state.mode === 'shielded' ? shieldedWorkbookLabel(label, state.snapshot.keyKind) : label;
      return labeled;
    });
}

function compactDetailRows(rows: CsvValue[][]): CsvValue[][] {
  const blockHeightIndex = CSV_HEADER.indexOf('block_height');
  const normalized = rows.map((row) =>
    row.map((value, index) => (index === blockHeightIndex && value !== null ? String(value) : value)),
  );
  const includedColumns = CSV_HEADER.map((_header, index) => index).filter((index) =>
    normalized.some((row) => row[index] !== null && row[index] !== ''),
  );
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
  const label =
    state.mode === 'core'
      ? state.snapshot.address
      : state.mode === 'platform'
        ? state.snapshot.address
        : state.mode === 'identity'
          ? (state.snapshot.resolvedDpnsName ?? state.snapshot.inputLabel)
          : 'ORCHARD · viewing key';
  return [
    {
      id: 'query-1',
      label,
      state,
    },
  ];
}

function workbookErrors(state: ViewerExportState): ViewerBatchExportError[] {
  return isBatchExportState(state) ? state.errors.map((error) => exportError(error, state.mode)) : [];
}

function summaryRow(item: ViewerBatchExportItem, recordCount: number): CsvValue[] {
  const state = item.state;
  if (state.mode === 'core') {
    return [
      item.id,
      item.label,
      state.mode,
      state.network,
      state.snapshot.indexStatus,
      state.snapshot.address,
      state.snapshot.balanceDuffs,
      'duffs',
      recordCount,
    ];
  }
  if (state.mode === 'platform') {
    const agrees =
      state.snapshot.balanceCredits === state.history.explorerBalanceCredits &&
      state.snapshot.nonce === BigInt(state.history.explorerNonce);
    return [
      item.id,
      item.label,
      state.mode,
      state.network,
      agrees ? 'proof_and_index_agree' : 'proof_takes_precedence',
      state.snapshot.address,
      state.snapshot.balanceCredits,
      'credits',
      recordCount,
    ];
  }
  if (state.mode === 'identity') {
    const identities = state.snapshot.identities;
    const resource =
      identities.map((identity) => identity.dpnsNames[0] ?? identity.identifier).join('; ') ||
      state.snapshot.resolvedDpnsName ||
      state.snapshot.inputLabel;
    const balance = identities.reduce((total, identity) => total + identity.balanceCredits, 0n);
    const status = identities.length === 0 ? 'not_found' : 'verified';
    return [item.id, item.label, state.mode, state.network, status, resource, balance, 'credits', recordCount];
  }
  return [
    item.id,
    shieldedWorkbookLabel(item.label, state.snapshot.keyKind),
    state.mode,
    state.network,
    state.snapshot.complete ? 'complete' : 'partial',
    'Orchard shielded pool',
    state.snapshot.balance,
    'credits',
    recordCount,
  ];
}

function addWorkbookSheet(sheets: Sheet<Blob>[], name: string, rows: ReadonlyArray<ReadonlyArray<CsvValue>>): void {
  if (rows.length === 0) return;
  const data: SheetData = rows.map((row, rowIndex) =>
    row.map((value) => {
      const cell = workbookCell(value);
      if (rowIndex !== 0) return cell;
      return {
        value: cell === null ? '' : cell,
        type: typeof cell === 'number' ? Number : typeof cell === 'boolean' ? Boolean : String,
        fontWeight: 'bold',
        textColor: '#ffffff',
        backgroundColor: '#1f2933',
        alignVertical: 'center',
        wrap: true,
        height: 24,
      };
    }),
  );
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

  const summaryRows: CsvValue[][] = [
    [
      'query_id',
      'query_label',
      'mode',
      'network',
      'status',
      'resource',
      'balance_atomic',
      'balance_unit',
      'record_count',
    ],
  ];
  summaryRows.push(...preparedItems.map(({ item, rows }) => summaryRow(item, rows.length)));
  summaryRows.push(
    ...errors.map((error) => [error.id, error.label, error.mode ?? state.mode, state.network, 'failed', '', '', '', 0]),
  );
  addWorkbookSheet(sheets, 'Summary', summaryRows);

  const addresses = preparedItems
    .filter(({ item }) => item.state.mode === 'core' || item.state.mode === 'platform')
    .flatMap(({ rows }) => rows);
  const identities = preparedItems.filter(({ item }) => item.state.mode === 'identity').flatMap(({ rows }) => rows);
  const orchard = preparedItems.filter(({ item }) => item.state.mode === 'shielded').flatMap(({ rows }) => rows);
  addWorkbookSheet(sheets, 'Addresses', addresses.length === 0 ? [] : compactDetailRows(addresses));
  addWorkbookSheet(sheets, 'Identities', identities.length === 0 ? [] : compactDetailRows(identities));
  addWorkbookSheet(sheets, 'Orchard', orchard.length === 0 ? [] : compactDetailRows(orchard));
  addWorkbookSheet(
    sheets,
    'Errors',
    errors.length === 0
      ? []
      : [
          ['query_id', 'query_label', 'mode', 'network', 'status', 'message'],
          ...errors.map((error) => [
            error.id,
            error.label,
            error.mode ?? state.mode,
            state.network,
            'failed',
            error.message,
          ]),
        ],
  );

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
