import type { RecoveryHistory } from './data-types.js';

/** Creates a neutral history result before a coin provider fills reviewed fields. */
export function emptyRecoveryHistory(asset = '', atomicUnit = '', decimals = 0): RecoveryHistory {
  return {
    status: 'unavailable',
    source: '',
    scope: '',
    note: '',
    asset,
    atomicUnit,
    decimals,
    totalReceivedAtomic: null,
    totalSentAtomic: null,
    totalFeesAtomic: null,
    firstSeen: null,
    lastSeen: null,
    firstReceived: null,
    lastReceived: null,
    firstSpent: null,
    lastSpent: null,
    transactionCount: null,
    pendingTransactionCount: null,
  };
}
