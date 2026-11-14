import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult, DisplayMode, DerivedRow, ResultField } from "@ckd/core/types.js";
import { Tsv } from "./tsv.js";
import { DISPLAY_MODES, fieldColumns } from "@ckd/core/types.js";

const EXPORT_FORMATS = ["plain", "structured", "tsv"] as const;
const EXPORT_ACTIONS = [
  "addresses",
  "publicKeys",
  "privateKeys",
  "selected",
  "allDisplayed",
] as const;
/** Text formats supported by every result-export host. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Field selection actions supported by every result-export host. */
export type ExportAction = (typeof EXPORT_ACTIONS)[number];

/** A refused export choice; no supplied text or private material is included. */
export class ExportChoiceError extends Error {
  readonly code: "export.choice.action" | "export.choice.format" | "export.choice.mode";
  constructor(code: ExportChoiceError["code"]) {
    const messages = {
      "export.choice.action": "Choose a supported result export action.",
      "export.choice.format": "Choose a supported result export format.",
      "export.choice.mode": "Choose a supported result display mode.",
    };
    super(messages[code]);
    this.name = "ExportChoiceError";
    this.code = code;
  }
}

/** The only choice admission used by native controls and library entry points. */
export class ExportChoice {
  /** Admit one supported native action; unknown values never expand to all fields. */
  static action(value: unknown): ExportAction {
    const accepted = EXPORT_ACTIONS.find((candidate) => candidate === value);
    if (accepted === undefined) throw new ExportChoiceError("export.choice.action");
    return accepted;
  }
  /** Admit a text format; unknown values never fall back to TSV. */
  static format(value: unknown): ExportFormat {
    const accepted = EXPORT_FORMATS.find((candidate) => candidate === value);
    if (accepted === undefined) throw new ExportChoiceError("export.choice.format");
    return accepted;
  }
  /** Admit a display mode before selecting or reading any row fields. */
  static mode(value: unknown): DisplayMode {
    const accepted = DISPLAY_MODES.find((candidate) => candidate === value);
    if (accepted === undefined) throw new ExportChoiceError("export.choice.mode");
    return accepted;
  }
}

interface FormattedExport {
  text: string;
  containsSecret: boolean;
  valueCount: number;
}

interface ExportInspection {
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
  if (mode === "advanced") entries.push(...row.advanced.map((field) => ({ field })));
  for (const group of row.groups ?? []) {
    entries.push(...group.basic.map((field) => ({ field, groupTitle: group.title })));
    if (mode === "advanced") {
      entries.push(...group.advanced.map((field) => ({ field, groupTitle: group.title })));
    }
  }
  return entries;
}

export function displayedFields(row: DerivedRow, mode: DisplayMode): ResultField[] {
  ExportChoice.mode(mode);
  return displayedFieldEntries(row, mode).map(({ field }) => field);
}

function roleKeys(adapter: CoinAdapter, action: ExportAction): Set<string> | null {
  if (action === "addresses") return new Set(adapter.fieldRoles.addresses);
  if (action === "publicKeys") return new Set(adapter.fieldRoles.publicKeys);
  if (action === "privateKeys") return new Set(adapter.fieldRoles.privateKeys);
  return null;
}

function fieldsForAction(
  adapter: CoinAdapter,
  row: DerivedRow,
  mode: DisplayMode,
  action: ExportAction,
): DisplayedFieldEntry[] {
  const keys = roleKeys(adapter, action);
  return displayedFieldEntries(row, mode).filter(
    ({ field }) => keys === null || keys.has(field.key),
  );
}

function fieldLabel({ field, groupTitle }: DisplayedFieldEntry): string {
  return groupTitle === undefined ? field.label : `${groupTitle} · ${field.label}`;
}

function* selectedRowItems(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
): Generator<{ row: DerivedRow; fields: DisplayedFieldEntry[] }> {
  for (const row of result.rows) {
    if (!selected.has(row.index)) continue;
    const fields = fieldsForAction(adapter, row, mode, action);
    if (fields.length > 0) yield { row, fields };
  }
}

/** The fields of each selected row that has any, row by row. */
function* selectedFieldLists(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: ExportAction,
): Generator<DisplayedFieldEntry[]> {
  for (const { fields } of selectedRowItems(adapter, result, selected, mode, action)) yield fields;
}

export function inspectSelectedRows(
  adapter: CoinAdapter,
  result: DerivationResult,
  selected: ReadonlySet<number>,
  mode: DisplayMode,
  action: unknown,
): ExportInspection {
  ExportChoice.mode(mode);
  const admittedAction = ExportChoice.action(action);
  let valueCount = 0;
  let containsSecret = false;
  let rowCount = 0;
  for (const { fields } of selectedRowItems(adapter, result, selected, mode, admittedAction)) {
    rowCount += 1;
    valueCount += fields.length;
    if (!containsSecret && fields.some(({ field }) => field.secret)) containsSecret = true;
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
  ExportChoice.mode(mode);
  ExportChoice.action(action);
  ExportChoice.format(format);
  if (format === "plain") {
    const targeted = roleKeys(adapter, action) !== null;
    let emitted = false;
    for (const item of selectedRowItems(adapter, result, selected, mode, action)) {
      if (emitted) yield targeted ? "\n" : "\n\n";
      yield item.fields.map(({ field }) => field.value).join("\n");
      emitted = true;
    }
    return;
  }

  if (format === "structured") {
    let emitted = false;
    for (const { row, fields } of selectedRowItems(adapter, result, selected, mode, action)) {
      if (emitted) yield "\n\n";
      yield [
        `Index: ${row.index}`,
        `Path: ${row.path}`,
        ...fields.map((entry) => `${fieldLabel(entry)}: ${entry.field.value}`),
      ].join("\n");
      emitted = true;
    }
    return;
  }

  const headers = fieldColumns(
    selectedFieldLists(adapter, result, selected, mode, action),
    ({ field }) => field.key,
  );
  if (headers.length === 0) return;
  yield Tsv.row(["Index", "Path", ...headers.map((entry) => fieldLabel(entry))]);
  for (const { row, fields } of selectedRowItems(adapter, result, selected, mode, action)) {
    const values = new Map(fields.map(({ field }) => [field.key, field.value]));
    yield "\n";
    yield Tsv.row([
      String(row.index),
      row.path,
      ...headers.map(({ field }) => values.get(field.key) ?? ""),
    ]);
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
  ExportChoice.mode(mode);
  ExportChoice.action(action);
  ExportChoice.format(format);
  const { valueCount, containsSecret } = inspectSelectedRows(
    adapter,
    result,
    selected,
    mode,
    action,
  );
  if (valueCount === 0) return { text: "", containsSecret, valueCount };
  return {
    text: [...iterateSelectedRows(adapter, result, selected, mode, action, format)].join(""),
    containsSecret,
    valueCount,
  };
}
