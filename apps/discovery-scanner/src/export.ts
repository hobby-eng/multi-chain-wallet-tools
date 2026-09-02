import { neutralizeSpreadsheetFormula } from '@ckd/export/csv.js';
import type { RecoveryExportEnvelope, RecoveryExportResult, RecoveryWalletResult } from './types.js';

export type RecoveryExportFormat = 'json' | 'csv';

export interface RecoveryExportFile {
  filename: string;
  mimeType: 'application/json' | 'text/csv';
  text: string;
}

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function exportableResults(results: RecoveryWalletResult[]): RecoveryExportResult[] {
  return results.map((result) => ({
    inputId: result.inputId,
    label: result.label,
    coinId: result.coinId,
    coinLabel: result.coinLabel,
    network: result.network,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    overview: result.overview,
    warnings: result.warnings,
    sections: result.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      state: section.state,
      scanned: section.scanned.toString(),
      source: section.source,
      proof: section.proof,
      ...(section.warning === undefined ? {} : { warning: section.warning }),
      metrics: section.metrics,
      findings: section.findings.map((finding) => ({
        id: finding.id,
        title: finding.title,
        subtitle: finding.subtitle,
        balanceAtomic: finding.balanceAtomic.toString(),
        balanceLabel: finding.balanceLabel,
        fields: finding.fields,
      })),
    })),
  }));
}

function csvCell(value: string): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}

function toCsv(results: RecoveryWalletResult[]): string {
  const header = [
    'wallet_label',
    'coin',
    'network',
    'section',
    'section_state',
    'resource',
    'description',
    'balance_atomic',
    'balance_display',
    'derivation_path',
    'metadata',
    'proof',
  ];
  const rows = [header.map(csvCell).join(',')];
  for (const result of results) {
    for (const section of result.sections) {
      if (section.findings.length === 0) {
        rows.push([
          result.label,
          result.coinLabel,
          result.network,
          section.title,
          section.state,
          '',
          section.description,
          '0',
          '',
          '',
          section.warning ?? '',
          section.proof,
        ].map(csvCell).join(','));
        continue;
      }
      for (const finding of section.findings) {
        const path = finding.fields.find(({ label }) => /path/iu.test(label))?.value ?? '';
        const metadata = finding.fields
          .filter(({ value }) => value !== path)
          .map(({ label, value }) => `${label}: ${value}`)
          .join(' | ');
        rows.push([
          result.label,
          result.coinLabel,
          result.network,
          section.title,
          section.state,
          finding.title,
          finding.subtitle,
          finding.balanceAtomic.toString(),
          finding.balanceLabel,
          path,
          metadata,
          section.proof,
        ].map(csvCell).join(','));
      }
    }
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function createRecoveryExport(
  results: RecoveryWalletResult[],
  format: RecoveryExportFormat,
  date = new Date(),
): RecoveryExportFile {
  if (results.length === 0) throw new Error('Run a recovery scan before exporting.');
  const suffix = safeTimestamp(date);
  if (format === 'json') {
    const envelope: RecoveryExportEnvelope = {
      format: 'wallet-discovery-report',
      version: 1,
      createdAt: date.toISOString(),
      containsSecrets: false,
      safetyNotice: 'No mnemonic, BIP39 passphrase, seed, private key, spending key, or viewing key is included.',
      results: exportableResults(results),
    };
    return {
      filename: `wallet-discovery-report-${suffix}.json`,
      mimeType: 'application/json',
      text: `${JSON.stringify(envelope, null, 2)}\n`,
    };
  }
  return {
    filename: `wallet-discovery-report-${suffix}.csv`,
    mimeType: 'text/csv',
    text: toCsv(results),
  };
}
