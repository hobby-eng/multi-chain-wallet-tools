import type { RecoveryMetric, RecoverySection, RecoverySectionId } from '../../types.js';
import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { requireRecord } from '@ckd/core/records.js';
import { describeUnknownError } from '../../error-message.js';

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
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)) return BigInt(value);
  throw new Error(`${context} is not an exact non-negative integer.`);
}

export function exactSafeInteger(value: unknown, context: string): number {
  const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${context} is not a safe non-negative integer.`);
  }
  return number;
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
