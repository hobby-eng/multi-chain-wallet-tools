import type { RecoveryField, RecoveryHistory } from './types.js';

export function emptyHistory(asset = '', atomicUnit = '', decimals = 0): RecoveryHistory {
  return { status: 'unavailable', source: '', scope: '', note: '', asset, atomicUnit, decimals,
    totalReceivedAtomic: null, totalSentAtomic: null, totalFeesAtomic: null,
    firstSeen: null, lastSeen: null, firstReceived: null, lastReceived: null, firstSpent: null, lastSpent: null,
    transactionCount: null, pendingTransactionCount: null };
}

/** Validate and project the worker response; no unrecognized network fields reach exports. */
export function validateHistory(value: RecoveryHistory): RecoveryHistory {
  const h = emptyHistory();
  if (!value || !['complete', 'partial', 'unavailable', 'unsupported'].includes(value.status)) throw new Error('Invalid history status.');
  h.status = value.status;
  for (const key of ['source', 'scope', 'note', 'asset', 'atomicUnit'] as const) {
    if (typeof value[key] !== 'string' || value[key].length > 2000) throw new Error('Invalid history metadata.');
    h[key] = value[key];
  }
  if (!Number.isSafeInteger(value.decimals) || value.decimals < 0 || value.decimals > 30) throw new Error('Invalid history units.');
  h.decimals = value.decimals;
  for (const key of ['totalReceivedAtomic', 'totalSentAtomic', 'totalFeesAtomic'] as const) {
    const amount = value[key];
    if (amount !== null && (typeof amount !== 'string' || !/^(0|[1-9][0-9]{0,99})$/u.test(amount))) throw new Error('Invalid history amount.');
    h[key] = amount;
  }
  for (const key of ['firstSeen', 'lastSeen', 'firstReceived', 'lastReceived', 'firstSpent', 'lastSpent'] as const) {
    const date = value[key];
    if (date !== null && (typeof date !== 'string' || !/Z$/u.test(date) || !Number.isFinite(Date.parse(date)))) throw new Error('Invalid history date.');
    h[key] = date === null ? null : new Date(date).toISOString();
  }
  for (const key of ['transactionCount', 'pendingTransactionCount'] as const) {
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key]! < 0)) throw new Error('Invalid history count.');
    h[key] = value[key];
  }
  return h;
}

export function historyAmount(atomic: string, h: RecoveryHistory): string {
  const digits = atomic.padStart(h.decimals + 1, '0');
  const whole = h.decimals === 0 ? digits : digits.slice(0, -h.decimals);
  const fraction = h.decimals === 0 ? '' : digits.slice(-h.decimals).replace(/0+$/u, '');
  return `${whole}${fraction ? `.${fraction}` : ''} ${h.asset}`;
}

export function historyFields(h: RecoveryHistory): RecoveryField[] {
  const fields: RecoveryField[] = [{ label: 'History coverage', value: `${h.status}${h.scope ? ` · ${h.scope}` : ''}` }];
  for (const [key, label] of [['totalReceivedAtomic', 'Total received'], ['totalSentAtomic', 'Total sent'], ['totalFeesAtomic', 'Fees paid']] as const) {
    fields.push({ label, value: h[key] === null ? 'Not available' : historyAmount(h[key]!, h) });
  }
  for (const [key, label] of [['firstSeen', 'First seen'], ['lastSeen', 'Last seen']] as const) {
    fields.push({ label, value: h[key] === null ? 'Not available' : `${h[key]!.replace('T', ' ').replace(/(?:\.000)?Z$/u, '')} UTC` });
  }
  if (h.transactionCount !== null) fields.push({ label: 'History transactions', value: String(h.transactionCount) });
  if (h.pendingTransactionCount !== null) fields.push({ label: 'Pending transactions', value: String(h.pendingTransactionCount) });
  if (h.source) fields.push({ label: 'History source', value: h.source });
  if (h.note) fields.push({ label: 'History details', value: h.note });
  return fields;
}
