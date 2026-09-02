import type { DerivationResult, ResultField } from '@ckd/core/types.js';

export function resultValue(result: DerivationResult, key: string): string {
  const fields: ResultField[] = [
    ...result.basicSummary,
    ...result.summary,
    ...(result.rows[0] === undefined ? [] : [...result.rows[0].basic, ...result.rows[0].advanced]),
  ];
  const match = fields.find((field) => field.key === key);
  if (match === undefined) throw new Error(`Self-test result is missing ${key}.`);
  return match.value;
}

export function expectEqual(check: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`Cryptographic self-test failed: ${check}.`);
}

export function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
