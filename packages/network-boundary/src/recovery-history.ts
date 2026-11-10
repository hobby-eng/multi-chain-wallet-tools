import type { RecoveryHistory } from "./data-types.js";

/** Date fields cleared together whenever provider history is incomplete. */
export const RECOVERY_HISTORY_DATE_FIELDS = [
  "firstSeen",
  "lastSeen",
  "firstReceived",
  "lastReceived",
  "firstSpent",
  "lastSpent",
] as const satisfies readonly (keyof RecoveryHistory)[];

/** Creates a neutral history result before a coin provider fills reviewed fields. */
export function emptyRecoveryHistory(asset = "", atomicUnit = "", decimals = 0): RecoveryHistory {
  return {
    status: "unavailable",
    source: "",
    scope: "",
    note: "",
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

/**
 * The history of an address whose current state alone the tools read (`read`, such as "balance
 * and account nonce", from `source`): unsupported, never empty, so that its totals and dates stay
 * unknown rather than zero.
 */
export function balanceOnlyHistory(
  unit: { readonly asset: string; readonly atomicUnit: string; readonly decimals: number },
  label: string,
  source: string,
  read: string,
): RecoveryHistory {
  return {
    ...emptyRecoveryHistory(unit.asset, unit.atomicUnit, unit.decimals),
    status: "unsupported",
    source,
    scope: `Current ${read}`,
    note: `${label}: ${read} only. Its transaction history is not read, so received and sent totals and dates are unknown.`,
  };
}
