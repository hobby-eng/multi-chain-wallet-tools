import type { ViewerBatchInput } from './batch.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

export function renderActivityResult(view: ActivityViewerView, state: ViewerSingleExportState): void {
  if (state.mode === 'core') view.renderCore(state.snapshot);
  else if (state.mode === 'platform') view.renderPlatform(state.snapshot, state.history);
  else if (state.mode === 'identity') view.renderIdentity(state.snapshot, state.histories);
  else view.renderShielded(state.snapshot);
}

export function compactActivityLabel(value: string, maxLength = 34): string {
  if (value.length <= maxLength) return value;
  const edge = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

export function activityBatchResultLabel(
  input: ViewerBatchInput,
  state: ViewerSingleExportState,
  index: number,
): string {
  const number = `${index + 1}`;
  if (state.mode === 'shielded') return `${number} · ORCHARD · ${state.snapshot.keyKind.toUpperCase()} viewing key`;
  if (state.mode === 'identity') {
    const identity = state.snapshot.identities[0];
    const label = identity?.dpnsNames[0] ?? identity?.identifier ?? `No match · line ${input.line}`;
    return `${number} · IDENTITY · ${compactActivityLabel(label)}`;
  }
  return `${number} · ${state.mode.toUpperCase()} · ${compactActivityLabel(state.snapshot.address)}`;
}
