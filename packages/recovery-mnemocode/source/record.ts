import type { OutputFormat } from './core.js';

export const MNEMOCODE_RECORD_VERSION = 1 as const;
export type RecordMode = 'direct' | 'seedshift' | 'seedshift-legacy' | 'seedshift-legacy-valid';
export type RecordFormat = Exclude<OutputFormat, 'json'>;

export interface MnemoCodeRecord {
  readonly version: typeof MNEMOCODE_RECORD_VERSION;
  readonly mode: RecordMode;
  readonly format: RecordFormat;
  readonly payload: string;
}

const formats = new Set<RecordFormat>([
  'english',
  'indexes',
  'unicode',
  'colors',
  'colors-unicode',
]);
const modes = new Set<RecordMode>([
  'direct',
  'seedshift',
  'seedshift-legacy',
  'seedshift-legacy-valid',
]);
const recordPattern =
  /^MNC(\d+):(direct|seedshift|seedshift-legacy|seedshift-legacy-valid):([a-z-]+):([\s\S]+)$/u;

/** Wraps a raw representation with enough public metadata to select its decoder later. */
export function serializeRecord(mode: RecordMode, format: RecordFormat, payload: string): string {
  if (!modes.has(mode)) throw new Error(`Unsupported MnemoCode record mode: ${String(mode)}.`);
  if (!formats.has(format))
    throw new Error(`Unsupported MnemoCode record format: ${String(format)}.`);
  const normalized = payload.trim();
  if (normalized.length === 0) throw new Error('A MnemoCode record payload must not be empty.');
  return `MNC${MNEMOCODE_RECORD_VERSION}:${mode}:${format}:${normalized}`;
}

/** Reads a versioned record, or returns undefined for legacy raw representations. */
export function parseRecord(value: string): MnemoCodeRecord | undefined {
  const normalized = value.trim();
  if (!normalized.startsWith('MNC')) return undefined;
  const match = recordPattern.exec(normalized);
  if (match === null) throw new Error('Malformed MnemoCode record header.');
  const version = Number(match[1]);
  if (version !== MNEMOCODE_RECORD_VERSION) {
    throw new Error(`Unsupported MnemoCode record version: ${version}.`);
  }
  const format = match[3] as RecordFormat;
  if (!formats.has(format)) throw new Error(`Unsupported MnemoCode record format: ${match[3]}.`);
  return {
    version: MNEMOCODE_RECORD_VERSION,
    mode: match[2] as RecordMode,
    format,
    payload: match[4]!,
  };
}
