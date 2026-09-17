import writeExcelFile, { type SheetData } from 'write-excel-file/universal';
import { encodeCsv } from '@ckd/export/csv.js';
import type { PublicDataNetwork } from '@ckd/public-data-providers/types.js';
import type { AddressResult } from './external-activity.js';
import { exactJson, fileStamp } from './export-common.js';

export interface PublicActivityExport {
  coin: string;
  asset: string;
  decimals: number;
  network: PublicDataNetwork;
  mode: 'single' | 'batch';
  results: readonly AddressResult[];
}

export function publicActivityRows(state: PublicActivityExport): (string | number | null)[][] {
  return [
    [
      'coin',
      'network',
      'address',
      'asset',
      'decimals',
      'balance_atomic',
      'nonce',
      'block_height',
      'history_status',
      'transactions',
      'pending_transactions',
      'received_atomic',
      'sent_atomic',
      'fees_atomic',
      'first_seen',
      'last_seen',
      'source',
      'note',
    ],
    ...state.results.map((result) => [
      state.coin,
      state.network,
      result.address,
      state.asset,
      state.decimals,
      result.balanceAtomic.toString(),
      result.nonce?.toString() ?? null,
      result.blockHeight?.toString() ?? null,
      result.history.status,
      result.history.transactionCount,
      result.history.pendingTransactionCount,
      result.history.totalReceivedAtomic,
      result.history.totalSentAtomic,
      result.history.totalFeesAtomic,
      result.history.firstSeen,
      result.history.lastSeen,
      result.history.source,
      result.history.note,
    ]),
  ];
}

export async function createPublicActivityExport(
  state: PublicActivityExport,
  format: 'csv' | 'json' | 'xlsx',
  date = new Date(),
) {
  const filename = `wallet-activity-${state.coin}-${state.mode}-${fileStamp(date)}.${format}`;
  if (format === 'json')
    return {
      filename,
      blob: new Blob([JSON.stringify({ schemaVersion: 1, generatedAt: date.toISOString(), ...state }, exactJson, 2)], {
        type: 'application/json',
      }),
    };
  const rows = publicActivityRows(state);
  if (format === 'csv') {
    const text = encodeCsv(rows);
    return { filename, blob: new Blob([text], { type: 'text/csv;charset=utf-8' }) };
  }
  const data: SheetData = rows.map((row, index) =>
    row.map((value) => ({ value: value ?? '', ...(index === 0 ? { fontWeight: 'bold' as const } : {}) })),
  );
  const blob = await writeExcelFile(data, { sheet: 'Addresses', stickyRowsCount: 1 }).toBlob();
  return { filename, blob };
}
