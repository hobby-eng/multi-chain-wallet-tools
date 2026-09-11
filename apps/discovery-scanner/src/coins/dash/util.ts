import { PROVIDER_UNSIGNED_DECIMAL, MAX_PROVIDER_INTEGER } from '@ckd/core/numeric-limits.js';
import type { RecoveryMetric, RecoveryNetwork, RecoverySection, RecoverySectionId } from '../../types.js';
import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { requireRecord } from '@ckd/core/records.js';
import { describeUnknownError } from '../../error-message.js';
import type { RecoveryNetworkGateway } from '../../network-gateway.js';

export {
  formatDashCredits as formatDashFromCredits,
  formatDashDuffs as formatDashFromDuffs,
} from '@ckd/core/dash-units.js';
export const ADDRESS_DISCOVERY_GAP = 20;

export function extendAddressTarget(currentTarget: number, usedIndex: number): { target: number; truncated: boolean } {
  const maximumCount = MAX_BIP32_INDEX + 1;
  const desired = usedIndex + 1 + ADDRESS_DISCOVERY_GAP;
  return {
    target: Math.max(currentTarget, Math.min(maximumCount, desired)),
    truncated: desired > maximumCount,
  };
}

export function object(value: unknown, context: string): Record<string, unknown> {
  return requireRecord(value, `${context} returned malformed data.`);
}

export function exactUnsigned(value: unknown, context: string): bigint {
  if (typeof value === 'bigint' && value >= 0n && value <= MAX_PROVIDER_INTEGER) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && PROVIDER_UNSIGNED_DECIMAL.test(value)) return BigInt(value);
  throw new Error(`${context} is not an exact non-negative integer.`);
}

export function exactSafeInteger(value: unknown, context: string): number {
  const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${context} is not a safe non-negative integer.`);
  }
  return number;
}

/**
 * Shared DashScan Core address batch/history plumbing. Both the standard
 * BIP44 scanner and the optional Dash Mobile CoinJoin · DIP9 scanner query the exact same
 * `/addresses/info` and `/address/:address` DashScan operations for locally
 * derived P2PKH addresses; only the derivation path differs. Reusing these
 * validators avoids a second, independently-risky parse of network responses.
 */
export interface DashScanAddressInfo {
  balance: bigint;
  txCount: number;
}

export interface DashScanHistorySummary {
  txCount: number;
  received: bigint;
  sent: bigint;
  firstSeen: string | null;
  lastSeen: string | null;
}

function optionalTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function validateDashScanAddressHistory(value: unknown, expectedAddress: string): DashScanHistorySummary {
  const history = object(value, 'DashScan address history summary');
  if (history.address !== expectedAddress) throw new Error('DashScan address history did not match the requested address.');
  return {
    txCount: exactSafeInteger(history.txCount, 'DashScan address history transaction count'),
    received: exactUnsigned(history.received, 'DashScan lifetime received amount'),
    sent: exactUnsigned(history.sent, 'DashScan lifetime sent amount'),
    firstSeen: optionalTimestamp(history.firstSeenBlockTimestamp),
    lastSeen: optionalTimestamp(history.lastSeenBlockTimestamp),
  };
}

export function validateDashScanAddressBatch(value: unknown, expectedAddresses: readonly string[]): DashScanAddressInfo[] {
  if (!Array.isArray(value) || value.length !== expectedAddresses.length) {
    throw new Error('DashScan address batch did not preserve the requested result count.');
  }
  return value.map((item, index) => {
    const info = object(item, 'DashScan address batch');
    if (info.address !== expectedAddresses[index]) {
      throw new Error('DashScan address batch did not preserve the locally derived address order.');
    }
    return {
      balance: exactUnsigned(info.balance, 'DashScan address balance'),
      txCount: exactSafeInteger(info.txCount, 'DashScan address transaction count'),
    };
  });
}

export async function fetchDashScanIndexedHeight(
  gateway: RecoveryNetworkGateway,
  network: RecoveryNetwork,
  signal: AbortSignal,
): Promise<number> {
  const status = object(await gateway.runPublic(
    { network },
    'core.status',
    () => gateway.networkApi.coreStatus(network, signal),
    signal,
  ), 'DashScan status');
  if (status.status !== 'ok') throw new Error('DashScan reports that its index is not synchronized.');

  const tipPage = object(
    await gateway.runPublic(
      { network },
      'core.tip',
      () => gateway.networkApi.coreTip(network, signal),
      signal,
    ),
    'DashScan block page',
  );
  const tipItems = Array.isArray(tipPage.resultSet) ? tipPage.resultSet : [];
  if (tipItems.length !== 1) throw new Error('DashScan did not return exactly one indexed tip.');
  const tip = object(tipItems[0], 'DashScan indexed tip');
  return exactSafeInteger(tip.height, 'DashScan indexed height');
}

export function failedSection(id: RecoverySectionId, title: string, description: string, cause: unknown): RecoverySection {
  const message = describeUnknownError(cause);
  const metrics: RecoveryMetric[] = [{ label: 'Status', value: 'Stopped', tone: 'warning' }];
  return {
    id,
    title,
    description,
    state: 'failed',
    metrics,
    findings: [],
    scanned: 0,
    source: 'Unavailable',
    proof: 'Not completed',
    warning: message,
  };
}
