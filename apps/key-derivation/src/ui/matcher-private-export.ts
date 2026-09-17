import type { ResultField } from '@ckd/core/types.js';

/** Union field columns across protocols without embedding labels in secret cells. */
export function matcherPrivateTsv(
  rows: readonly (readonly string[])[],
  fields: readonly (readonly ResultField[])[],
): string {
  if (rows.length !== fields.length) throw new Error('Private export rows are not aligned.');
  const identity = (field: ResultField): string => `${field.key}\0${field.label}`;
  const columns = [...new Map(fields.flatMap((set) => set.map((field) => [identity(field), field] as const))).values()];
  const values = rows.map((row, index) => {
    const set = new Map(fields[index]!.map((field) => [identity(field), field.value]));
    return [...row, ...columns.map((field) => set.get(identity(field)) ?? '')];
  });
  return [['Seed', 'Known address', 'Wallet structure', 'Path', ...columns.map((field) => field.label)], ...values]
    .map((row) => row.map((value) => value.replace(/[\t\r\n]/gu, ' ')).join('\t'))
    .join('\n');
}
