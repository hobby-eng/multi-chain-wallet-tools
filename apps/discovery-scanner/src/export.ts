import { neutralizeSpreadsheetFormula } from '@ckd/export/csv.js';
import type { RecoveryExportEnvelope, RecoveryExportResult, RecoverySectionId, RecoveryWalletResult } from './types.js';

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

const CSV_FIELD_COLUMNS = [
  ['Derivation path', 'derivation_path', ['core', 'platform', 'identity', 'shielded']],
  ['Branch', 'branch', ['core']],
  ['Address index', 'address_index', ['core', 'platform']],
  ['Transactions reported', 'transactions_reported', ['core', 'platform', 'identity']],
  ['Incoming credit events', 'incoming_credit_events', ['platform', 'identity']],
  ['Outgoing credit events', 'outgoing_credit_events', ['platform', 'identity']],
  ['Lifetime received', 'lifetime_received_dash', ['core', 'platform', 'identity']],
  ['Lifetime sent', 'lifetime_sent_dash', ['core', 'platform', 'identity']],
  ['Lifetime fees spent', 'lifetime_fees_spent_dash', ['identity']],
  ['First seen', 'first_seen', ['core', 'platform', 'identity']],
  ['Last seen', 'last_seen', ['core', 'platform', 'identity']],
  ['Public-key hash', 'public_key_hash', ['core', 'platform', 'identity']],
  ['Pool position', 'pool_position', ['shielded']],
  ['Spent at pool position', 'spent_at_pool_position', ['shielded']],
  ['Direction', 'direction', ['shielded']],
  ['Note value', 'note_value_dash', ['shielded']],
  ['Spend state', 'spend_state', ['shielded']],
] as const;

const CSV_SECTION_METRIC_COLUMNS = [
  ['Spendable balance', 'section_spendable_balance_dash', true, ['shielded']],
  ['Lifetime received', 'section_lifetime_received_dash', true, ['shielded']],
  ['Lifetime sent', 'section_lifetime_sent_dash', true, ['shielded']],
  ['Lifetime self/change', 'section_lifetime_self_change_dash', true, ['shielded']],
  ['Incoming notes', 'section_incoming_notes', false, ['shielded']],
  ['Outgoing notes', 'section_outgoing_notes', false, ['shielded']],
  ['Self/change notes', 'section_self_change_notes', false, ['shielded']],
  ['Spendable notes', 'section_spendable_notes', false, ['shielded']],
  ['Spent notes', 'section_spent_notes', false, ['shielded']],
  ['Notes with memo', 'section_notes_with_memo', false, ['shielded']],
  ['Recovered notes', 'section_recovered_notes', false, ['shielded']],
  ['First activity pool position', 'section_first_activity_pool_position', false, ['shielded']],
  ['Last activity pool position', 'section_last_activity_pool_position', false, ['shielded']],
] as const;

function appliesToIncludedSection(sectionIds: readonly RecoverySectionId[], included: ReadonlySet<RecoverySectionId>): boolean {
  return sectionIds.some((sectionId) => included.has(sectionId));
}

function isDedicatedFieldLabel(label: string): boolean {
  return CSV_FIELD_COLUMNS.some(([known]) => known === label)
    || /derivation path$/iu.test(label)
    || /public-key hash$/iu.test(label);
}

function fieldValue(fields: RecoveryWalletResult['sections'][number]['findings'][number]['fields'], label: string): string {
  if (label === 'Derivation path') return fields.find((field) => /derivation path$/iu.test(field.label))?.value ?? '';
  if (label === 'Public-key hash') return fields.find((field) => /public-key hash$/iu.test(field.label))?.value ?? '';
  return fields.find((field) => field.label === label)?.value ?? '';
}

function numericDash(value: string): string {
  return /^(\d+(?:\.\d+)?) DASH(?:\b|$)/u.exec(value)?.[1] ?? '';
}

function csvFieldValue(
  fields: RecoveryWalletResult['sections'][number]['findings'][number]['fields'],
  label: string,
): string {
  const value = fieldValue(fields, label);
  return label === 'Lifetime received' || label === 'Lifetime sent' || label === 'Lifetime fees spent' || label === 'Note value' ? numericDash(value) : value;
}

function sectionMetricValue(
  metrics: RecoveryWalletResult['sections'][number]['metrics'],
  label: string,
  numeric: boolean,
): string {
  const value = metrics.find((metric) => metric.label === label)?.value ?? '';
  return numeric ? numericDash(value) : value;
}

function toCsv(results: RecoveryWalletResult[]): string {
  const includedSections = new Set<RecoverySectionId>(results.flatMap((result) =>
    result.sections.filter((section) => section.state !== 'skipped').map((section) => section.id)));
  const fieldColumns = CSV_FIELD_COLUMNS.filter(([, , sectionIds]) => appliesToIncludedSection(sectionIds, includedSections));
  const sectionMetricColumns = CSV_SECTION_METRIC_COLUMNS.filter(([, , , sectionIds]) => appliesToIncludedSection(sectionIds, includedSections));
  const header = [
    'wallet_label',
    'coin',
    'network',
    'section',
    'section_state',
    'resource',
    'description',
    'balance_atomic',
    'balance_dash',
    ...fieldColumns.map(([, column]) => column),
    ...sectionMetricColumns.map(([, column]) => column),
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
          ...fieldColumns.map(() => ''),
          ...sectionMetricColumns.map(([label, , numeric]) => sectionMetricValue(section.metrics, label, numeric)),
          section.warning ?? '',
          section.proof,
        ].map(csvCell).join(','));
        continue;
      }
      for (const finding of section.findings) {
        const metadata = finding.fields
          .filter(({ label }) => !isDedicatedFieldLabel(label))
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
          numericDash(finding.balanceLabel),
          ...fieldColumns.map(([label]) => csvFieldValue(finding.fields, label)),
          ...sectionMetricColumns.map(([label, , numeric]) => sectionMetricValue(section.metrics, label, numeric)),
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
