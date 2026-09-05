import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode, DerivedRow, ResultField } from '@ckd/core/types.js';
import { neutralizeSpreadsheetFormula } from './csv.js';

export type ExportFormat = 'plain' | 'structured' | 'tsv';
export type ExportAction = 'addresses' | 'publicKeys' | 'privateKeys' | 'selected' | 'allDisplayed';

export interface FormattedExport {
  text: string;
  containsSecret: boolean;
  valueCount: number;
}

export interface ExportInspection {
  containsSecret: boolean;
  valueCount: number;
  rowCount: number;
}

interface DisplayedFieldEntry {
  field: ResultField;
  groupTitle?: string;
}

function displayedFieldEntries(row: DerivedRow, mode: DisplayMode): DisplayedFieldEntry[] {
  const entries: DisplayedFieldEntry[] = row.basic.map((field) => ({ field }));
  if (mode === 'advanced') entries.push(...row.advanced.map((field) => ({ field })));
  for (const group of row.groups ?? []) {
    entries.push(...group.basic.map((field) => ({ field, groupTitle: group.title })));
    if (mode === 'advanced') {
      entries.push(...group.advanced.map((field) => ({ field, groupTitle: group.title })));
    }
  }
  return entries;
}

export function displayedFields(row: DerivedRow, mode: DisplayMode): ResultField[] {
  return displayedFieldEntries(row, mode).map(({ field }) => field);
}

function roleKeys(adapter: CoinAdapter, action: ExportAction): Set<string> | null {
  if (action === 'addresses') return new Set(adapter.fieldRoles.addresses);
  if (action === 'publicKeys') return new Set(adapter.fieldRoles.publicKeys);
  if (action === 'privateKeys') return new Set(adapter.fieldRoles.privateKeys);
  return null;
}

function fieldsForAction(
  adapter: CoinAdapter,
  row: DerivedRow,
  mode: DisplayMode,
  action: ExportAction,
): ResultField[] {
  const keys = roleKeys(adapter, action);
  return displayedFieldEntries(row, mode)
    .filter(({ field }) => keys === null || keys.has(field.key))
    .map(({ field, groupTitle }) => groupTitle === undefined
      ? field
      : { ...field, label: `${groupTitle} · ${field.label}` });
}

/**
 * TSV is opened in spreadsheets, so cells receive the same treatment as CSV:
 * embedded record/field separators collapse to a space and a leading formula
 * character is neutralised. Headers go through the same function as values so
 * a label containing a tab cannot shift the whole column layout.
 */
function cleanTsv(value: string): string {
  return neutralizeSpreadsheetFormula(value.replace(/[\t\r\n]+/gu, ' '));
}

function* selectedRowItems(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
): Generator<{ row: DerivedRow; fields: ResultField[] }> {
  for (const row of result.rows) {
    if (!selected.has(row.index)) continue;
    const fields = fieldsForAction(adapter, row, mode, action);
    if (fields.length > 0) yield { row, fields };
  }
}

export function inspectSelectedRows(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
): ExportInspection {
  let valueCount = 0;
  let containsSecret = false;
  let rowCount = 0;
  for (const { fields } of selectedRowItems(adapter, result, selected, mode, action)) {
    rowCount += 1;
    valueCount += fields.length;
    if (!containsSecret && fields.some((field) => field.secret)) containsSecret = true;
  }
  return {
    valueCount,
    containsSecret,
    rowCount,
  };
}

/** Yields bounded row-sized chunks so large downloads never require one giant JavaScript string. */
export function* iterateSelectedRows(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
  format: ExportFormat,
): Generator<string> {
  if (format === 'plain') {
    const targeted = roleKeys(adapter, action) !== null;
    let emitted = false;
    for (const item of selectedRowItems(adapter, result, selected, mode, action)) {
      if (emitted) yield targeted ? '\n' : '\n\n';
      yield item.fields.map((field) => field.value).join('\n');
      emitted = true;
    }
    return;
  }

  if (format === 'structured') {
    let emitted = false;
    for (const { row, fields } of selectedRowItems(adapter, result, selected, mode, action)) {
      if (emitted) yield '\n\n';
      yield [
        `Index: ${row.index}`,
        `Path: ${row.path}`,
        ...fields.map((field) => `${field.label}: ${field.value}`),
      ].join('\n');
      emitted = true;
    }
    return;
  }

  const headers: ResultField[] = [];
  const headerKeys = new Set<string>();
  for (const { fields } of selectedRowItems(adapter, result, selected, mode, action)) {
    for (const field of fields) {
      if (!headerKeys.has(field.key)) {
        headerKeys.add(field.key);
        headers.push(field);
      }
    }
  }
  if (headers.length === 0) return;
  yield ['Index', 'Path', ...headers.map((field) => field.label)].map(cleanTsv).join('\t');
  for (const { row, fields } of selectedRowItems(adapter, result, selected, mode, action)) {
    const values = new Map(fields.map((field) => [field.key, field.value]));
    yield '\n';
    yield [String(row.index), row.path, ...headers.map((field) => values.get(field.key) ?? '')]
      .map(cleanTsv)
      .join('\t');
  }
}

export function formatSelectedRows(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
  format: ExportFormat,
): FormattedExport {
  const { valueCount, containsSecret } = inspectSelectedRows(adapter, result, selected, mode, action);
  if (valueCount === 0) return { text: '', containsSecret, valueCount };
  return {
    text: [...iterateSelectedRows(adapter, result, selected, mode, action, format)].join(''),
    containsSecret,
    valueCount,
  };
}
