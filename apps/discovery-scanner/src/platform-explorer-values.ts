import { providerValues } from "@ckd/core/provider-values.js";

export const {
  record: platformRecord,
  decimal: platformDecimal,
  unsignedInteger: platformUnsignedInteger,
  timestamp: platformTimestamp,
} = providerValues("Platform Explorer");

export function platformPageItems(
  value: unknown,
  context: string,
): { items: Record<string, unknown>[]; total: number } {
  const page = platformRecord(value, context);
  if (!Array.isArray(page.resultSet))
    throw new Error(`Platform Explorer ${context} omitted its result set.`);
  const items = page.resultSet.map((item) => platformRecord(item, `${context} item`));
  const pagination = platformRecord(page.pagination, `${context} pagination`);
  return { items, total: platformUnsignedInteger(pagination.total, `${context} total`) };
}

export function platformPageTimestamp(value: unknown, context: string): string | null {
  const { items } = platformPageItems(value, context);
  if (items.length === 0) return null;
  return platformTimestamp(items[0]?.timestamp, `${context} timestamp`);
}
