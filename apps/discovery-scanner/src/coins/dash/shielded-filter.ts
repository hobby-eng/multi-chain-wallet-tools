import { ShieldedActivityState } from "@ckd/dash-network/shielded-activity-state.js";
import type { ShieldedActivity, ViewerKeyKind } from "@ckd/dash-network/types.js";

/** Discovery always processes full history; this controls only UI/export rows. */
export function shouldDisplayShieldedActivity(
  record: ShieldedActivity,
  includeHistory: boolean,
  complete = true,
  keyKind: ViewerKeyKind = "full",
): boolean {
  return (
    includeHistory ||
    (record.incoming !== undefined &&
      ShieldedActivityState.noteSpendStatus(record, complete, keyKind) !== "spent")
  );
}
