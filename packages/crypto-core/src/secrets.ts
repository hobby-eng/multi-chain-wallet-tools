import type { DerivationResult } from './types.js';

/** Best-effort clearing for mutable derivation result containers. */
export function clearDerivationResult(result: DerivationResult | null): void {
  if (result === null) return;
  for (const field of result.basicSummary) field.value = '';
  for (const field of result.summary) field.value = '';
  if (result.watchOnly !== undefined) result.watchOnly.text = '';
  for (const row of result.rows) {
    row.path = '';
    for (const field of [...row.basic, ...row.advanced]) field.value = '';
    row.basic.length = 0;
    row.advanced.length = 0;
  }
  result.basicSummary.length = 0;
  result.summary.length = 0;
  result.rows.length = 0;
  result.notices.length = 0;
}
