import { ShieldedActivityState } from "@ckd/dash-network/shielded-activity-state.js";
import type { ShieldedActivity, ViewerKeyKind } from "@ckd/dash-network/types.js";
import { formatDashFromCredits } from "./util.js";

export function shieldedFindingPresentation(
  record: ShieldedActivity,
  complete: boolean,
  keyKind: ViewerKeyKind = "full",
): {
  balanceAtomic: bigint | null;
  balanceLabel: string;
  spendState: string;
} {
  if (record.incoming === undefined) {
    return {
      balanceAtomic: null,
      balanceLabel: "Current balance unavailable · outgoing view only",
      spendState: "Outgoing view only",
    };
  }
  const spendStatus = ShieldedActivityState.noteSpendStatus(record, complete, keyKind);
  if (spendStatus === "spent") {
    return {
      balanceAtomic: 0n,
      balanceLabel: "0 DASH · already spent",
      spendState: "Spent",
    };
  }
  if (spendStatus === "spendable") {
    return {
      balanceAtomic: record.incoming.value,
      balanceLabel: formatDashFromCredits(record.incoming.value),
      spendState: "Unspent",
    };
  }
  if (keyKind === "full" && !complete) {
    return {
      balanceAtomic: null,
      balanceLabel: "Current balance unavailable · scan incomplete",
      spendState: "Unknown · scan incomplete",
    };
  }
  return {
    balanceAtomic: null,
    balanceLabel: "Current balance unavailable · spend state unknown",
    spendState: "Unknown · FVK required",
  };
}
