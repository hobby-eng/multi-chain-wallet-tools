import type { DerivationResult, ResultField } from '@ckd/core/types.js';

export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

export function value(fields: ResultField[], key: string): string {
  const match = fields.find((field) => field.key === key);
  if (match === undefined) throw new Error(`Missing result field: ${key}`);
  return match.value;
}

export function rowValue(result: DerivationResult, key: string, row = 0): string {
  const item = result.rows[row];
  if (item === undefined) throw new Error(`Missing result row: ${row}`);
  return value([...item.basic, ...item.advanced], key);
}
