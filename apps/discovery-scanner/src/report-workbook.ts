import writeExcelFile, { type SheetData } from 'write-excel-file/universal';
import type { RecoveryExportEnvelope } from './types.js';

/** Only the public JSON report that passed the vault's export tripwire enters this converter. */
export function recoveryWorkbookRows(text: string): { summary: string[][]; resources: string[][] } {
  const report = JSON.parse(text) as RecoveryExportEnvelope;
  if (
    report.format !== 'wallet-discovery-report' ||
    report.version !== 1 ||
    report.containsSecrets !== false ||
    !Array.isArray(report.results)
  )
    throw new Error('Unsupported public recovery report.');
  const fields = [
    ...new Set(
      report.results.flatMap((result) =>
        result.sections.flatMap((section) =>
          section.findings.flatMap((finding) => finding.fields.map((field) => field.label)),
        ),
      ),
    ),
  ];
  const summary = [['source', 'coin', 'network', 'section', 'status', 'scanned', 'provider', 'proof', 'warnings']];
  const resources = [
    [
      'source',
      'coin',
      'network',
      'section',
      'resource',
      'balance_atomic',
      'balance',
      'asset',
      'atomic_unit',
      'decimals',
      'history_status',
      'transactions',
      'received_atomic',
      'sent_atomic',
      'fees_atomic',
      'first_seen',
      'last_seen',
      ...fields,
    ],
  ];
  for (const result of report.results) {
    for (const section of result.sections) {
      summary.push([
        result.label,
        result.coinLabel,
        result.network,
        section.title,
        section.state,
        section.scanned,
        section.source,
        section.proof,
        [...result.warnings, section.warning ?? ''].filter(Boolean).join(' | '),
      ]);
      for (const finding of section.findings) {
        const history = finding.history;
        resources.push([
          result.label,
          result.coinLabel,
          result.network,
          section.title,
          finding.title,
          finding.balanceAtomic ?? '',
          finding.balanceLabel,
          finding.balanceUnit?.asset ?? '',
          finding.balanceUnit?.atomicUnit ?? '',
          finding.balanceUnit?.decimals?.toString() ?? '',
          history?.status ?? '',
          history?.transactionCount?.toString() ?? '',
          history?.totalReceivedAtomic ?? '',
          history?.totalSentAtomic ?? '',
          history?.totalFeesAtomic ?? '',
          history?.firstSeen ?? '',
          history?.lastSeen ?? '',
          ...fields.map((label) => finding.fields.find((field) => field.label === label)?.value ?? ''),
        ]);
      }
    }
  }
  return { summary, resources };
}

export async function createRecoveryWorkbook(text: string): Promise<Blob> {
  const rows = recoveryWorkbookRows(text);
  const data = (rows: string[][]): SheetData =>
    rows.map((row, index) =>
      row.map((value) => ({ value, type: String, ...(index === 0 ? { fontWeight: 'bold' as const } : {}) })),
    );
  return writeExcelFile(
    [
      { sheet: 'Summary', data: data(rows.summary), stickyRowsCount: 1 },
      { sheet: 'Resources', data: data(rows.resources), stickyRowsCount: 1 },
    ],
    { fontFamily: 'Arial', fontSize: 10 },
  ).toBlob();
}
