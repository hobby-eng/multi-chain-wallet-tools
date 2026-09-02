import type { ShieldedActivity } from '@ckd/dash-network/types.js';

/** Discovery always processes full history; this controls only UI/export rows. */
export function shouldDisplayShieldedActivity(record: ShieldedActivity, includeHistory: boolean): boolean {
  return includeHistory || (record.incoming !== undefined && record.spent === false);
}
