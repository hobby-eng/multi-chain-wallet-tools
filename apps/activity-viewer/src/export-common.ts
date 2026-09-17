import type { ViewerBatchExportError, ViewerBatchExportState, ViewerExportState } from './export-model.js';

export function exactJson(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function fileStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

export function isBatchExportState(state: ViewerExportState): state is ViewerBatchExportState {
  return 'batch' in state && state.batch;
}

export function exportError(
  error: ViewerBatchExportError,
  fallbackMode?: ViewerBatchExportState['mode'],
): ViewerBatchExportError {
  const mode = error.mode ?? (fallbackMode === 'mixed' ? undefined : fallbackMode);
  const ordinal = Number(error.id.replace(/\D/gu, ''));
  if (mode === undefined) {
    return {
      id: error.id,
      label: `${Number.isFinite(ordinal) ? ordinal : '?'} · AUTO · invalid input`,
      message: 'Automatic input detection failed. Raw input is omitted from exports.',
    };
  }
  if (mode !== 'shielded') return error;
  return {
    id: error.id,
    label: `${Number.isFinite(ordinal) ? ordinal : '?'} · ORCHARD · viewing key`,
    message: 'Orchard lookup failed. Viewing-key input is omitted from exports.',
    mode,
  };
}
