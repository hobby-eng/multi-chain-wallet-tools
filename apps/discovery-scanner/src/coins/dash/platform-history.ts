import type { PlatformHistorySummaryView } from '../../network-protocol.js';
import { exactSafeInteger, exactUnsigned, object } from './util.js';

export interface ValidatedPlatformHistory {
  transactionCount: number;
  incomingCount: number;
  outgoingCount: number;
  totalReceived: bigint;
  totalSent: bigint;
  totalFees: bigint | null;
  firstSeen: string | null;
  lastSeen: string | null;
  indexedHeight: number;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Isolated Platform history returned an invalid ${label}.`);
  }
  return value;
}

export function validatePlatformHistory(
  value: PlatformHistorySummaryView,
  expectedResource: string,
  expectedBalance: bigint,
): ValidatedPlatformHistory {
  const history = object(value, 'Isolated Platform history response');
  if (history.resource !== expectedResource) throw new Error('Isolated Platform history returned the wrong resource.');
  const balance = exactUnsigned(history.balance, 'Platform history balance');
  if (balance !== expectedBalance) throw new Error('Platform Explorer balance did not match the proof-verified DAPI balance.');
  return {
    transactionCount: exactSafeInteger(history.transactionCount, 'Platform history transaction count'),
    incomingCount: exactSafeInteger(history.incomingCount, 'Platform history incoming count'),
    outgoingCount: exactSafeInteger(history.outgoingCount, 'Platform history outgoing count'),
    totalReceived: exactUnsigned(history.totalReceived, 'Platform history received amount'),
    totalSent: exactUnsigned(history.totalSent, 'Platform history sent amount'),
    totalFees: history.totalFees === null ? null : exactUnsigned(history.totalFees, 'Platform history fee amount'),
    firstSeen: optionalTimestamp(history.firstSeen, 'first-seen timestamp'),
    lastSeen: optionalTimestamp(history.lastSeen, 'last-seen timestamp'),
    indexedHeight: exactSafeInteger(history.indexedHeight, 'Platform history indexed height'),
  };
}
