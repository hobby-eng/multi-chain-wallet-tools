import { PROVIDER_UNSIGNED_DECIMAL } from '@ckd/core/numeric-limits.js';

export function platformRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Platform Explorer returned malformed ${context}.`);
  }
  return value as Record<string, unknown>;
}

export function platformDecimal(value: unknown, context: string, nullAsZero = false): string {
  if (nullAsZero && (value === null || value === undefined)) return '0';
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !PROVIDER_UNSIGNED_DECIMAL.test(text)) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return text;
}

export function platformUnsignedInteger(value: unknown, context: string): number {
  const numeric = typeof value === 'string' && PROVIDER_UNSIGNED_DECIMAL.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return numeric;
}

export function platformTimestamp(value: unknown, context: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return value;
}

export function platformPageItems(
  value: unknown,
  context: string,
): { items: Record<string, unknown>[]; total: number } {
  const page = platformRecord(value, context);
  if (!Array.isArray(page.resultSet)) throw new Error(`Platform Explorer ${context} omitted its result set.`);
  const items = page.resultSet.map((item) => platformRecord(item, `${context} item`));
  const pagination = platformRecord(page.pagination, `${context} pagination`);
  return { items, total: platformUnsignedInteger(pagination.total, `${context} total`) };
}

export function platformPageTimestamp(value: unknown, context: string): string | null {
  const { items } = platformPageItems(value, context);
  if (items.length === 0) return null;
  return platformTimestamp(items[0]?.timestamp, `${context} timestamp`);
}
